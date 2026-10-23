import { sampleSliceSelection } from "./engine-config";
import { sampleDescriptors } from "./engine-worklet";

// PCM is registered once per context, then shared by all note/unison processors.
// Active voices retain their data when an old cache entry is evicted.
export const sampleProcessor = `
const phaseSampleSelection=${sampleSliceSelection.toString()};
const phaseSampleBank=new Map();
const phaseSampleWindow=Float32Array.from({length:2048},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/2048));
const phaseSampleClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const phaseSampleMod=(x,n)=>((x%n)+n)%n;
class PhaseSamplePlayer extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [
    {name:'frequency',defaultValue:440,minValue:0,maxValue:48000,automationRate:'a-rate'},
    {name:'pitch',defaultValue:0,minValue:-19200,maxValue:19200,automationRate:'a-rate'},
    {name:'transpose',defaultValue:0,minValue:-24,maxValue:24,automationRate:'a-rate'},
    {name:'active',defaultValue:0,minValue:0,maxValue:1,automationRate:'a-rate'},
    {name:'gate',defaultValue:1,minValue:0,maxValue:1,automationRate:'a-rate'},
    ...${JSON.stringify(sampleDescriptors)}
  ];}
  constructor(options){
    super();this.o=options.processorOptions;
    if(this.o.channels)phaseSampleBank.set(this.o.sampleKey,this.o.channels);
    this.channels=phaseSampleBank.get(this.o.sampleKey)||[];this.length=this.channels[0]?.length||0;
    this.keys=PhaseSamplePlayer.parameterDescriptors.map(v=>v.name);this.p={};this.varying=[];
    this.started=false;this.disposed=false;this.elapsed=0;this.cursor=0;this.grains=[];this.hop=0;this.window=2048;this.done=false;
    this.port.onmessage=({data})=>{if(data==='dispose'){this.disposed=true;this.channels=[];this.port.close();}else if(data.drop)phaseSampleBank.delete(data.drop);};
  }
  initialize(p){
    const n=this.length,start=Math.min(p.sampleStart,p.sampleEnd-.01)*n,end=Math.max(p.sampleEnd,p.sampleStart+.01)*n;
    const {sampleSlices:count,sampleSlice:slice}=phaseSampleSelection(p.sampleSlices,p.sampleSlice),size=(end-start)/count;
    const velocity=p.sampleVelocityStart>=0?this.o.velocity*p.sampleVelocityStart:(1-this.o.velocity)*-p.sampleVelocityStart;
    this.start=phaseSampleClamp(start+size*slice+size*velocity*.95,0,n-2);this.end=phaseSampleClamp(start+size*(slice+1),this.start+1,n-1);
    this.loop=p.samplePlayback===3||(p.samplePlayback===0&&this.o.sampleLoop);
    this.loopStart=phaseSampleClamp(this.start+Math.min(p.sampleLoopStart,p.sampleLoopEnd-.01)*(this.end-this.start),this.start,this.end-1);
    this.loopEnd=phaseSampleClamp(this.start+Math.max(p.sampleLoopEnd,p.sampleLoopStart+.01)*(this.end-this.start),this.loopStart+1,this.end);
    this.cursor=this.start;this.elapsed=0;
    // Pre-roll the four overlap windows so stretching starts at full window sum.
    if(p.sampleStretchMode>=.5){const rate=p.frequency/(440*Math.pow(2,(p.sampleRoot-69)/12))*Math.pow(2,(p.pitch+p.sampleFine)/1200)*this.o.sampleRate/sampleRate,scan=this.o.sampleRate/sampleRate/Math.max(.25,p.sampleStretch);for(let j=3;j>=1;j--){const age=j*this.window/4;this.grains.push({position:this.start+age*(rate-scan),age});}}
  }
  point(data,position){
    const x=phaseSampleClamp(position,0,this.length-1),i=Math.floor(x),t=x-i;
    const a=data[Math.max(0,i-1)],b=data[i],c=data[Math.min(this.length-1,i+1)],d=data[Math.min(this.length-1,i+2)];
    return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
  }
  read(data,raw,p){
    if(!this.loop)return raw<this.start||raw>=this.end?0:this.point(data,raw);
    if(raw<this.start)return 0;
    const span=this.loopEnd-this.loopStart;
    if(p.samplePingPong>=.5){
      if(raw<this.loopStart)return this.point(data,raw);
      const t=phaseSampleMod(raw-this.loopStart,span*2),q=t<=span?t:2*span-t;
      const fade=Math.min(span*.45,p.sampleLoopCrossfade*this.o.sampleRate);
      // Round the reversal's corner; both position and slope are continuous.
      let rounded=q;
      if(fade>0){if(q<fade)rounded=q*q/Math.max(1e-9,fade)*(2-q/fade);else if(q>span-fade){const r=span-q;rounded=span-r*r/Math.max(1e-9,fade)*(2-r/fade);}}
      return this.point(data,this.loopStart+rounded);
    }
    const fade=Math.min(span*.45,p.sampleLoopCrossfade*this.o.sampleRate),period=Math.max(1,span-fade);
    const q=raw<this.loopEnd?raw-this.loopStart:fade+phaseSampleMod(raw-this.loopEnd,period);
    const position=this.loopStart+q;
    if(fade>0&&position>=this.loopEnd-fade){const t=(position-(this.loopEnd-fade))/fade,w=.5-.5*Math.cos(Math.PI*t);return this.point(data,position)*(1-w)+this.point(data,this.loopStart+t*fade)*w;}
    return this.point(data,position);
  }
  process(inputs,outputs,params){
    if(this.disposed)return false;const output=outputs[0],frames=output[0]?.length||0;
    if(params.active.length===1&&params.active[0]===0){for(const ch of output)ch.fill(0);if(this.started){this.port.postMessage('ended');return false;}return true;}
    const p=this.p,varying=this.varying;varying.length=0;for(const key of this.keys){p[key]=params[key][0];if(params[key].length>1)varying.push(key);}
    for(let i=0;i<frames;i++){
      for(const key of varying)p[key]=params[key][i];
      if(p.active<.5||!this.length){for(const ch of output)ch[i]=0;continue;}
      if(!this.started){this.initialize(p);this.started=true;}
      const ratio=p.frequency/(440*Math.pow(2,(p.sampleRoot-69)/12))*Math.pow(2,(p.pitch+p.sampleFine)/1200),rate=phaseSampleClamp(ratio,.001,256)*this.o.sampleRate/sampleRate;
      const stretched=p.sampleStretchMode>=.5;
      if(stretched&&this.hop<=0&&!this.done){this.grains.push({position:this.cursor,age:0});this.hop=this.window/4;}
      let sum=0;if(stretched)for(const g of this.grains)sum+=phaseSampleWindow[g.age];
      for(let ch=0;ch<output.length;ch++){
        const data=this.channels[Math.min(ch,this.channels.length-1)];let value=0;
        if(stretched){for(const g of this.grains){const w=phaseSampleWindow[g.age];value+=this.read(data,g.position,p)*w;}value/=Math.max(1e-6,sum);}
        else if(!this.done)value=this.read(data,this.cursor,p);
        const fade=p.sampleFade,edge=fade>0?Math.min(1,this.elapsed/fade):1;
        const tail=!this.loop&&fade>0?Math.min(1,Math.max(0,this.end-this.cursor)/(this.o.sampleRate*fade*(stretched?1/Math.max(.25,p.sampleStretch):Math.max(.001,ratio)))):1;
        output[ch][i]=Number.isFinite(value)?value*edge*tail:0;
      }
      this.cursor+=stretched?this.o.sampleRate/sampleRate/Math.max(.25,p.sampleStretch):rate;
      if(stretched){for(const g of this.grains){g.position+=rate;g.age++;}while(this.grains.length&&this.grains[0].age>=this.window)this.grains.shift();this.hop--;}
      if(!this.loop&&this.cursor>=this.end)this.done=true;
      this.elapsed+=1/sampleRate;
      // Keep cursor precision stable during indefinite loops (grain heads too).
      if(this.loop&&this.cursor>this.loopEnd+this.o.sampleRate*3600){const span=(this.loopEnd-this.loopStart)*(p.samplePingPong>=.5?2:1)- (p.samplePingPong>=.5?0:Math.min((this.loopEnd-this.loopStart)*.45,p.sampleLoopCrossfade*this.o.sampleRate));const shift=Math.floor((this.cursor-this.loopEnd)/span)*span;this.cursor-=shift;for(const g of this.grains)g.position-=shift;}
    }
    return true;
  }
}
registerProcessor('phase-sample-player',PhaseSamplePlayer);
`;
