import { ENGINE_DISCRETE, sampleSliceSelection } from "./engine-config";
import { FILTER_DISCRETE, LEGACY_MULTIMODE_TYPES, filterAdsrAt, filterAdsrReleaseAt } from "./filter-config";
import { FM_ALGORITHMS } from "./fm-config";
import { lfoNoise, lfoSnapshot, lfoValue } from "./lfo";
import { ampEnvelope, modulationEnvelope } from "./modulation-math";
import { MOD_TARGETS, PARAMS, MULTIMODE_FILTERS, clamp } from "./model";
import type { ModSource, ModTarget, Param, Patch } from "./model";
import { GRANULAR_SAMPLES, SAMPLER_SAMPLES } from "./catalog";
import { DYNAMIC_META, getParameter, isDynamicParameter, setParameters } from "./parameter-spec";
import { PARAMETER_REGISTRY, modulationValue, routeCurve } from "./parameters";
import { LFO_FIELDS } from "./modulation-spec";
const choices={wave:["sine","triangle","sawtooth","square"],wave2:["sine","triangle","sawtooth","square"],fmAlgorithm:FM_ALGORITHMS.map(a=>a.id),excitation:["noise","pick","bow"],filterType:["lowpass","highpass","bandpass","notch","multimode","comb"],multimodeType:MULTIMODE_FILTERS.map(m=>m.id),combPolarity:["positive","negative"],sampleId:SAMPLER_SAMPLES.map(s=>s.id),grainSampleId:GRANULAR_SAMPLES.map(s=>s.id),sampleLoop:[false,true]};
export type Expression={pressure?:number;pitchbend?:number;seed?:number;stack?:Set<string>;lfoStart?:number;lfoClock?:(time:number)=>{phases:number[];origin:number}};
export function sourceValue(p:Patch,source:ModSource,time:number,start:number,note:number,velocity:number,wheel:number,tempo:number,releaseAt=Infinity,expression:Expression={}) :number {
  if(source==="velocity")return velocity;
  if(source==="keytrack")return (note-60)/36;
  if(source==="modwheel")return wheel;
  if(source==="pressure")return expression.pressure??0;
  if(source==="pitchbend")return expression.pitchbend??0;
  if(source.startsWith("macro")){
    if(expression.stack?.has(source))return getParameter(p,source);
    const stack=new Set(expression.stack);stack.add(source);return modulatedNumber(p,source as Param,time,start,note,velocity,wheel,tempo,releaseAt,{...expression,stack});
  }
  if(source==="randomNote")return lfoNoise(Math.floor(start*10000),expression.seed??note+1);
  if(source==="smoothRandom"){
    if(expression.stack?.has(source))return 0;const stack=new Set(expression.stack);stack.add(source);const context={...expression,stack};
    const rate=modulatedNumber(p,"randomRate",time,start,note,velocity,wheel,tempo,releaseAt,context),slew=modulatedNumber(p,"randomSlew",time,start,note,velocity,wheel,tempo,releaseAt,context);
    return lfoValue("smooth",time*rate,expression.seed??note+1,.5,0,slew);
  }
  const elapsed=Math.max(0,time-start),release=releaseAt-start;
  if(source==="filterEnv"){const held=filterAdsrAt(p,Math.max(0,Math.min(time,releaseAt)-start));return time>releaseAt?filterAdsrReleaseAt(p,held,time-releaseAt):held;}
  if(source==="ampEnv")return ampEnvelope(p.attack,p.decay,p.sustain,p.release,elapsed,release);
  if(source==="modEnv1"||source==="modEnv2"){const v=(key:string)=>getParameter(p,source+key);return modulationEnvelope(v("Attack"),v("Decay"),v("Sustain"),v("Release"),v("AttackCurve"),v("DecayCurve"),v("ReleaseCurve"),elapsed,release);}
  const index=Number(source.slice(-1))-1;if(index<0||index>2)return 0;
  if(expression.stack?.has(source))return 0;
  let l=p.lfos[index];
  if(p.modVersion===2){l={...l};const stack=new Set(expression.stack);stack.add(source);
    const values=Object.fromEntries(Object.keys(LFO_FIELDS).map(key=>`lfo.${index+1}.${key}` as Param).filter(id=>p.mods.some(r=>r.target===id)).map(id=>[id,modulatedNumber(p,id,time,start,note,velocity,wheel,tempo,releaseAt,{...expression,stack})]));
    l=setParameters(p,values).lfos[index];
  }
  const origin=expression.lfoStart??start,clock=expression.lfoClock?.(l.mode==="hold"?origin:time);
  return l.depth*lfoSnapshot(l,tempo,origin,time,index,releaseAt,clock?.phases[index],clock?.origin??0);
}
export function modulatedNumber(p:Patch,key:Param,time:number,start:number,note:number,velocity:number,wheel:number,tempo:number,releaseAt=Infinity,expression:Expression={}) {
  let amount=0;for(const route of p.mods)if(route.target===key)amount+=routeCurve(sourceValue(p,route.source,time,start,note,velocity,wheel,tempo,releaseAt,expression),route.curve)*route.amount;
  const meta=PARAMETER_REGISTRY[key],value=modulationValue(getParameter(p,key),amount*(meta.trigger&&meta.options?2:1),p.modVersion===1?{...meta,scale:"linear"}:meta);
  if(/^lfo\.[1-3]\.mode$/.test(key)&&p.lfos[+key.split(".")[1]-1]?.legacyTriggerMod&&getParameter(p,key)<=1)return clamp(value,0,1);
  return p.legacyPeakModulation&&key==="filterPeakGain"?clamp(value,0,20):value;
}
/** Topology, articulation and musical divisions are sampled on the note timeline. */
export function triggerPatch(patch:Patch,start:number,note:number,velocity:number,wheel:number,tempo:number,combAvailable:boolean,expression:Expression={}):Patch {
  let p={...patch};for(const target of new Set(patch.mods.map(r=>r.target))){
    if(!MOD_TARGETS[target].trigger||isDynamicParameter(target))continue;
    if(Object.hasOwn(PARAMS,target)){
      const key=target as Param;let value=modulatedNumber(patch,key,start,start,note,velocity,wheel,tempo,Infinity,expression);
      if(isDynamicParameter(key)){const options=DYNAMIC_META[key].options;if(options)value=options.reduce((best,o)=>Math.abs(o.value-value)<Math.abs(best-value)?o.value:best,options[0].value);p=setParameters(p,{[key]:value});}
      else {if(key==="unison"||(FILTER_DISCRETE as readonly string[]).includes(key)||(ENGINE_DISCRETE as readonly string[]).includes(key))value=Math.round(value);Object.assign(p,{[key]:value});}
    }else{
      const key=target as keyof typeof choices,options:readonly(string|boolean)[]=key==="filterType"&&!combAvailable?choices.filterType.filter(t=>t!=="comb"):key==="multimodeType"&&patch.filterVersion===1?LEGACY_MULTIMODE_TYPES:choices[key];
      let index=options.indexOf(patch[key]);for(const r of patch.mods)if(r.target===target)index+=routeCurve(sourceValue(patch,r.source,start,start,note,velocity,wheel,tempo,Infinity,expression),r.curve)*r.amount*Math.max(1,(options.length-1)/2);
      Object.assign(p,{[target]:options[Math.round(clamp(index,0,options.length-1))]});
    }
  }
  if(!p.sample&&p.sampleId!==patch.sampleId)p.sampleRoot=SAMPLER_SAMPLES.find(s=>s.id===p.sampleId)?.root??p.sampleRoot;
  return Object.assign(p,sampleSliceSelection(p.sampleSlices,p.sampleSlice));
}
export function requiresModulationWorklet(p:Patch){return p.modVersion===2&&p.mods.length>0||p.mods.some(r=>r.amount!==0&&(r.source.startsWith("lfo")||r.target==="drive"||p.engine==="subtractive"&&r.target==="pulseWidth"&&(p.wave==="square"||p.wave2==="square")||p.engine==="wavetable"&&["wavetable","shape","wtWarp","wtFormant","brightness"].includes(r.target)||p.engine==="additive"&&["shape","brightness","harmonics","spectralTilt","spectralPeak","spectralResonance","inharmonicity"].includes(r.target)));}
export const modulationScale=(target:ModTarget)=>Object.hasOwn(PARAMS,target)?(PARAMS[target as Param][1]-PARAMS[target as Param][0])/2:1;
