import { ENGINE_KEYS, ENGINE_PARAMS, ENGINE_TRIGGER, engineOwner } from "./engine-config";
import { PARAMS } from "./model";
import type { Param, Patch } from "./model";

type Context = AudioContext | OfflineAudioContext;
const oscillatorKeys = ["detune", "osc2Tune", "pulseWidth", "mix", "fmRatio", "ringDepth", "ringDry", "ringBias", "ringOffset", "shape", "brightness", "damping", "stringDecay", "pluckPosition", "bodySize", "dispersion"] as const;
export const ENGINE_DSP_KEYS = [...oscillatorKeys, ...ENGINE_KEYS.filter((key) => ["subtractive", "ring", "physical"].includes(engineOwner(key)) && !["subWave", "subOctave", "noiseColor"].includes(key))] as readonly Param[];
export const SAMPLE_DSP_KEYS = ["sampleRoot", "sampleFine", "sampleStart", "sampleEnd", "sampleLoopStart", "sampleLoopEnd", "sampleFade", ...ENGINE_KEYS.filter((key) => engineOwner(key) === "sampler")] as readonly Param[];
const descriptors = (keys: readonly Param[]) => keys.map((name) => ({ name, minValue: PARAMS[name][0], maxValue: PARAMS[name][1], defaultValue: PARAMS[name][2], automationRate: ENGINE_TRIGGER.has(name as keyof typeof ENGINE_PARAMS) ? "k-rate" : "a-rate" }));
export const engineProcessor = `
const phaseEngineClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const phaseEngineFract=(x)=>x-Math.floor(x);
const phaseEngineBlep=(t,dt)=> t<dt ? (t/=dt,t+t-t*t-1) : t>1-dt ? (t=(t-1)/dt,t*t+t+t+1) : 0;
const phaseEngineWave=(type,t,dt,pw=.5)=> {
  if(type===0) return Math.sin(t*2*Math.PI);
  if(type===1) return 2/Math.PI*Math.asin(Math.sin(t*2*Math.PI));
  if(type===2) return 2*t-1-phaseEngineBlep(t,dt);
  return (t<pw?1:-1)+phaseEngineBlep(t,dt)-phaseEngineBlep(phaseEngineFract(t-pw),dt);
};
const phaseEngineAdsr=(p,prefix,t)=> {
  const a=p[prefix+'Attack'],d=p[prefix+'Decay'],s=p[prefix+'Sustain'];
  return a>0&&t<a ? t/a : t<a+d ? 1+(s-1)*(t-a)/d : s;
};
// Initialization and phase increments must use the identical effective frequency.
const phaseEngineOsc1Hz=(hz,p)=>hz*Math.pow(2,-p.detune/2400);
const phaseEngineOsc2Hz=(hz,p)=>Math.min(sampleRate*.45,hz*Math.pow(2,(p.detune/2+p.osc2Tune*100)/1200)*Math.pow(2,p.syncAmount*4));
const phaseEngineRingHz=(hz,p,pitchEnv)=>{
  const base=p.ringModMode>=.5?p.ringModHz*Math.pow(2,(p.pitch+p.transpose*100)/1200):hz*p.fmRatio;
  return phaseEngineClamp((base+p.ringOffset)*Math.pow(2,pitchEnv*p.ringPitchDepth/12),.01,sampleRate*.45);
};
class PhaseEngineVoice extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [
    {name:'frequency',defaultValue:440,minValue:0,maxValue:48000,automationRate:'a-rate'},
    {name:'pitch',defaultValue:0,minValue:-19200,maxValue:19200,automationRate:'a-rate'},
    {name:'transpose',defaultValue:0,minValue:-24,maxValue:24,automationRate:'a-rate'},
    {name:'active',defaultValue:0,minValue:0,maxValue:1,automationRate:'a-rate'},
    {name:'gate',defaultValue:1,minValue:0,maxValue:1,automationRate:'a-rate'},
    ...${JSON.stringify(descriptors(ENGINE_DSP_KEYS))}
  ];}
  constructor(options){
    super(); this.o=options.processorOptions; this.p={}; this.keys=PhaseEngineVoice.parameterDescriptors.map(v=>v.name);this.varying=[];
    this.phase1=0;this.phase2=0;this.elapsed=0;this.releaseAt=-1;this.releasePitch=0;this.releaseDepth=1;
    this.started=false;this.disposed=false;this.syncTail=0;this.low=0;this.side=0;this.bow=0;this.lastString=0;this.physicalTone=0;
    this.seed=this.o.seed||1234567;this.position=0;this.lastBody=[NaN,NaN,NaN];this.body=[1,0,0,0,0];this.bs=[0,0];
    let size=1;while(size<sampleRate/16+8)size*=2;this.mask=size-1;
    this.strings=this.o.engine==='physical'?Array.from({length:3},()=>new Float64Array(size)):[];this.stringCache=new Float64Array(5).fill(NaN);this.delays=new Float64Array(3);this.losses=new Float64Array(3);this.smooth=new Float64Array(3);this.apIn=new Float64Array(3);this.apOut=new Float64Array(3);this.values=new Float64Array(3);this.dc=[0,0];
    this.port.onmessage=({data})=>{if(data==='dispose'){this.disposed=true;this.port.close();}};
  }
  random(){let x=this.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;this.seed=x;return (x>>>0)/4294967296;}
  read(line,delay){const d=Math.max(1,Math.min(this.mask-2,delay)),n=Math.floor(d),f=d-n,a=line[(this.position-n)&this.mask],b=line[(this.position-n-1)&this.mask];return a+(b-a)*f;}
  initialize(hz,p,frame){
    const clock=(currentFrame+frame)/sampleRate;
    const firstHz=this.o.engine==='subtractive'?phaseEngineOsc1Hz(hz,p):hz;
    this.phase1=this.o.engine==='ring'?0:phaseEngineFract(p.osc1Phase+(p.oscPhaseReset<.5?clock*firstHz:0));
    const secondHz=this.o.engine==='ring'?phaseEngineRingHz(hz,p,phaseEngineAdsr(p,'ringPitch',0)):phaseEngineOsc2Hz(hz,p);
    this.phase2=phaseEngineFract((this.o.engine==='ring'?p.ringModPhase:p.osc2Phase)+((this.o.engine==='ring'?p.ringPhaseReset:p.oscPhaseReset)<.5?clock*secondHz:0));
    if(this.o.engine==='physical'){
      const period=Math.max(2,Math.ceil(sampleRate/hz)),line=this.strings[0];let low=0;
      const alpha=.03+Math.pow(p.pickHardness,2)*.97;
      for(let i=0;i<period;i++){low+=alpha*((this.random()*2-1)-low);line[(this.position-i)&this.mask]=low*(.3+p.brightness*.7);}
      const original=line.slice(),offset=Math.max(1,Math.floor(period*p.pluckPosition));
      for(let i=0;i<period;i++){const j=(this.position-i)&this.mask;line[j]-=original[(j-offset)&this.mask]*(this.o.excitation==='pick'?.9:.4);}
    }
  }
  envelope(prefix,held){const p=this.p;return this.releaseAt<0?phaseEngineAdsr(p,prefix,this.elapsed):held*Math.max(0,1-(this.elapsed-this.releaseAt)/p[prefix+'Release']);}
  rebuildBody(){const p=this.p,hz=p.bodyFrequency>0?p.bodyFrequency:180+p.bodySize*650,q=p.bodyQ>0?p.bodyQ:.7+p.bodySize*3;
    if(hz===this.lastBody[0]&&q===this.lastBody[1]&&p.bodySize===this.lastBody[2])return;this.lastBody[0]=hz;this.lastBody[1]=q;this.lastBody[2]=p.bodySize;
    const w=2*Math.PI*Math.min(sampleRate*.45,hz)/sampleRate,c=Math.cos(w),a=Math.sin(w)/(2*Math.max(.05,q)),A=Math.pow(10,p.bodySize*12/40),d=1+a/A;
    this.body=[(1+a*A)/d,-2*c/d,(1-a*A)/d,-2*c/d,(1-a/A)/d];
  }
  tuneStrings(hz,p){
    const cache=this.stringCache;
    if(cache[0]===hz&&cache[1]===p.stringStiffness&&cache[2]===p.dispersion&&cache[3]===p.damping&&cache[4]===p.stringDecay)return;
    cache[0]=hz;cache[1]=p.stringStiffness;cache[2]=p.dispersion;cache[3]=p.damping;cache[4]=p.stringDecay;
    const stiffness=p.stringStiffness*.7,neighbor=.5-p.dispersion*.2;
    for(let j=0;j<3;j++){
      const f=Math.max(20,Math.min(sampleRate*.4,hz*(1+j*.5))),omega=2*Math.PI*f/sampleRate;
      const apDelay=stiffness>0?2*Math.atan2((1+stiffness)*Math.sin(omega/2),(1-stiffness)*Math.cos(omega/2))/Math.max(1e-5,omega):0;
      const lowDelay=Math.atan2(neighbor*Math.sin(omega),1-neighbor+neighbor*Math.cos(omega))/omega;
      this.delays[j]=sampleRate/f-lowDelay-apDelay;
      this.losses[j]=Math.min(.99995,p.damping)*Math.exp(-4/(f*Math.max(.2,p.stringDecay)));
    }
  }
  physical(hz,p){
    const count=p.stringCoupling>0?3:1,stiffness=p.stringStiffness*.7;
    this.tuneStrings(hz,p);
    for(let j=0;j<count;j++){
      const delay=this.delays[j];
      const v=this.read(this.strings[j],delay),low=v*(.5+p.dispersion*.2)+this.smooth[j]*(.5-p.dispersion*.2);this.smooth[j]=v;
      let y=low;if(stiffness>0){y=-stiffness*low+this.apIn[j]+stiffness*this.apOut[j];this.apIn[j]=low;this.apOut[j]=y;}
      this.values[j]=y;
    }
    let excitation=0;
    if(p.excitationDuration>0&&this.elapsed<p.excitationDuration)excitation=(this.random()*2-1)*Math.exp(-6*this.elapsed/p.excitationDuration)*.08*(.2+p.pickHardness*.8);
    const bowTarget=this.o.excitation==='bow'&&p.bowMode>=.5&&p.gate>=.5?p.bowPressure:0;
    this.bow+=(bowTarget-this.bow)*Math.min(1,1/(sampleRate*.01));
    const velocity=this.values[0]-this.lastString;this.lastString=this.values[0];
    if(this.bow>1e-6){const relative=p.bowSpeed*.08-velocity;excitation+=this.bow*Math.tanh(relative*25)*Math.exp(-Math.abs(relative)*3)*.04;}
    let sum=0;for(let j=0;j<count;j++)sum+=this.values[j];
    const coupling=p.stringCoupling*.2;
    for(let j=0;j<count;j++){
      const loss=this.losses[j];
      const mixed=count>1?this.values[j]*(1-coupling)+(sum-this.values[j])*coupling/(count-1):this.values[j];
      this.strings[j][this.position]=Math.tanh((mixed*loss+(j===0?excitation:0))*.8)/.8;
    }
    let out=this.values[0];
    if(p.pickupPosition>0){
      // Keep the neutral endpoint continuous; full differential pickup above 10%.
      const mix=Math.min(1,p.pickupPosition/.1),weight=mix*mix*(3-2*mix);
      out-=weight*this.read(this.strings[0],Math.max(1,sampleRate/hz*(1-p.pickupPosition)));
    }
    if(count>1)out=(out+sum*p.stringCoupling*.25)/(1+p.stringCoupling*.75);
    const dc=out-this.dc[0]+.997*this.dc[1];this.dc[0]=out;this.dc[1]=dc;
    this.rebuildBody();const b=this.body,filtered=b[0]*dc+this.bs[0];this.bs[0]=b[1]*dc-b[3]*filtered+this.bs[1];this.bs[1]=b[2]*dc-b[4]*filtered;
    this.position=(this.position+1)&this.mask;this.physicalTone+=(filtered-this.physicalTone)*(.02+.98*p.brightness*p.brightness);return this.physicalTone;
  }
  process(inputs,outputs,params){
    if(this.disposed)return false;const out=outputs[0][0];if(!out)return true;
    if(params.active.length===1&&params.active[0]===0){out.fill(0);if(this.started){this.port.postMessage('ended');return false;}return true;}
    const p=this.p,varying=this.varying;varying.length=0;
    for(const key of this.keys){const a=params[key];p[key]=a[0];if(a.length>1)varying.push(key);}
    for(let i=0;i<out.length;i++){
      for(const key of varying)p[key]=params[key][i];
      if(p.active<.5){out[i]=0;continue;}
      const hz=phaseEngineClamp(p.frequency*Math.pow(2,p.pitch/1200),this.o.engine==='physical'?20:.01,sampleRate*.45);
      if(!this.started){this.initialize(hz,p,i);this.started=true;}
      if(p.gate<.5&&this.releaseAt<0){this.releasePitch=phaseEngineAdsr(p,'ringPitch',this.elapsed);this.releaseDepth=phaseEngineAdsr(p,'ringEnv',this.elapsed);this.releaseAt=this.elapsed;}
      let value=0;
      if(this.o.engine==='subtractive'){
        const f1=phaseEngineOsc1Hz(hz,p),f2=phaseEngineOsc2Hz(hz,p);
        value=phaseEngineWave(this.o.wave,this.phase1,f1/sampleRate,p.pulseWidth)*(1-p.mix*.5)+(phaseEngineWave(this.o.wave2,this.phase2,f2/sampleRate,p.pulseWidth2)+this.syncTail)*p.mix*.7;
        this.syncTail*=.25;this.phase1+=f1/sampleRate;this.phase2=phaseEngineFract(this.phase2+f2/sampleRate);
        if(this.phase1>=1){this.phase1-=1;if(p.syncAmount>1e-5){const before=phaseEngineWave(this.o.wave2,this.phase2,f2/sampleRate,p.pulseWidth2);this.phase2=phaseEngineFract(p.osc2Phase);this.syncTail+=before-phaseEngineWave(this.o.wave2,this.phase2,f2/sampleRate,p.pulseWidth2);}}
      }else if(this.o.engine==='ring'){
        const pitchEnv=this.envelope('ringPitch',this.releasePitch),env=p.ringEnvEnabled>=.5?this.envelope('ringEnv',this.releaseDepth):1,depth=p.ringDepth*env;
        const modHz=phaseEngineRingHz(hz,p,pitchEnv);
        const carrier=phaseEngineWave(this.o.wave,this.phase1,hz/sampleRate),mod=phaseEngineWave(this.o.wave2,this.phase2,modHz/sampleRate);
        let wet=carrier*((1-p.shape)*.5+(.5+p.shape*.5)*mod+(p.ringBiasMode>=.5?p.ringBias:0));
        this.side+=(wet-this.side)*(1-Math.exp(-2*Math.PI*1000/sampleRate));
        wet=this.side*Math.pow(10,-p.ringSidebandTilt*6/20)+(wet-this.side)*Math.pow(10,p.ringSidebandTilt*6/20);
        if(p.ringSidebandCutoff<17999){this.low+=(wet-this.low)*(1-Math.exp(-2*Math.PI*Math.min(sampleRate*.45,p.ringSidebandCutoff)/sampleRate));wet=this.low;}
        value=wet*depth+carrier*(1-depth+p.ringDry+(p.ringBiasMode<.5?p.ringBias:0));
        this.phase1=phaseEngineFract(this.phase1+hz/sampleRate);this.phase2=phaseEngineFract(this.phase2+modHz/sampleRate);
      }else value=this.physical(hz,p);
      out[i]=Number.isFinite(value)?phaseEngineClamp(value,-4,4):0;this.elapsed+=1/sampleRate;
    }
    return true;
  }
}
registerProcessor('phase-engine-voice',PhaseEngineVoice);
`;

// A context-local LRU shares PCM between notes/unison layers. Removing a cache
// entry does not invalidate voices that already hold the corresponding PCM.
const sampleBanks = new WeakMap<Context, { buffers: Map<AudioBuffer, { id: string; bytes: number }>; bytes: number; serial: number }>();
export class EngineSource extends EventTarget {
  readonly node: AudioWorkletNode;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  readonly keys: readonly Param[];
  constructor(private context: Context, p: Patch, sample?: AudioBuffer, velocity = 1) {
    super();
    this.keys = sample ? SAMPLE_DSP_KEYS : ENGINE_DSP_KEYS;
    const options: Record<string, unknown> = { engine: p.engine, wave: ["sine", "triangle", "sawtooth", "square"].indexOf(p.wave), wave2: ["sine", "triangle", "sawtooth", "square"].indexOf(p.wave2), excitation: p.excitation, seed: Math.floor(Math.random() * 0x7fffffff), sampleLoop: p.sampleLoop, velocity };
    const evicted: string[] = [];
    if (sample) {
      const bank = sampleBanks.get(context) ?? { buffers: new Map(), bytes: 0, serial: 0 }; sampleBanks.set(context, bank);
      let entry = bank.buffers.get(sample);
      if (!entry) {
        const bytes = sample.length * sample.numberOfChannels * 4;
        while (bank.bytes + bytes > 64 * 1024 * 1024 && bank.buffers.size) {
          const [buffer, old] = bank.buffers.entries().next().value!; bank.buffers.delete(buffer); bank.bytes -= old.bytes; evicted.push(old.id);
        }
        entry = { id: `pcm-${++bank.serial}`, bytes }; bank.buffers.set(sample, entry); bank.bytes += bytes;
        options.channels = Array.from({ length: Math.min(2, sample.numberOfChannels) }, (_, ch) => sample.getChannelData(ch));
      } else { bank.buffers.delete(sample); bank.buffers.set(sample, entry); }
      options.sampleKey = entry.id; options.sampleRate = sample.sampleRate;
    }
    this.node = new AudioWorkletNode(context, sample ? "phase-sample-player" : "phase-engine-voice", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [sample ? 2 : 1], processorOptions: options });
    for (const id of evicted) this.node.port.postMessage({ drop: id });
    this.frequency = this.param("frequency"); this.detune = this.param("pitch");
    for (const key of this.keys) this.param(key).value = p[key];
    this.param("transpose").value = p.tune;
    this.node.port.onmessage = ({ data }) => { if (data === "ended") this.dispatchEvent(new Event("ended")); };
  }
  param(key: string) { return this.node.parameters.get(key)!; }
  connect(destination: AudioNode) { return this.node.connect(destination); }
  start(time: number) { this.param("active").setValueAtTime(1, time); this.param("gate").setValueAtTime(1, time); }
  release(time: number) { this.param("gate").cancelScheduledValues(time); this.param("gate").setValueAtTime(0, time); }
  stop(time = this.context.currentTime) { this.param("active").cancelScheduledValues(time); this.param("active").setValueAtTime(0, time); }
  disconnect() { this.node.port.postMessage("dispose"); this.node.port.close(); this.node.disconnect(); }
}
export const sampleDescriptors = descriptors(SAMPLE_DSP_KEYS);
