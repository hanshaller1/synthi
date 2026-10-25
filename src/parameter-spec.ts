import { FX_CONTROLS, FX_SLOT_MODES, FX_PARAMETERS } from "./fx-spec";
import { LFO_FIELDS, LFO_MODES, LFO_SHAPES } from "./modulation-spec";
import type { DynamicParam, LfoField } from "./modulation-spec";
import type { FxSlot, Modulation, Numbers, Param, Patch } from "./model";
export type ParameterMeta = {
  label:string; group:string; trigger:boolean; min:number; max:number; default:number;
  scale:"linear"|"log"; scope:"voice"|"fx"|"generator";
  options?: readonly {value:number;label:string}[]; canonical?:string; slot?:FxSlot; variant?:string; key?:string;
};
const dynamic: Record<string,ParameterMeta> = {};
for(let i=1;i<=3;i++)for(const [key,value] of Object.entries(LFO_FIELDS)) {
  const field=value as typeof value & {log?:boolean;event?:boolean;options?:readonly {value:number;label:string}[]};
  dynamic[`lfo.${i}.${key}`]={label:`LFO ${i} · ${field.label}`,group:`LFO ${i}`,trigger:field.event??false,min:field.min,max:field.max,default:key==="rate"?[.6,2,.15][i-1]:key==="division"?[4,2,8][i-1]:key==="depth"?[.35,.25,.3][i-1]:field.default,scale:field.log?"log":"linear",scope:"generator",options:field.options,key};
}
for(const [slot,modes] of Object.entries(FX_SLOT_MODES)) {
  dynamic[`fx.${slot}.bypass`]={label:`${slot.replace("Mode","")} · Bypass`,group:"Track FX · Switching",min:0,max:1,default:1,scale:"linear",scope:"fx",trigger:true,slot:slot as FxSlot,key:"bypass",options:[{value:0,label:"On"},{value:1,label:"Bypass"}]};
  dynamic[`fx.${slot}.mode`]={label:`${slot.replace("Mode","")} · Algorithm`,group:"Track FX · Switching",min:0,max:4,default:0,scale:"linear",scope:"fx",trigger:true,slot:slot as FxSlot,key:"mode",options:modes.map((label,value)=>({label,value}))};
  for(const mode of modes)for(const control of FX_CONTROLS[mode])dynamic[`fx.${slot}.${mode}.${control.key}`]={label:`${mode} · ${control.label}`,group:`Track FX · ${slot.replace("Mode","")} · ${mode}`,min:control.min,max:control.max,default:control.default,scale:control.log?"log":"linear",scope:"fx",trigger:control.event??false,options:control.options,canonical:control.param,slot:slot as FxSlot,variant:mode,key:control.key};
}
export const DYNAMIC_META=dynamic as Record<DynamicParam,ParameterMeta>;
export const DYNAMIC_PARAMS=Object.fromEntries(Object.entries(dynamic).map(([id,v])=>[id,[v.min,v.max,v.default] as const])) as Record<DynamicParam,readonly [number,number,number]>;
export const DYNAMIC_TARGETS=Object.fromEntries(Object.entries(dynamic).map(([id,v])=>[id,{label:v.label,group:v.group,trigger:v.trigger}])) as Record<DynamicParam,{label:string;group:string;trigger:boolean}>;
export const isDynamicParameter=(id:string): id is DynamicParam => Object.hasOwn(dynamic,id);
export function getParameter(p:Patch,id:string):number {
  const meta=dynamic[id];
  if(!meta)return (p as unknown as Record<string,number>)[id]??0;
  if(id.startsWith("lfo.")) {
    const [,index,key]=id.split("."),l=p.lfos[+index-1];
    if(key==="shape")return LFO_SHAPES.indexOf(l.shape);
    if(key==="mode")return LFO_MODES.indexOf(l.mode);
    const value=l[key as keyof typeof l];
    return typeof value==="boolean"?Number(value):typeof value==="number"?value:meta.default;
  }
  const slot=meta.slot!;
  if(meta.key==="bypass")return Number(!p.fxEnabled[slot]);
  if(meta.key==="mode")return (FX_SLOT_MODES[slot] as readonly string[]).indexOf(p[slot]);
  return meta.canonical?getParameter(p,meta.canonical):p.fxSettings[meta.variant!]?.[meta.key!]??meta.default;
}
export function setParameters(p:Patch,values:Partial<Numbers>):Patch {
  const result:Patch={...p,lfos:p.lfos.map(l=>({...l})) as Patch["lfos"],fxSettings:{...p.fxSettings},fxEnabled:{...p.fxEnabled}};
  for(const [id,raw] of Object.entries(values)) {
    if(typeof raw!=="number"||!Number.isFinite(raw))continue;
    const meta=dynamic[id];if(!meta){Object.assign(result,{[id]:raw});continue;}
    let value=Math.max(meta.min,Math.min(meta.max,raw));
    if(meta.options)value=meta.options.reduce((best,o)=>Math.abs(o.value-value)<Math.abs(best-value)?o.value:best,meta.options[0].value);
    if(id.startsWith("lfo.")){
      const [,index,key]=id.split("."),l=result.lfos[+index-1];
      if(key==="shape")l.shape=LFO_SHAPES[value];else if(key==="mode")l.mode=LFO_MODES[value];
      else Object.assign(l,{[key]:key==="sync"?value>=.5:value});
      result.modVersion=2;
    }else{
      const slot=meta.slot!;
      if(meta.key==="bypass")result.fxEnabled[slot]=value<.5;
      else if(meta.key==="mode")Object.assign(result,{[slot]:FX_SLOT_MODES[slot][value]});
      else if(meta.canonical)Object.assign(result,{[meta.canonical]:value});
      else result.fxSettings[meta.variant!]={...result.fxSettings[meta.variant!],[meta.key!]:value};
      result.fxVersion=2;
    }
    delete result[id as DynamicParam];
  }
  return result;
}
const generator=(id:string)=>/^lfo[1-3]$/.test(id)?id:id==="smoothRandom"||id==="randomRate"||id==="randomSlew"?"smoothRandom":id.startsWith("lfo.")?`lfo${id.split(".")[1]}`:id.startsWith("modEnv1")?"modEnv1":id.startsWith("modEnv2")?"modEnv2":/^macro[1-4]$/.test(id)?id:"";
/** Reject feedback between control generators; synth/filter feedback is still DSP-local. */
export function validModulationRoutes(routes:Modulation[]):Modulation[] {
  const accepted:Modulation[]=[],edges=new Map<string,Set<string>>();
  const reaches=(from:string,to:string,visited=new Set<string>()):boolean=>from===to||!visited.has(from)&&(visited.add(from),[...(edges.get(from)??[])].some(next=>reaches(next,to,visited)));
  for(const route of routes.slice(0,24)) {
    const target=generator(route.target),source=generator(route.source);
    if(target&&source){if(source===target||reaches(target,source))continue;const list=edges.get(source)??new Set();list.add(target);edges.set(source,list);}
    accepted.push(route);
  }
  return accepted;
}
export function generatorOrder(routes:Modulation[]) {
  const ids=["macro1","macro2","macro3","macro4","modEnv1","modEnv2","smoothRandom","lfo1","lfo2","lfo3"],done=new Set<string>(),order:string[]=[];
  const visit=(id:string)=>{if(done.has(id))return;done.add(id);for(const r of routes)if(generator(r.target)===id&&ids.includes(r.source))visit(r.source);order.push(id);};ids.forEach(visit);return order;
}
export function normalizeModulationPatch(p:Patch):Patch {
  const values:Partial<Numbers>={};
  for(const id of Object.keys(dynamic))if(Object.hasOwn(p,id)){values[id as Param]=p[id as DynamicParam];delete p[id as DynamicParam];}
  let result=Object.keys(values).length?setParameters(p,values):p;
  const advanced=result.lfos.some(l=>l.shape==="smooth"||l.depth<0||[l.phase,l.delay,l.fade,l.fadeOut,l.skew,l.slew,l.polarity,l.randomRepeat].some(v=>!!v)||(l.pulseWidth??.5)!==.5)||result.mods.some(r=>!(["lfo1","lfo2","lfo3","velocity","keytrack","modwheel","filterEnv"] as string[]).includes(r.source)||isDynamicParameter(r.target)||r.curve&&r.curve!=="linear"||FX_PARAMETERS.has(r.target as Param));
  if(advanced||result.mods.length>8)result={...result,modVersion:2};
  if(result.mods.some(r=>r.target.startsWith("fx.")||FX_PARAMETERS.has(r.target as Param)))result={...result,fxVersion:2};
  const routes=validModulationRoutes(result.mods);return routes.length===result.mods.length?result:{...result,mods:routes};
}
export const lfoId=(index:number,key:LfoField)=>`lfo.${index+1}.${key}` as Param;
