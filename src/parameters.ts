import { FX_PARAMETERS, FX_PARAMETER_META } from "./fx-spec";
import { PARAMS, MOD_TARGETS } from "./model";
import type { Modulation, Numbers, Param, Patch } from "./model";
import { DYNAMIC_META, getParameter, isDynamicParameter, normalizeModulationPatch, setParameters } from "./parameter-spec";
import type { ParameterMeta } from "./parameter-spec";
export { getParameter, isDynamicParameter, setParameters };
export const FX_GLOBALS=[...FX_PARAMETERS];
export const PARAMETER_REGISTRY = Object.fromEntries(Object.entries(PARAMS).map(([id,[min,max,fallback]])=>{
  const target=MOD_TARGETS[id as Param];
  const scale=FX_PARAMETER_META[id]?.log||min>0&&max/min>=100?"log":"linear";
  const meta:ParameterMeta=DYNAMIC_META[id as keyof typeof DYNAMIC_META]??{min,max,default:fallback,label:FX_PARAMETER_META[id]?.label??target.label,group:FX_PARAMETER_META[id]?.group??target.group,trigger:target.trigger,scale,scope:FX_PARAMETERS.has(id as Param)?"fx":/^(macro|random|modEnv)/.test(id)?"generator":"voice"};
  if(meta.canonical){const canonical=PARAMS[meta.canonical as Param];return [id,{...meta,min:canonical[0],max:canonical[1],default:canonical[2],scale:FX_PARAMETER_META[meta.canonical]?.log?"log":"linear"}];}
  return [id,meta];
})) as Record<Param,ParameterMeta>;
export function parameterEdits(p:Patch,partial:Partial<Patch>):Patch {
  const values=Object.fromEntries(Object.entries(partial).filter(([id,value])=>isDynamicParameter(id)&&typeof value==="number")) as Partial<Numbers>;
  const base={...p,...partial};for(const id of Object.keys(values))delete base[id as Param];
  let result=setParameters(base,values);
  for(const id of Object.keys(values))if(/^lfo\.[1-3]\.mode$/.test(id))result.lfos[+id.split(".")[1]-1].legacyTriggerMod=false;
  if(partial.lfos||Object.keys(partial).some(id=>/^(macro|modEnv|random)/.test(id)))result.modVersion=2;
  if(partial.fxSettings||["saturationOutputTrim","reverbLowCut","reverbHighCut","reverbWidth"].some(id=>id in partial))result.fxVersion=2;
  return normalizeModulationPatch(result);
}
export function routeCurve(value:number,curve:Modulation["curve"]="linear") {
  const x=Math.min(1,Math.abs(value));
  return curve==="exponential"?Math.sign(value)*x*x:curve==="logarithmic"?Math.sign(value)*Math.log1p(9*x)/Math.log(10):value;
}
export function modulationValue(base:number,amount:number,meta:Pick<ParameterMeta,"min"|"max"|"scale"> & {amountScale?:number}) {
  const {min,max}=meta;if(max===min)return min;
  if(meta.scale==="log"&&min>0)return Math.max(min,Math.min(max,Math.max(min,base)*Math.pow(max/min,amount/2)));
  return Math.max(min,Math.min(max,base+amount*(meta.amountScale??(max-min)/2)));
}
