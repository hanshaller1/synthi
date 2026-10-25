import { filterLevels } from "./filter-config";
import type { FilterFrequencyReading } from "./filter-meter";
import type { Param, Patch } from "./model";
import { noteName } from "./model";
import type { ModulationReading } from "./modulation-worklet";
import { DYNAMIC_META } from "./parameter-spec";
import { PARAMETER_REGISTRY, getParameter, setParameters } from "./parameters";
import { createModulationRanges } from "./modulation-range";
import { MOD_SOURCES } from "./modulation-spec";
import type { ModSourceMeta } from "./modulation-spec";

export type VoiceModulationReading={id:number;note:number;released:boolean;patch:Patch;sampledPatch?:Patch;reading?:ModulationReading;sampled?:ModulationReading;grains?:GrainModulationReading[]};
export type GrainModulationReading={id:number;start:number;end:number;frozen:boolean;reading:ModulationReading};
export type FilterModulationReading={reading:FilterFrequencyReading;branch:number;voice?:number;note?:number;patch:Patch;velocity:number;velocityScale:number;base:number;depth:number;low:number;high:number};
export type ModulationReadings={time:number;running:boolean;voices:VoiceModulationReading[];filters:FilterModulationReading[];sampleRate:number;clock?:ModulationReading;fx?:ModulationReading};
export type ModulationPoint={value:number;base:number;label:string;voice?:number;sampled:boolean;grain?:number};
export type ControlModulation={min:number;max:number;points:ModulationPoint[];routes:string[];voices:number;grains:number;routed:boolean};
const EMPTY:ModulationReadings={time:0,running:false,voices:[],filters:[],sampleRate:48000};
export const canonicalParameter=(id:string)=>DYNAMIC_META[id as keyof typeof DYNAMIC_META]?.canonical??id;
const sourceName=(source:string)=>(MOD_SOURCES as Record<string,ModSourceMeta>)[source]?.label??source;

/** Display-only store. Frames notify imperative overlays, not the React tree.
 * No time-varying oscillator/envelope is recreated here. Values are never rebuilt
 * from sources in the UI; missing telemetry means a static range, no marker. */
export class ModulationDisplayStore {
  private reading:ModulationReadings=EMPTY;
  private listeners=new Set<()=>void>();
  private ranges=new WeakMap<Patch,ReturnType<typeof createModulationRanges>>();
  private frameCache=new Map<Patch,Map<string,ControlModulation>>();
  private dataPatches=new WeakMap<ModulationReading,WeakMap<Patch,Patch>>();
  constructor(private patch:Patch){}
  get observed(){return this.listeners.size>0;}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  getFx=()=>this.reading.running&&this.reading.fx&&this.reading.time-this.reading.fx.time<=.3?this.reading.fx:undefined;
  setPatch(patch:Patch){this.patch=patch;this.notify();}
  update(reading:ModulationReadings|undefined){this.reading=reading??EMPTY;this.notify();}
  clear(){this.reading=EMPTY;this.notify();}
  private notify(){this.frameCache.clear();for(const listener of this.listeners)listener();}
  private range(patch:Patch,id:Param,base:number){
    let calculate=this.ranges.get(patch);if(!calculate){calculate=createModulationRanges(patch);this.ranges.set(patch,calculate);}
    return calculate(id,base);
  }
  private cutoffRange(patch:Patch,base:number,envelope?:{low:number;high:number;depth:number;velocityScale:number;note?:number}){
    const levels=filterLevels({...patch,cutoff:base});
    const low=envelope?.low??Math.min(levels.base,levels.peak,levels.sustain),high=envelope?.high??Math.max(levels.base,levels.peak,levels.sustain);
    const cutoff=this.range(patch,"cutoff",base),depth=this.range(patch,"filterAmount",patch.filterAmount);
    const comb=patch.filterType==="comb",track=this.range(patch,comb?"combKeytrack":"filterKeytrack",comb?patch.combKeytrack:patch.filterKeytrack);
    const fine=comb?this.range(patch,"combFine",patch.combFine):{min:0,max:0,routed:false};
    const spread=comb?this.range(patch,"combSpread",patch.combSpread):{min:0,max:0,routed:false};
    const tracked=envelope?.note===undefined?undefined:(envelope.note-60)*100;
    const lowerCents=(tracked===undefined?-6000*track.max:Math.min(tracked*track.min,tracked*track.max))+fine.min-spread.max/2;
    const upperCents=(tracked===undefined?6700*track.max:Math.max(tracked*track.min,tracked*track.max))+fine.max+spread.max/2;
    const velocityScale=envelope?.velocityScale??1;
    const min=Math.max(0,low+cutoff.min-base)*2**(Math.min(0,depth.min-patch.filterAmount)*velocityScale+lowerCents/1200);
    const max=Math.min(this.reading.sampleRate/2,(high+cutoff.max-base)*2**(Math.max(0,depth.max-patch.filterAmount)*velocityScale+upperCents/1200));
    return {min,max,routed:cutoff.routed||depth.routed||track.routed||fine.routed||spread.routed||(envelope?.depth??patch.filterAmount)!==0||track.max!==0||fine.min!==0||fine.max!==0||spread.max!==0};
  }
  private rangePatch(data:ModulationReading,patch:Patch){
    if(!data.bases)return patch;
    let cache=this.dataPatches.get(data);if(!cache){cache=new WeakMap();this.dataPatches.set(data,cache);}
    const saved=cache.get(patch);if(saved)return saved;
    const values=Object.fromEntries(Object.entries(data.bases).filter(([id])=>PARAMETER_REGISTRY[id as Param]?.scope==="generator"));
    const result={...setParameters(patch,values),modVersion:patch.modVersion};cache.set(patch,result);return result;
  }
  control(id:Param,base:number,displayPatch=this.patch):ControlModulation|null{
    const key=canonicalParameter(id) as Param,meta=PARAMETER_REGISTRY[id];if(!meta)return null;
    const cacheKey=`${id}:${base}`;let cache=this.frameCache.get(displayPatch);if(!cache){cache=new Map();this.frameCache.set(displayPatch,cache);}
    const cached=cache.get(cacheKey);if(cached)return cached;
    const own=DYNAMIC_META[id as keyof typeof DYNAMIC_META],reading=this.reading;
    const points:ModulationPoint[]=[],routes=new Set<string>();
    let min=base,max=base,routed=false;
    const liveFilters=key==="cutoff"&&reading.running?reading.filters.filter(f=>reading.time-f.reading.time<=.3&&f.reading.time<=reading.time+.02):[];
    const include=(patch:Patch,rootBase:number,envelope?:FilterModulationReading)=>{
      const bounds=key==="cutoff"&&(envelope||!liveFilters.length)?this.cutoffRange(patch,rootBase,envelope):this.range(patch,id,rootBase);
      if(key==="cutoff"&&(envelope||!liveFilters.length)&&(envelope?.depth??patch.filterAmount)!==0)routes.add(`Interne Filter-ADSR · Env Depth ${(envelope?.depth??patch.filterAmount).toFixed(2)} oct`);
      if(bounds.routed){min=Math.min(min,bounds.min);max=Math.max(max,bounds.max);routed=true;}
      patch.mods.forEach((route,index)=>{
        if(!route.amount||canonicalParameter(route.target)!==key&&!(key==="cutoff"&&["filterAmount","filterKeytrack","combKeytrack","combFine","combSpread"].includes(route.target)))return;
        const variant=DYNAMIC_META[route.target as keyof typeof DYNAMIC_META]?.variant;
        routes.add(`Route ${index+1} · ${sourceName(route.source)} · ${route.amount>0?"+":""}${+(route.amount*100).toFixed(2)}%${route.curve&&route.curve!=="linear"?` · ${route.curve}`:""}${variant?` · ${variant}`:""}`);
      });
    };
    include(displayPatch,base);
    const add=(data:ModulationReading|undefined,patch:Patch,label:string,voice?:number,sampled=false,grain?:number)=>{
      if(!data||!reading.running||!sampled&&(reading.time-data.time>.3||data.time>reading.time+.02))return;
      // FX aliases describe the active variant only. An inactive base-variant
      // control must not masquerade as that variant's audible DSP value.
      if(own?.slot&&own.variant&&data.variants?.[own.slot]!==undefined&&data.variants[own.slot]!==own.variant)return;
      if(meta.scope==="fx"&&data.confirmed&&!data.confirmed.includes(id)&&!data.confirmed.includes(key))return;
      const value=data.values[id]??data.values[key];if(!Number.isFinite(value))return;
      const rootBase=data.bases?.[id]??data.bases?.[key]??getParameter(patch,id);
      include(this.rangePatch(data,patch),rootBase);
      const clamped=Math.max(meta.min,Math.min(meta.max,value));
      min=Math.min(min,rootBase,clamped);max=Math.max(max,rootBase,clamped);
      points.push({value:clamped,base:rootBase,label,voice,sampled,grain});
    };
    if(meta.scope==="fx")add(reading.fx,displayPatch,"Track-FX");
    else if(key==="cutoff"){
      for(const filter of liveFilters){
        const data=filter.reading;if(reading.time-data.time>.3||data.time>reading.time+.02)continue;
        include(filter.patch,filter.base,filter);
        for(let channel=0;channel<data.frequencies.length;channel++){
          const value=data.frequencies[channel];if(!Number.isFinite(value))continue;
          const owner=filter.voice!==undefined?`${noteName(filter.note!)} · Stimme ${filter.voice}`:"Paraphon · gemeinsamer Track-Filter";
          const stereo=data.frequencies.length>1?channel?" · R":" · L":"";
          points.push({value,base:filter.base,label:`${owner} · Filterzweig ${filter.branch}${stereo} · Env ${filter.depth.toFixed(2)} oct · Vel ${Math.round(filter.velocity*127)}${value<meta.min||value>meta.max?" · am Skalenrand":""}`,voice:filter.voice,sampled:false});
          min=Math.min(min,value);max=Math.max(max,value);
        }
      }
    }
    else{
      for(const voice of reading.voices){
        const label=`${noteName(voice.note)} · Stimme ${voice.id}${voice.released?" · Release":""}`;
        if(meta.evaluation==="grain"){
          for(const grain of voice.grains??[])if(grain.start<=reading.time&&reading.time<grain.end)
            add(grain.reading,voice.patch,`${label} · Grain ${grain.id}${grain.frozen?" · Freeze":""}`,voice.id,true,grain.id);
        }
        else if(voice.sampled?.values[key]!==undefined)add(voice.sampled,voice.sampledPatch??voice.patch,`${label} · beim Anschlag`,voice.id,true);
        else add(voice.reading,voice.patch,label,voice.id);
      }
      if(meta.scope==="generator"&&!points.length)add(reading.clock,displayPatch,"Track-Clock");
    }
    min=Math.max(meta.min,min);max=Math.min(meta.max,max);
    const result={min,max,points,routes:[...routes],voices:new Set(points.filter(p=>p.voice!==undefined).map(p=>p.voice)).size,grains:points.filter(p=>p.grain!==undefined).length,routed};
    cache.set(cacheKey,result);return result;
  }
}
