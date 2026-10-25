import type { Param, Patch } from "./model";
import { noteName } from "./model";
import type { ModulationReading } from "./modulation-worklet";
import { DYNAMIC_META } from "./parameter-spec";
import { PARAMETER_REGISTRY, getParameter, setParameters } from "./parameters";
import { createModulationRanges } from "./modulation-range";
import { MOD_SOURCES } from "./modulation-spec";
import type { ModSourceMeta } from "./modulation-spec";

export type VoiceModulationReading={id:number;note:number;released:boolean;patch:Patch;sampledPatch?:Patch;reading?:ModulationReading;sampled?:ModulationReading;grains?:ModulationReading};
export type ModulationReadings={time:number;running:boolean;voices:VoiceModulationReading[];clock?:ModulationReading;fx?:ModulationReading};
export type ModulationPoint={value:number;base:number;label:string;voice?:number;sampled:boolean};
export type ControlModulation={min:number;max:number;points:ModulationPoint[];routes:string[];voices:number;routed:boolean};
const EMPTY:ModulationReadings={time:0,running:false,voices:[]};
export const canonicalParameter=(id:string)=>DYNAMIC_META[id as keyof typeof DYNAMIC_META]?.canonical??id;
const sourceName=(source:string)=>(MOD_SOURCES as Record<string,ModSourceMeta>)[source]?.label??source;

/** Display-only store. Frames notify imperative overlays, not the React tree.
 * No oscillator/envelope is evaluated here. Reported values are never rebuilt
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
    const include=(patch:Patch,rootBase:number)=>{
      const bounds=this.range(patch,id,rootBase);
      if(bounds.routed){min=Math.min(min,bounds.min);max=Math.max(max,bounds.max);routed=true;}
      patch.mods.forEach((route,index)=>{
        if(!route.amount||canonicalParameter(route.target)!==key)return;
        const variant=DYNAMIC_META[route.target as keyof typeof DYNAMIC_META]?.variant;
        routes.add(`Route ${index+1} · ${sourceName(route.source)} · ${route.amount>0?"+":""}${+(route.amount*100).toFixed(2)}%${route.curve&&route.curve!=="linear"?` · ${route.curve}`:""}${variant?` · ${variant}`:""}`);
      });
    };
    include(displayPatch,base);
    const add=(data:ModulationReading|undefined,patch:Patch,label:string,voice?:number,sampled=false)=>{
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
      points.push({value:clamped,base:rootBase,label,voice,sampled});
    };
    if(meta.scope==="fx")add(reading.fx,displayPatch,"Track-FX");
    else{
      for(const voice of reading.voices){
        const label=`${noteName(voice.note)} · Stimme ${voice.id}${voice.released?" · Release":""}`;
        if(voice.grains?.values[key]!==undefined)add(voice.grains,voice.patch,`${label} · pro Grain`,voice.id,true);
        else if(voice.sampled?.values[key]!==undefined)add(voice.sampled,voice.sampledPatch??voice.patch,`${label} · beim Anschlag`,voice.id,true);
        else add(voice.reading,voice.patch,label,voice.id);
      }
      if(meta.scope==="generator"&&!points.length)add(reading.clock,displayPatch,"Track-Clock");
    }
    min=Math.max(meta.min,min);max=Math.min(meta.max,max);
    const result={min,max,points,routes:[...routes],voices:points.filter(p=>p.voice!==undefined).length,routed};
    cache.set(cacheKey,result);return result;
  }
}
