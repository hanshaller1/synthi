import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Param, Patch } from "./model";
import type { ModulationReading } from "./modulation-worklet";
import { fxValues, FX_SLOT_MODES } from "./fx-spec";
import type { FxSlot } from "./model";
import { DYNAMIC_META } from "./parameter-spec";
import { modulationValue, PARAMETER_REGISTRY, routeCurve } from "./parameters";
type Readings={voice?:ModulationReading;fx?:ModulationReading};
const Context=createContext<{patch:Patch;reading:Readings}|null>(null);
export function ModulationProvider({patch,read,children}:{patch:Patch;read:()=>Readings|undefined;children:ReactNode}){
  const [reading,setReading]=useState<Readings>({});
  useEffect(()=>{let frame=0,last=0;const tick=(at:number)=>{if(at-last>40){last=at;setReading(read()??{});}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[read]);
  return <Context.Provider value={{patch,reading}}>{children}</Context.Provider>;
}
export function useKnobModulation(id:Param|undefined,base:number){
  const context=useContext(Context);if(!context||!id)return null;
  const {patch:p,reading}=context,meta=PARAMETER_REGISTRY[id];if(!meta)return null;
  const own=DYNAMIC_META[id as keyof typeof DYNAMIC_META],canonical=own?.canonical??id;
  const routes=p.mods.filter(r=>{const m=DYNAMIC_META[r.target as keyof typeof DYNAMIC_META];return (m?.canonical??r.target)===canonical&&(!m?.variant||(FX_SLOT_MODES[m.slot!][Math.round(reading.fx?.values[`fx.${m.slot}.mode`]??-1)]??p[m.slot!])===m.variant);});
  if(!routes.length)return null;
  let low=0,high=0;
  for(const route of routes){let min=0,max=1;
    if(route.source.startsWith("lfo")){const l=p.lfos[+route.source.slice(-1)-1];const depth=p.mods.some(r=>r.target===`lfo.${+route.source.slice(-1)}.depth`)?1:l.depth;min=l.polarity&&!p.mods.some(r=>r.target===`lfo.${+route.source.slice(-1)}.polarity`)?0:-depth;max=depth;}
    if(route.source==="randomNote"||route.source==="smoothRandom"||route.source==="pitchbend"){min=-1;max=1;}
    if(route.source==="keytrack"){min=-60/36;max=67/36;}
    const a=routeCurve(min,route.curve)*route.amount,b=routeCurve(max,route.curve)*route.amount;low+=Math.min(a,b);high+=Math.max(a,b);
  }
  const effective=meta.scope==="fx"?reading.fx:reading.voice??reading.fx;
  const scale=meta.trigger&&meta.options?2:1;
  return {min:modulationValue(base,low*scale,meta),max:modulationValue(base,high*scale,meta),current:effective?.values[canonical]??base};
}
export function useEffectiveFxValues(values:Record<string,number>,slot:FxSlot,mode:string){
  const context=useContext(Context),reading=context?.reading.fx?.values;
  const actualMode=FX_SLOT_MODES[slot][Math.round(reading?.[`fx.${slot}.mode`]??-1)]??mode;
  const result=context?fxValues(context.patch,actualMode):{...values};
  if(reading){
    for(const [key,base]of Object.entries(result)){const id=`fx.${slot}.${actualMode}.${key}`,meta=DYNAMIC_META[id as keyof typeof DYNAMIC_META];result[key]=reading[id]??reading[meta?.canonical??id]??base;}
    for(const key of ["phase","age","gate","bypass","tempo","sampleRate"])result[`__${key}`]=reading[`fx.${slot}.${key}`]??0;
  }
  return {mode:actualMode,values:result};
}
