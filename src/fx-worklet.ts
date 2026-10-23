import { PARAMS } from "./model";
import { FX_CONTROLS, FX_SLOT_MODES, fxValues } from "./fx-spec";
import { fxDsp } from "./fx-dsp";
import type { FxSlot, Patch } from "./model";
const controls=Object.entries(FX_SLOT_MODES).flatMap(([slot,modes])=>modes.flatMap(mode=>FX_CONTROLS[mode].map(c=>({name:`fx.${slot}.${mode}.${c.key}`,defaultValue:c.param?PARAMS[c.param][2]:c.default,minValue:c.min,maxValue:c.max,automationRate:c.event?"k-rate":"a-rate"}))));
export const fxProcessor=fxDsp+`
const phaseFxModes=${JSON.stringify(FX_SLOT_MODES)};
const phaseFxControls=${JSON.stringify(Object.fromEntries(Object.entries(FX_CONTROLS).map(([id,c])=>[id,c.map(v=>v.key)])))};
const phaseFxDescriptors=${JSON.stringify(controls)};
const phaseFxEvents=${JSON.stringify(Object.fromEntries(Object.entries(FX_CONTROLS).map(([id,c])=>[id,Object.fromEntries(c.map(v=>[v.key,!!v.event]))])))};
class PhaseTrackEffect extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'algorithm',defaultValue:0,minValue:0,maxValue:4,automationRate:'k-rate'},{name:'bypass',defaultValue:1,minValue:0,maxValue:1,automationRate:'k-rate'},{name:'tempo',defaultValue:118,minValue:20,maxValue:400,automationRate:'a-rate'},...phaseFxDescriptors.filter(d=>d.name.startsWith('fx.'+this.slot+'.'))];}
  constructor(options){
    super();this.slot=options.processorOptions.slot;this.structure='';this.valueSets={};this.arrays={};this.parameterNames={};
    for(const mode of phaseFxModes[this.slot]){this.valueSets[mode]={};this.arrays[mode]=[];this.parameterNames[mode]=phaseFxControls[mode].map(key=>'fx.'+this.slot+'.'+mode+'.'+key);}
    this.model=new PhaseFxModel(this.slot,phaseFxModes[this.slot][0]);this.idle=new PhaseFxModel(this.slot,phaseFxModes[this.slot][0]);this.previous=null;this.fade=0;this.mix=0;this.disposed=false;this.oldValues={};this.telemetry=0;this.wasBypassed=true;this.idling=false;
    this.port.onmessage=({data})=>{if(data==='dispose'){this.disposed=true;this.port.close();}};
  }
  read(mode,i){const v=this.valueSets[mode],keys=phaseFxControls[mode],arrays=this.arrays[mode];for(let k=0;k<keys.length;k++){const key=keys[k],a=arrays[k],target=a[a.length===1?0:i];v[key]=phaseFxEvents[mode][key]||v[key]===undefined?target:v[key]+(target-v[key])*Math.min(1,1/(sampleRate*.004));}return v;}
  reset(model,mode,v){model.reset(mode,Math.round(v.stages??4));model.voices=Math.round(v.voices??2);model.springCount=Math.round(v.springCount??2);model.oversampling=v.oversampling??0;}
  process(inputs,outputs,p){
    if(this.disposed)return false;
    const output=outputs[0],input=inputs[0]??[],requested=phaseFxModes[this.slot][Math.round(p.algorithm[0])];
    for(const mode of phaseFxModes[this.slot])for(let k=0;k<this.parameterNames[mode].length;k++)this.arrays[mode][k]=p[this.parameterNames[mode][k]];
    const desired=this.read(requested,0),structure=requested+':'+(desired.stages??0)+':'+(desired.springCount??0)+':'+(desired.voices??0)+':'+(desired.oversampling??0);
    if(!this.structure){this.structure=structure;this.reset(this.model,requested,desired);}
    if(structure!==this.structure&&!this.previous){
      this.oldValues={...this.valueSets[this.model.mode]};this.previous=this.model;this.model=this.idle;this.reset(this.model,requested,desired);this.fade=0;this.structure=structure;
    }
    for(let i=0;i<output[0].length;i++){
      const mode=this.model.mode,v=this.read(mode,i),left=input[0]?.[i]??0,right=input[1]?.[i]??left,tempo=p.tempo[p.tempo.length===1?0:i],bypass=p.bypass[0]>=.5;
      const target=bypass?0:fxClamp(v.mix,0,1);this.mix+=(target-this.mix)*Math.min(1,1/(sampleRate*.004));
      if(bypass&&this.mix<.000001){
        if(!this.idling){this.reset(this.model,mode,v);this.idling=true;}
        if(this.previous){this.idle=this.previous;this.previous=null;}this.model.age+=1/sampleRate;if(this.slot==='modulationMode')this.model.phase=(this.model.phase+(v.sync>=.5?tempo/60/v.division:v.rate)/sampleRate)%1;
        output[0][i]=left;output[1][i]=right;this.wasBypassed=true;continue;
      }
      this.idling=false;
      if(this.wasBypassed&&!bypass&&mode==='vibrato'){this.model.age=0;this.model.phase=0;}this.wasBypassed=bypass;
      const a=this.model.process(left,right,v,tempo);let wetL=a[0],wetR=a[1],dryL=this.model.dry[0],dryR=this.model.dry[1];
      if(this.previous){const old=this.previous.process(left,right,this.oldValues,tempo),t=Math.min(1,this.fade/(sampleRate*.032));wetL=old[0]*(1-t)+wetL*t;wetR=old[1]*(1-t)+wetR*t;dryL=this.previous.dry[0]*(1-t)+dryL*t;dryR=this.previous.dry[1]*(1-t)+dryR*t;this.fade++;if(t>=1){this.idle=this.previous;this.previous=null;}}
      const align=Math.min(1,this.mix/Math.max(.00001,v.mix));dryL=left+(dryL-left)*align;dryR=right+(dryR-right)*align;
      output[0][i]=dryL*(1-this.mix)+(Number.isFinite(wetL)?fxClamp(wetL,-8,8):0)*this.mix;
      output[1][i]=dryR*(1-this.mix)+(Number.isFinite(wetR)?fxClamp(wetR,-8,8):0)*this.mix;
    }
    this.telemetry+=output[0].length;
    if(this.telemetry>=sampleRate/25){this.telemetry=0;this.port.postMessage({mode:this.model.mode,values:{...this.valueSets[this.model.mode],stages:this.model.stages,voices:this.model.voices,springCount:this.model.springCount,oversampling:this.model.oversampling},phase:this.model.phase,age:this.model.age,gate:this.model.gate,bypass:p.bypass[0],tempo:p.tempo[p.tempo.length-1],sampleRate});}
    return true;
  }
}
for(const slot of Object.keys(phaseFxModes)){class Stage extends PhaseTrackEffect{};Stage.slot=slot;registerProcessor('phase-track-effect-'+slot,Stage);}
`;
export class WorkletFxStage {
  readonly input:AudioWorkletNode;readonly output:AudioWorkletNode;
  reading?:{mode:string;values:Record<string,number>;phase:number;age:number;gate:number;bypass:number;tempo:number;sampleRate:number};
  constructor(private context:AudioContext|OfflineAudioContext,readonly slot:FxSlot){this.input=this.output=new AudioWorkletNode(context,`phase-track-effect-${slot}`,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{slot}});this.input.port.onmessage=({data})=>{this.reading=data;};}
  update(p:Patch,at:number,tempo:number){
    const set=(id:string,value:number)=>{const param=this.input.parameters.get(id)!;param.setValueAtTime(value,at);};
    set("algorithm",(FX_SLOT_MODES[this.slot] as readonly string[]).indexOf(p[this.slot]));set("bypass",Number(!p.fxEnabled[this.slot]));set("tempo",tempo);
    for(const mode of FX_SLOT_MODES[this.slot]){const values=fxValues(p,mode);for(const c of FX_CONTROLS[mode])set(`fx.${this.slot}.${mode}.${c.key}`,values[c.key]??c.default);}
  }
  cancel(at:number){for(const param of this.input.parameters.values())param.cancelScheduledValues(at);}
  parameters(id:string){
    if(id===`fx.${this.slot}.mode`)return [this.input.parameters.get("algorithm")!];
    if(id===`fx.${this.slot}.bypass`)return [this.input.parameters.get("bypass")!];
    const direct=this.input.parameters.get(id);if(direct)return [direct];
    return FX_SLOT_MODES[this.slot].flatMap(mode=>FX_CONTROLS[mode].filter(c=>c.param===id).map(c=>this.input.parameters.get(`fx.${this.slot}.${mode}.${c.key}`)!));
  }
  dispose(){this.input.port.postMessage("dispose");this.input.port.close();this.input.disconnect();}
  get time(){return this.context.currentTime;}
}
