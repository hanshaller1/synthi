import { lfoValue, lfoNoise, lfoFadeGain } from "./lfo";
import { ampEnvelope, modulationCurve, modulationEnvelope } from "./modulation-math";
import { routeCurve, modulationValue, PARAMETER_REGISTRY, getParameter } from "./parameters";
import { generatorOrder, DYNAMIC_META } from "./parameter-spec";
import { LFO_FIELDS, LFO_MODES, LFO_SHAPES, MOD_SOURCES } from "./modulation-spec";
import type { ModSourceMeta } from "./modulation-spec";
import { FX_SLOT_MODES } from "./fx-spec";
import { createModulationKernel } from "./modulation-kernel";
import { ControlTimeline } from "./control-timeline";
import type { ControlEvent } from "./control-timeline";
import { LfoPhase, controlFrame } from "./lfo-phase";
import type { Patch } from "./model";
type Context=AudioContext|OfflineAudioContext;
export type ModulationReading={values:Record<string,number>;sources:Record<string,number>;time:number;deltas?:Record<string,number>;phases?:number[];bases?:Record<string,number>;variants?:Record<string,string>;confirmed?:string[]};
type ControlRange={min:number;max:number;scale:"linear"|"log";event?:boolean;options?:readonly {value:number;label:string}[];amountScale?:number};
const controlMetadata:Record<string,ControlRange>=Object.fromEntries(Object.entries(PARAMETER_REGISTRY).map(([id,m])=>[id,{min:m.min,max:m.max,scale:m.scale,event:m.trigger,options:m.options}]));
const generatorIds=Object.keys(PARAMETER_REGISTRY).filter(id=>PARAMETER_REGISTRY[id as keyof typeof PARAMETER_REGISTRY].scope==="generator");
const rangeIds=[...new Set(Object.values(MOD_SOURCES).flatMap(raw=>{const m:ModSourceMeta=raw;return [m.depth,m.polarity,m.parameter].filter((id):id is string=>!!id);}))];
const envelopeIds=["attack","decay","sustain","release","filterAttack","filterDecay","filterSustain","filterRelease","filterAttackCurve","filterDecayCurve","filterReleaseCurve"];
export function modulationConfig(p:Patch,ids:readonly string[]){
  const allRoutes=p.mods.filter(r=>r.amount!==0).map(r=>{const m=DYNAMIC_META[r.target as keyof typeof DYNAMIC_META];return {...r,target:m?.canonical??r.target,condition:m?.canonical?{slot:m.slot,variant:m.variant}:undefined};});
  // Only expose destinations belonging to this processor. Keep the generator
  // graph running so changing routes never freezes/restarts a free-running LFO.
  const needed=new Set<string>(ids);
  const routes=allRoutes.filter(r=>needed.has(r.target)||PARAMETER_REGISTRY[r.target as keyof typeof PARAMETER_REGISTRY]?.scope==="generator"||/^fx\.[^.]+\.mode$/.test(r.target));
  // Share metadata and retain only values actually read by this control graph.
  const keys=new Set([...generatorIds,...envelopeIds,...ids,...routes.map(r=>r.target),...Object.keys(FX_SLOT_MODES).map(slot=>`fx.${slot}.mode`)]);
  const values:Record<string,number>=Object.fromEntries([...keys].map(id=>[id,getParameter(p,id)]));
  const ranges:Record<string,ControlRange>=Object.fromEntries([...keys].filter(id=>controlMetadata[id]).map(id=>[id,p.modVersion===1?{...controlMetadata[id],scale:"linear"}:controlMetadata[id]]));
  Object.assign(values,{pitch:0,amplitude:1,pan:p.pan});
  const special:typeof ranges={pitch:{min:-1200,max:1200,scale:"linear",event:false},amplitude:{min:0,max:2,scale:"linear",event:false},pan:{min:-1,max:1,scale:"linear",event:false}};
  if(p.modVersion===1)Object.assign(special,{cutoff:{min:20,max:20000,scale:"linear",amountScale:Math.min(6000,p.cutoff*2)},amplitude:{min:0,max:2,scale:"linear",amountScale:.66}});
  const sourceFlags=Object.fromEntries(routes.map(r=>[r.source,true]));
  return {values,ranges:{...ranges,...special},routes,ids,sourceFlags,order:generatorOrder(p.mods),lfos:p.lfos,modes:{saturationMode:p.saturationMode,modulationMode:p.modulationMode,delayMode:p.delayMode,reverbMode:p.reverbMode},fields:Object.keys(LFO_FIELDS).filter(key=>!(LFO_FIELDS[key as keyof typeof LFO_FIELDS] as {event?:boolean}).event)};
}

export const ControlKernel=createModulationKernel({lfoValue,lfoNoise,lfoFadeGain,ampEnvelope,modulationCurve,modulationEnvelope,routeCurve,modulationValue,modulationModes:LFO_MODES,modulationShapes:LFO_SHAPES,modulationFxModes:FX_SLOT_MODES,Phase:LfoPhase});
export class ControlPlanner {
  readonly timeline:ControlTimeline;
  private options:any;
  constructor(context:Pick<Context,"sampleRate"|"currentTime">,p:Patch,start:number,note:number,velocity:number,seed:number,clock?:ControlPlanner,trackSeed=1,track=false,clockOnly=false){
    this.options={config:modulationConfig(p,[]),start,note,velocity,seed,trackSeed,track,clockOnly,sampleRate:context.sampleRate,allSources:!clockOnly};
    this.timeline=new ControlTimeline(()=>new ControlKernel(this.options),context.sampleRate,controlFrame(clockOnly?context.currentTime:start,context.sampleRate),clock?.timeline,typeof AudioContext!=="undefined"&&context instanceof AudioContext?()=>context.currentTime:undefined);
  }
  initial(p:Patch){this.options={...this.options,config:modulationConfig(p,[])};this.timeline.replaceInitial(()=>new ControlKernel(this.options));}
  event(event:ControlEvent){this.timeline.event(event);}
  update(p:Patch,at:number,trigger=false){this.event({type:'config',config:modulationConfig(p,[]),at,trigger});}
  expression(key:string,value:number,at:number){this.event({type:'expression',key,value,at});}
  snapshot(time:number){return this.timeline.at(time);}
  dispose(){this.timeline.dispose();}
}
export const modulationProcessor=`
const lfoNoise=${lfoNoise.toString()};
const lfoValue=${lfoValue.toString()};
const lfoFadeGain=${lfoFadeGain.toString()};
const modulationCurve=${modulationCurve.toString()};
const modulationEnvelope=${modulationEnvelope.toString()};
const ampEnvelope=${ampEnvelope.toString()};
const routeCurve=${routeCurve.toString()};
const modulationValue=${modulationValue.toString()};
const Phase=${LfoPhase.toString()};
const createKernel=${createModulationKernel.toString()};
const modulationRangeIds=${JSON.stringify(rangeIds)};
const Kernel=createKernel({lfoNoise,lfoValue,lfoFadeGain,modulationCurve,modulationEnvelope,ampEnvelope,routeCurve,modulationValue,Phase,modulationModes:${JSON.stringify(LFO_MODES)},modulationShapes:${JSON.stringify(LFO_SHAPES)},modulationFxModes:${JSON.stringify(FX_SLOT_MODES)}});
class PhaseModulation extends AudioWorkletProcessor {
  constructor(options){
    super();this.k=new Kernel({...options.processorOptions,sampleRate});this.events=[];this.disposed=false;this.reporting=options.processorOptions.telemetry;this.internalReporting=options.processorOptions.internalTelemetry;this.samples=0;this.clock=new Float32Array(7);
    this.port.onmessage=({data})=>{
      if(data.type==='dispose'){this.disposed=true;this.port.close();return;}
      if(data.type==='telemetry'){this.reporting=data.enabled;this.samples=0;return;}
      if(data.type==='panic')this.events=this.events.filter(e=>e.at<data.at||!(['note','release','lfoTrigger','clockReset'].includes(e.type)||e.trigger));
      this.events.push(data);this.events.sort((a,b)=>a.at-b.at);
    };
  }
  process(inputs,outputs){
    if(this.disposed)return false;
    const count=outputs[0][0].length,k=this.k,shared=inputs[0];
    for(let i=0;i<count;i++){
      const frame=currentFrame+i;
      while(this.events.length&&this.events[0].frame<=frame)k.apply(this.events.shift(),frame/sampleRate);
      if(shared?.length===7)for(let c=0;c<7;c++)this.clock[c]=shared[c][i];
      k.step(frame,shared?.length===7?this.clock:undefined);
      if(k.clockOnly)for(let c=0;c<7;c++)outputs[0][c][i]=k.clockValues[c];
      else for(let c=0;c<outputs.length;c++)outputs[c][0][i]=k.last[k.c.ids[c]]??0;
    }
    this.samples+=count;
    // FX output retirement needs these small acknowledgements even with the UI
    // closed. Graph updates must never depend on display telemetry being enabled.
    if((this.reporting||this.internalReporting)&&this.samples>=sampleRate/30){this.samples%=sampleRate/30;
      if(!this.reporting){this.port.postMessage({type:'deltas',deltas:k.last});return true;}
      const ids=[...new Set([...k.c.ids,...k.c.routes.map(r=>r.target)])];
      this.port.postMessage({values:Object.fromEntries(ids.map(id=>[id,k.c.ids.includes(id)?(k.c.values[id]??0)+(k.last[id]??0):k.c.ranges[id]?.event?k.eventValue(id):k.value(id)])),bases:Object.fromEntries([...new Set([...ids,...modulationRangeIds])].map(id=>[id,k.c.values[id]??0])),sources:k.sources,variants:k.modeValues,deltas:k.last,time:(currentFrame+count-1)/sampleRate,phases:k.freePhase});
    }
    return true;
  }
}
registerProcessor('phase-modulation',PhaseModulation);
`;
export class Modulator {
  private clockSource?:AudioNode;
  private reporting=false;
  private latestDeltas:Record<string,number>={};
  readonly control?:ControlPlanner;
  readonly trackSeed:number;
  readonly node:AudioWorkletNode;reading:ModulationReading={values:{},sources:{},time:0};
  ids:string[];private destinations=new Map<string,(AudioParam|AudioNode)[]>();
  constructor(private context:Context,p:Patch,ids:readonly string[],start:number,note=60,velocity=0,track=false,seed=1,clock?:Modulator,clockOnly=false,control?:ControlPlanner){
    this.ids=[...ids];this.trackSeed=clock?.trackSeed??(clockOnly?seed:1);
    this.control=control??(clockOnly?new ControlPlanner(context,p,start,note,velocity,seed,undefined,this.trackSeed,true,true):undefined);
    const outputs=clockOnly?1:track?32:Math.max(1,ids.length);
    this.node=new AudioWorkletNode(context,"phase-modulation",{numberOfInputs:clock?1:0,channelCount:7,channelCountMode:"explicit",channelInterpretation:"discrete",numberOfOutputs:outputs,outputChannelCount:Array(outputs).fill(clockOnly?7:1),processorOptions:{config:modulationConfig(p,ids),start,note,velocity,track,seed,trackSeed:this.trackSeed,clockOnly,telemetry:false,internalTelemetry:context instanceof AudioContext&&track&&!clockOnly}});
    this.clockSource=clock?.node;clock?.node.connect(this.node);
    this.node.port.onmessage=({data})=>{if(data.deltas)this.latestDeltas=data.deltas;if(this.reporting&&!data.type)this.reading=data;};
  }
  setReporting(enabled:boolean){if(this.reporting===enabled)return;this.reporting=enabled;this.reading={values:{},sources:{},time:0};this.node.port.postMessage({type:"telemetry",enabled});}
  connect(id:string,destination:AudioParam|AudioNode){const index=this.ids.indexOf(id);if(index>=0){this.node.connect(destination as AudioParam,index);const list=this.destinations.get(id)??[];list.push(destination);this.destinations.set(id,list);}}
  extend(wanted:readonly string[]){
    const needed=wanted.filter(id=>!this.ids.includes(id)).length;
    const available=32-this.ids.length+this.ids.filter(old=>!wanted.includes(old)&&Math.abs(this.latestDeltas[old]??Infinity)<.000001).length;
    if(needed>available)return null;
    const added:string[]=[];
    for(const id of wanted){if(this.ids.includes(id))continue;
      let index=this.ids.length<32?this.ids.length:this.ids.findIndex(old=>!wanted.includes(old)&&Math.abs(this.latestDeltas[old]??Infinity)<.000001);
      if(index<0)return null;
      const old=this.ids[index];if(old){for(const destination of this.destinations.get(old)??[])this.node.disconnect(destination as AudioParam,index);this.destinations.delete(old);}
      this.ids[index]=id;added.push(id);
    }
    return added;
  }
  private send(event:ControlEvent){const frame=controlFrame(event.at,this.context.sampleRate);this.node.port.postMessage({...event,frame});this.control?.event(event);}
  expression(key:"tempo"|"wheel"|"pressure"|"bend",value:number,at=this.context.currentTime){this.send({type:"expression",key,value,at});}
  update(p:Patch,at:number,trigger=false){this.node.port.postMessage({type:"config",config:modulationConfig(p,this.ids),at,frame:controlFrame(at,this.context.sampleRate),trigger});this.control?.update(p,at,trigger);}
  note(id:number,note:number,velocity:number,at:number,seed=note+1){this.send({type:"note",id,note,velocity,seed,at});}
  release(at:number,id?:number){this.send({type:"release",id,at});}
  retune(note:number,at:number,id?:number){this.send({type:"retune",note,at,id});}
  pressure(value:number,at:number,note?:number){this.send({type:"pressure",value,at,note});}
  triggerLfo(at:number,seed?:number){this.send({type:"lfoTrigger",at,seed});}
  resetClock(at:number){this.send({type:"clockReset",at});}
  panic(at:number){this.node.port.postMessage({type:"panic",at,frame:controlFrame(at,this.context.sampleRate)});this.control?.timeline.panic(at);}
  dispose(){this.node.port.postMessage({type:"dispose"});this.node.port.onmessage=null;this.clockSource?.disconnect(this.node);this.node.disconnect();this.control?.dispose();}
}
