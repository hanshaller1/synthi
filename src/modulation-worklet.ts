import { lfoValue, lfoNoise, lfoFadeGain } from "./lfo";
import { ampEnvelope, modulationCurve, modulationEnvelope } from "./modulation-math";
import { routeCurve, modulationValue, PARAMETER_REGISTRY, getParameter } from "./parameters";
import { generatorOrder, DYNAMIC_META } from "./parameter-spec";
import { LFO_FIELDS, LFO_MODES, LFO_SHAPES } from "./modulation-spec";
import { FX_SLOT_MODES } from "./fx-spec";
import type { Patch } from "./model";
type Context=AudioContext|OfflineAudioContext;
export type ModulationReading={values:Record<string,number>;sources:Record<string,number>;time:number;deltas?:Record<string,number>;phases?:number[]};
export function modulationConfig(p:Patch,ids:readonly string[]){
  const values=Object.fromEntries(Object.keys(PARAMETER_REGISTRY).map(id=>[id,getParameter(p,id)]));
  const ranges=Object.fromEntries(Object.entries(PARAMETER_REGISTRY).map(([id,m])=>[id,{min:m.min,max:m.max,scale:p.modVersion===1?"linear":m.scale,event:m.trigger,options:m.options}]));
  const special={pitch:{min:-1200,max:1200,scale:"linear"},amplitude:{min:0,max:2,scale:"linear"},pan:{min:-1,max:1,scale:"linear"}};
  if(p.modVersion===1)Object.assign(special,{cutoff:{min:20,max:20000,scale:"linear",amountScale:Math.min(6000,p.cutoff*2)},amplitude:{min:0,max:2,scale:"linear",amountScale:.66}});
  Object.assign(values,{pitch:0,amplitude:1,pan:p.pan});
  const allRoutes=p.mods.filter(r=>r.amount!==0).map(r=>{const m=DYNAMIC_META[r.target as keyof typeof DYNAMIC_META];return {...r,target:m?.canonical??r.target,condition:m?.canonical?{slot:m.slot,variant:m.variant}:undefined};});
  // Only expose destinations belonging to this processor. Keep the generator
  // graph running so changing routes never freezes/restarts a free-running LFO.
  const needed=new Set<string>(ids);
  const routes=allRoutes.filter(r=>needed.has(r.target)||PARAMETER_REGISTRY[r.target as keyof typeof PARAMETER_REGISTRY]?.scope==="generator"||/^fx\.[^.]+\.mode$/.test(r.target));
  const sourceFlags=Object.fromEntries(routes.map(r=>[r.source,true]));
  return {values,ranges:{...ranges,...special},routes,ids,sourceFlags,order:generatorOrder(p.mods),lfos:p.lfos,modes:{saturationMode:p.saturationMode,modulationMode:p.modulationMode,delayMode:p.delayMode,reverbMode:p.reverbMode},fields:Object.keys(LFO_FIELDS).filter(key=>!(LFO_FIELDS[key as keyof typeof LFO_FIELDS] as {event?:boolean}).event)};
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
const modulationModes=${JSON.stringify(LFO_MODES)};
const modulationShapes=${JSON.stringify(LFO_SHAPES)};
const modulationFxModes=${JSON.stringify(FX_SLOT_MODES)};
const modulationFxSlots=Object.keys(modulationFxModes);
const modulationFxModeIds=modulationFxSlots.map(slot=>'fx.'+slot+'.mode');
class PhaseModulation extends AudioWorkletProcessor {
  static get parameterDescriptors(){return ['tempo','wheel','pressure','bend','active'].map(name=>({name,defaultValue:name==='tempo'?118:name==='active'?1:0,minValue:name==='tempo'?20:name==='bend'?-1:0,maxValue:name==='tempo'?400:1,automationRate:'a-rate'}));}
  constructor(options){super();this.c=options.processorOptions.config;this.reporting=options.processorOptions.telemetry;this.eventsEpoch=0;this.notesEpoch=0;this.eventCache={};this.lastNoteEpoch=[-1,-1,-1];this.groups={};this.lfoValues=[{},{},{}];this.fieldIds=[1,2,3].map(i=>Object.fromEntries([...this.c.fields,'mode','shape','sync','polarity','division'].map(key=>[key,'lfo.'+i+'.'+key])));this.groupRoutes();this.track=options.processorOptions.track;this.clockOnly=!!options.processorOptions.clockOnly;this.clockOrigin=0;this.freePhase=[0,0,0];this.freeInitialized=[false,false,false];this.held=[0,0,0];this.events=[];this.started=false;this.disposed=false;this.notes=[];this.note={start:options.processorOptions.start,note:options.processorOptions.note,velocity:options.processorOptions.velocity,release:Infinity,seed:options.processorOptions.seed,values:this.c.values};this.lfoStart=this.note.start;this.phase=[0,0,0];this.initialized=[false,false,false];this.lastModes=[null,null,null];this.randomPhase=0;this.randomStarted=false;this.randomSeed=options.processorOptions.track?1:options.processorOptions.seed;this.age=0;this.sample=0;this.sources={};this.last={};this.modeValues=this.c.modes;
    this.port.onmessage=({data})=>{if(data.type==='dispose'){this.disposed=true;this.port.close();}else{this.events.push(data);this.events.sort((a,b)=>a.at-b.at);}};
  }
  groupRoutes(){this.groups={};for(const route of this.c.routes)(this.groups[route.target]??=[]).push(route);}
  reset(){this.started=true;}
  apply(event,now){
    if(event.type==='lfoTrigger'){this.notesEpoch++;this.eventsEpoch++;this.lfoStart=event.at;}
    if(event.type==='clockReset'){this.clockOrigin=event.at;this.freePhase=[0,0,0];this.freeInitialized=[true,true,true];}
    if(event.type==='config'){if(event.trigger||JSON.stringify(event.config.routes.filter(r=>event.config.ranges[r.target]?.event))!==JSON.stringify(this.c.routes.filter(r=>this.c.ranges[r.target]?.event))||Object.entries(event.config.ranges).some(([id,m])=>m.event&&event.config.values[id]!==this.c.values[id]))this.eventsEpoch++;this.c=event.config;this.modeValues=this.c.modes;this.groupRoutes();}
    if(event.type==='note'){this.lfoStart=event.at;this.eventsEpoch++;this.notesEpoch++;const n={...event,release:Infinity,start:event.at,values:this.c.values};this.notes.push(n);this.note=n;this.reset();}
    if(event.type==='release'){const n=this.notes.find(n=>n.id===event.id);if(n)n.release=event.at;if(!this.track)this.note.release=event.at;const held=this.notes.filter(n=>n.release>now);if(held.length)this.note=held[held.length-1];}
    if(event.type==='retune'){const n=this.track?this.notes.find(n=>n.id===event.id):this.note;if(n)n.note=event.note;}
    if(event.type==='pressure'){for(const n of this.notes)if(event.note===undefined||n.note===event.note)n.pressure=event.value;if(!this.track&&(event.note===undefined||this.note.note===event.note))this.note.pressure=event.value;}
    if(event.type==='panic'){this.events=this.events.filter(e=>e.at<now||!(['note','release','lfoTrigger','clockReset'].includes(e.type)||e.trigger));for(const n of this.notes)n.release=now;this.note.release=now;}
    this.notes=this.notes.filter(n=>n.release>now-32);
  }
  value(id){const c=this.c,base=c.values[id]??0,meta=c.ranges[id];if(!meta)return base;let amount=0;for(const r of this.groups[id]??[])if((!r.condition||this.modeValues[r.condition.slot]===r.condition.variant))amount+=routeCurve(this.sources[r.source]??0,r.curve)*r.amount;const value=amount===0?base:modulationValue(base,amount*(meta.event&&meta.options?2:1),meta);return /^lfo\\.[1-3]\\.mode$/.test(id)&&c.lfos[+id.split(".")[1]-1]?.legacyTriggerMod&&base<=1?Math.max(0,Math.min(1,value)):value;}
  eventValue(id){if(this.c.ranges[id]?.event&&!id.startsWith("lfo.")&&!id.startsWith("fx."))return this.note.values?.[id]??this.c.values[id];const cached=this.eventCache[id];if(cached&&cached.epoch===this.eventsEpoch)return cached.value;let value=this.value(id);const options=this.c.ranges[id]?.options;if(options&&value!==this.c.values[id])value=options.reduce((best,o)=>Math.abs(o.value-value)<Math.abs(best-value)?o.value:best,options[0].value);this.eventCache[id]={epoch:this.eventsEpoch,value};return value;}
  envelope(prefix,now){if(this.track&&this.notes.length===0)return 0;const n=this.note,v=n.values??this.c.values,t=now-n.start,r=n.release-n.start;if(prefix==='amp')return ampEnvelope(v.attack,v.decay,v.sustain,v.release,t,r);if(prefix==='filter')return modulationEnvelope(v.filterAttack,v.filterDecay,v.filterSustain,v.filterRelease,v.filterAttackCurve??0,v.filterDecayCurve??0,v.filterReleaseCurve??0,t,r,modulationCurve);return modulationEnvelope(v[prefix+'Attack'],v[prefix+'Decay'],v[prefix+'Sustain'],v[prefix+'Release'],v[prefix+'AttackCurve'],v[prefix+'DecayCurve'],v[prefix+'ReleaseCurve'],t,r,modulationCurve);}
  process(inputs,outputs,p){
    if(this.disposed)return false;
    const frames=outputs[0]?.[0]?.length||128;for(let k=this.c.ids.length;k<outputs.length;k++)outputs[k][0].fill(0);
    for(let i=0;i<frames;i++){
      const now=(currentFrame+i)/sampleRate;this.tempo=p.tempo[p.tempo.length===1?0:i];while(this.events.length&&this.events[0].at<=now)this.apply(this.events.shift(),now);
      if(now<this.note.start||p.active[p.active.length===1?0:i]<.5){for(const out of outputs)out[0][i]=0;continue;}
      if(!this.started)this.reset();
      const n=this.note,s=this.sources,c=this.c;
      s.velocity=n.velocity;s.keytrack=(n.note-60)/36;s.modwheel=p.wheel[p.wheel.length===1?0:i];s.pressure=n.pressure??p.pressure[p.pressure.length===1?0:i];s.pitchbend=p.bend[p.bend.length===1?0:i];
      if(c.sourceFlags.randomNote){if(this.noiseStart!==n.start||this.noiseSeed!==n.seed){this.noiseStart=n.start;this.noiseSeed=n.seed;this.noiseValue=lfoNoise(Math.floor(n.start*10000),n.seed);}s.randomNote=this.noiseValue;}
      if(c.sourceFlags.ampEnv)s.ampEnv=this.envelope('amp',now);if(c.sourceFlags.filterEnv)s.filterEnv=this.envelope('filter',now);
      for(const id of c.order){
        if(id==='smoothRandom'){const rate=this.value('randomRate');if(!this.randomStarted){this.randomPhase=now*rate;this.randomStarted=true;}s[id]=this.clockOnly&&!c.sourceFlags.smoothRandom?0:lfoValue('smooth',this.randomPhase,this.randomSeed,.5,0,this.value('randomSlew'),lfoNoise);this.randomPhase+=rate/sampleRate;continue;}
        if(id.startsWith('macro')){s[id]=this.value(id);continue;}
        if(id.startsWith('modEnv')){s[id]=this.clockOnly&&!c.sourceFlags[id]?0:this.envelope(id,now);continue;}
        const j=Number(id.slice(-1))-1,v=this.lfoValues[j],ids=this.fieldIds[j];for(const key of c.fields)v[key]=this.value(ids[key]);
        const mode=modulationModes[Math.round(this.eventValue(ids.mode))],shape=modulationShapes[Math.round(this.eventValue(ids.shape))],sync=this.eventValue(ids.sync)>=.5,unipolar=this.eventValue(ids.polarity)>=.5;
        const rate=sync?this.tempo/60/Math.max(1/24,this.eventValue(ids.division)):v.rate;
        if(!this.freeInitialized[j]){this.freePhase[j]=Math.max(0,now-this.clockOrigin)*rate;this.freeInitialized[j]=true;}
        const shared=inputs[0],hasClock=shared?.length===7;
        const globalPhase=hasClock?shared[j*2][i]+shared[j*2+1][i]:this.freePhase[j];
        const clockAge=hasClock?shared[6][i]:Math.max(0,now-this.clockOrigin);
        const noteChanged=this.lastNoteEpoch[j]!==this.notesEpoch,modeChanged=this.lastModes[j]!==mode;
        if(noteChanged||modeChanged||!this.initialized[j]){
          if(mode!=='free')this.phase[j]=0;
          if(mode==='hold')this.held[j]=lfoValue(shape,globalPhase+(v.phase%360)/360,j+1,v.pulseWidth,v.skew,v.slew,lfoNoise);
          this.lastNoteEpoch[j]=this.notesEpoch;this.lastModes[j]=mode;this.initialized[j]=true;
        }
        const elapsed=(mode==='free'?clockAge:now-this.lfoStart)-v.delay,length=mode==='one'?1:mode==='half'?.5:Infinity;
        const done=this.phase[j]>=length,phase=mode==='free'?globalPhase:this.phase[j];
        const needed=!this.clockOnly||c.sourceFlags[id];
        const bipolar=!needed?0:mode==='hold'?this.held[j]:lfoValue(shape,phase+(v.phase%360)/360,j+1,v.pulseWidth,v.skew,v.slew,lfoNoise);
        const gain=needed?lfoFadeGain(Math.max(0,elapsed),v.fade,v.fadeOut,now-n.release,Number.isFinite(length)?(length-this.phase[j])/Math.max(.02,rate):Infinity,length/Math.max(.02,rate)):1;
        s[id]=elapsed<0||done?0:(unipolar?(bipolar+1)/2:bipolar)*v.depth*gain;
        if(elapsed>=0&&!done&&mode!=='free'&&mode!=='hold')this.phase[j]+=rate/sampleRate;
        if(this.clockOnly){outputs[0][j*2][i]=this.freePhase[j]%1;outputs[0][j*2+1][i]=Math.floor(this.freePhase[j]);outputs[0][6][i]=Math.min(64,clockAge);}
        this.freePhase[j]+=rate/sampleRate;
      }
      for(let slot=0;slot<modulationFxSlots.length;slot++){const name=modulationFxSlots[slot],value=Math.round(this.eventValue(modulationFxModeIds[slot]));this.modeValues[name]=modulationFxModes[name][value];}
      if(!this.clockOnly)for(let k=0;k<c.ids.length;k++){const id=c.ids[k],event=c.ranges[id]?.event,value=event?this.eventValue(id):this.value(id),base=c.values[id]??0,delta=value-base;const previous=this.last[id]??0,smoothed=event?delta:previous+(delta-previous)*Math.min(1,1/(sampleRate*.003));this.last[id]=smoothed;outputs[k][0][i]=smoothed;}
      this.age++;
    }
    this.sample+=frames;if(this.reporting&&this.sample>=sampleRate/25){this.sample=0;this.port.postMessage({values:Object.fromEntries([...new Set([...this.c.ids,...this.c.routes.map(r=>r.target)])].map(id=>[id,this.c.ids.includes(id)?(this.c.values[id]??0)+(this.last[id]??0):this.c.ranges[id]?.event?this.eventValue(id):this.value(id)])),sources:this.sources,deltas:this.last,time:(currentFrame+frames)/sampleRate,phases:this.freePhase});}
    return true;
  }
}
registerProcessor('phase-modulation',PhaseModulation);
`;
export class Modulator {
  private clockSource?:AudioNode;
  readonly node:AudioWorkletNode;reading:ModulationReading={values:{},sources:{},time:0};
  ids:string[];private destinations=new Map<string,(AudioParam|AudioNode)[]>();
  constructor(private context:Context,p:Patch,ids:readonly string[],start:number,note=60,velocity=0,track=false,seed=1,clock?:AudioNode,clockOnly=false){
    this.ids=[...ids];
    const outputs=clockOnly?1:track?32:Math.max(1,ids.length);
    this.node=new AudioWorkletNode(context,"phase-modulation",{numberOfInputs:clock?1:0,channelCount:7,channelCountMode:"explicit",channelInterpretation:"discrete",numberOfOutputs:outputs,outputChannelCount:Array(outputs).fill(clockOnly?7:1),processorOptions:{config:modulationConfig(p,ids),start,note,velocity,track,seed,clockOnly,telemetry:context instanceof AudioContext}});
    this.clockSource=clock;clock?.connect(this.node);
    this.node.port.onmessage=({data})=>{this.reading=data;};
  }
  connect(id:string,destination:AudioParam|AudioNode){const index=this.ids.indexOf(id);if(index>=0){this.node.connect(destination as AudioParam,index);const list=this.destinations.get(id)??[];list.push(destination);this.destinations.set(id,list);}}
  extend(wanted:readonly string[]){
    const needed=wanted.filter(id=>!this.ids.includes(id)).length;
    const available=32-this.ids.length+this.ids.filter(old=>!wanted.includes(old)&&Math.abs(this.reading.deltas?.[old]??Infinity)<.000001).length;
    if(needed>available)return null;
    const added:string[]=[];
    for(const id of wanted){if(this.ids.includes(id))continue;
      let index=this.ids.length<32?this.ids.length:this.ids.findIndex(old=>!wanted.includes(old)&&Math.abs(this.reading.deltas?.[old]??Infinity)<.000001);
      if(index<0)return null;
      const old=this.ids[index];if(old){for(const destination of this.destinations.get(old)??[])this.node.disconnect(destination as AudioParam,index);this.destinations.delete(old);}
      this.ids[index]=id;added.push(id);
    }
    return added;
  }
  expression(key:"tempo"|"wheel"|"pressure"|"bend",value:number,at=this.context.currentTime){this.node.parameters.get(key)!.setValueAtTime(value,at);}
  update(p:Patch,at:number,trigger=false){this.node.port.postMessage({type:"config",config:modulationConfig(p,this.ids),at,trigger});}
  note(id:number,note:number,velocity:number,at:number){this.node.port.postMessage({type:"note",id,note,velocity,seed:note+1,at});}
  release(at:number,id?:number){this.node.port.postMessage({type:"release",id,at});}
  retune(note:number,at:number,id?:number){this.node.port.postMessage({type:"retune",note,at,id});}
  pressure(value:number,at:number,note?:number){this.node.port.postMessage({type:"pressure",value,at,note});}
  triggerLfo(at:number){this.node.port.postMessage({type:"lfoTrigger",at});}
  resetClock(at:number){this.node.port.postMessage({type:"clockReset",at});}
  panic(at:number){this.node.port.postMessage({type:"panic",at});}
  dispose(){this.node.port.postMessage({type:"dispose"});this.node.port.onmessage=null;this.clockSource?.disconnect(this.node);this.node.disconnect();}
}
