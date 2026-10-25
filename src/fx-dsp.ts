import { FX_DELAY_LIMIT_SECONDS } from "./fx-timing";
/** Inline worklet DSP: fixed signal graphs, continuously controlled coefficients. */
export const fxDsp = `
const fxDelayLimit=${FX_DELAY_LIMIT_SECONDS};
const fxClamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Polyphase 2x oversampling, Blackman-windowed 63-tap half-band FIR.
const fxHalfband=new Float64Array(63);let fxFirSum=0;
for(let i=0;i<63;i++){const t=i-31,w=.42-.5*Math.cos(2*Math.PI*i/62)+.08*Math.cos(4*Math.PI*i/62);fxHalfband[i]=t===0?.5:i%2?0:Math.sin(Math.PI*t/2)/(Math.PI*t)*w;fxFirSum+=fxHalfband[i];}
for(let i=0;i<63;i++)fxHalfband[i]/=fxFirSum;
class PhaseFxLine {
  constructor(seconds){let size=1;while(size<seconds*sampleRate+8)size*=2;this.data=new Float32Array(size);this.mask=size-1;this.at=0;this.written=0;}
  read(seconds){const delay=fxClamp(seconds*sampleRate,1,this.mask-3),n=Math.floor(delay),t=delay-n;if(n+1>this.written)return 0;const a=this.data[(this.at-n)&this.mask],b=this.data[(this.at-n-1)&this.mask];return a+(b-a)*t;}
  write(value){this.data[this.at]=Number.isFinite(value)?fxClamp(value,-16,16):0;this.at=(this.at+1)&this.mask;this.written=Math.min(this.mask+1,this.written+1);}
  reset(){this.at=0;this.written=0;}
}
class PhaseFxModel {
  constructor(slot,mode,stages=4){
    this.slot=slot;this.mode=mode;this.stages=stages;this.incoming=[0,0];this.alphaValues=new Float64Array(32);this.alphaHz=new Float64Array(32).fill(NaN);this.filterCoefficients=Array.from({length:16},()=>[NaN,0]);this.dry=[0,0];this.phase=0;this.age=0;this.env=0;this.gate=0;this.hold=0;this.samples=0;
    this.low=new Float64Array(16);this.high=new Float64Array(4);this.dc=new Float64Array(4);this.held=new Float64Array(2);this.crushCount=0;this.prevInput=new Float64Array(2);
    this.lines=[];this.allpass=Array.from({length:16},()=>[0,0,0,0]);this.filters=Array.from({length:4},()=>[0,0]);this.returned=[0,0];this.coef={};this.last='';
    if(slot==='saturationMode'){this.osIn=[new Float64Array(32),new Float64Array(32)];this.osOut=[new Float64Array(64),new Float64Array(64)];}
    if(slot==='delayMode')this.lines=[new PhaseFxLine(fxDelayLimit),new PhaseFxLine(fxDelayLimit)];
    if(slot==='modulationMode')this.lines=[new PhaseFxLine(.12),new PhaseFxLine(.12)];
    if(slot==='reverbMode'){this.lines=Array.from({length:8},()=>new PhaseFxLine(.3));this.pre=[new PhaseFxLine(.2),new PhaseFxLine(.2)];this.diff=Array.from({length:4},()=>new PhaseFxLine(.02));this.early=new PhaseFxLine(.15);this.network=new Float64Array(8);this.reverbTimes=new Float64Array(8);this.reverbGains=new Float64Array(8);this.earlyTaps=[.011,.019,.031,.047,.073];}
  }
  reset(mode,stages){this.mode=mode;this.stages=stages;this.phase=0;this.age=0;this.env=0;this.gate=0;this.hold=0;this.crushCount=0;this.samples=0;
    if(this.osIn)for(const array of [...this.osIn,...this.osOut])array.fill(0);
    for(const coefficients of this.filterCoefficients)coefficients[0]=NaN;
    for(const array of [this.low,this.high,this.dc,this.held,this.prevInput])array.fill(0);for(const state of [...this.allpass,...this.filters])state.fill(0);this.dubG=0;for(const line of [...this.lines,...(this.pre??[]),...(this.diff??[])])line.reset();if(this.early)this.early.reset();if(this.network)this.network.fill(0);
  }
  alpha(hz){return 1-Math.exp(-2*Math.PI*fxClamp(hz,10,sampleRate*.45)/sampleRate);}
  cachedAlpha(hz,index){if(!Number.isFinite(this.alphaHz[index])||this.samples%8===0&&this.alphaHz[index]!==hz){this.alphaHz[index]=hz;this.alphaValues[index]=this.alpha(hz);}return this.alphaValues[index];}
  tone(x,index,hz){const a=this.cachedAlpha(hz,index);this.low[index]+=a*(x-this.low[index]);return this.low[index];}
  highpass(x,index,hz){const a=1-this.cachedAlpha(hz,index+16),y=a*(this.dc[index+2]+x-this.dc[index]);this.dc[index]=x;this.dc[index+2]=y;return y;}
  saturate(x,v){const drive=1+(v.drive??.2)*35;
    if(this.mode==='soft')return v.drive<.0001?x:Math.tanh(x*drive*(1+v.warmth*.5))/Math.tanh(drive);
    if(this.mode==='hard'){const t=v.threshold,s=v.symmetry??0;return fxClamp(x*drive,-t*(1-Math.max(0,s)*.95),t*(1+Math.min(0,s)*.95));}
    if(this.mode==='fold')return 2/Math.PI*Math.asin(Math.sin((x+v.bias)*v.folds*Math.PI/2*(1+v.drive*2)));
    if(this.mode==='crush'){const levels=Math.pow(2,Math.round(v.bits));return Math.round(fxClamp(x*(1+v.drive*3),-1,1)*levels)/levels;}
    const bias=v.bias,a=v.asymmetry;return (Math.tanh((x+bias)*drive*(x<0?1-a*.8:1))-Math.tanh(bias*drive))*.8;
  }
  sat(left,right,v){
    const input=this.incoming;input[0]=left;input[1]=right;const out=this.returned;const update=this.crushCount<=0;
    if(this.mode==='crush'&&update)this.crushCount+=Math.max(1,sampleRate/Math.min(sampleRate,v.sampleRate)*(1+(Math.random()*2-1)*v.jitter*.45));
    for(let ch=0;ch<2;ch++){
      let x=input[ch];this.dry[ch]=x;if(this.mode==='diode')x=this.tone(x,ch+2,v.preTone);
      let y;
      if(this.mode==='crush'){if(update)this.held[ch]=this.saturate(x,v);y=this.held[ch];}
      else if(this.mode==='soft'&&this.oversampling>=.5){
        const source=this.osIn[ch],output=this.osOut[ch],pos=this.samples&31,target=(this.samples*2)&63;source[pos]=x;
        let even=0;for(let i=0;i<32;i++)even+=2*fxHalfband[2*i]*source[(pos-i)&31];
        const odd=2*fxHalfband[31]*source[(pos-15)&31];
        output[target]=this.saturate(even,v);output[target+1]=this.saturate(odd,v);
        y=fxHalfband[31]*output[(target-31)&63];for(let i=0;i<32;i++)y+=fxHalfband[2*i]*output[(target-2*i)&63];
        this.dry[ch]=source[(pos-31)&31];
      }else y=this.saturate(x,v);
      y=this.tone(y,ch,this.mode==='fold'?v.postFilter:v.tone??20000);
      out[ch]=this.highpass(y,ch,15)*Math.pow(10,v.outputTrim/20);
    }
    this.crushCount--;return out;
  }
  allPass(x,ch,stage,frequency,q){
    const index=ch*8+stage,state=this.allpass[index];let coefficients=this.filterCoefficients[index];
    if(!Number.isFinite(coefficients[0])||this.samples%8===0){const w=2*Math.PI*fxClamp(frequency,20,sampleRate*.4)/sampleRate,alpha=Math.sin(w)/(2*Math.max(.1,q)),a0=1+alpha;coefficients[0]=(1-alpha)/a0;coefficients[1]=-2*Math.cos(w)/a0;}
    const [b0,b1]=coefficients;
    const y=b0*x+state[0];state[0]=b1*x-b1*y+state[1];state[1]=x-b0*y;return y;
  }
  modulation(left,right,v,tempo){
    const rate=v.sync>=.5?tempo/60/Math.max(1/24,v.division):v.rate;this.phase=(this.phase+rate/sampleRate)%1;this.age+=1/sampleRate;
    const out=this.returned,input=this.incoming;input[0]=left;input[1]=right;
    for(let ch=0;ch<2;ch++){
      const offset=(v.stereoPhase??0)/360*ch+(v.phase??0)/360,phase=(this.phase+offset)%1;
      const wave=this.mode==='tremolo'?(v.shape===1?(phase<.5?1:-1):v.shape===2?1-4*Math.abs(phase-.5):v.shape===3?1-phase*2:Math.sin(phase*Math.PI*2)):Math.sin(phase*Math.PI*2);
      if(this.mode==='tremolo'){out[ch]=input[ch]*(1-v.depth*.5+wave*v.depth*.5);continue;}
      if(this.mode==='phaser'){
        let x=input[ch]+fxClamp(this.high[ch],-2,2)*v.feedback;
        for(let i=0;i<this.stages;i++)x=this.allPass(x,ch,i,v.frequency*(i+1)*Math.pow(2,wave*v.depth),v.resonance);
        this.high[ch]=x;out[ch]=(input[ch]+x)*.5;continue;
      }
      const line=this.lines[ch];let result=0;
      if(this.mode==='chorus'){
        const count=this.voices;for(let voice=0;voice<count;voice++){
          const p=phase+voice/count,delay=v.baseDelay+Math.sin(p*Math.PI*2)*Math.min(v.baseDelay*.8,.008)*v.depth;
          const pan=count===1?0:(voice/(count-1)*2-1)*v.width,gain=ch===0?Math.cos((pan+1)*Math.PI/4):Math.sin((pan+1)*Math.PI/4);
          result+=line.read(delay)*gain/Math.sqrt(count);
        }
      }else{
        const base=this.mode==='flanger'?v.manual:.012,depth=this.mode==='vibrato'?Math.min(.009,(Math.pow(2,v.cents/1200)-1)/(2*Math.PI*Math.max(.02,rate))):Math.min(.003,base*.8)*v.depth;
        const fade=this.mode==='vibrato'&&v.fade>0?Math.min(1,this.age/v.fade):1;
        result=line.read(base+wave*depth*fade);
      }
      const feedback=this.mode==='flanger'?v.regen*v.polarity:0;
      line.write(input[ch]+Math.tanh(result)*feedback);out[ch]=result;
    }
    return out;
  }
  dubBand(x,ch){const state=this.filters[ch],g=this.dubG,k=this.dubK,bp=this.dubA*(state[0]+g*(x-state[1])),lp=state[1]+g*bp;state[0]=2*bp-state[0];state[1]=2*lp-state[1];return bp*k;}
  delay(left,right,v,tempo){
    const time=v.sync>=.5?tempo/60*Math.max(1/24,v.division):v.time;
    const flutter=Math.sin(this.age*2*Math.PI*6.3+Math.sin(this.age*2*Math.PI*.7))*(v.flutter??0)*.00035;
    const motion=this.mode==='tape'?Math.sin(this.age*2*Math.PI*.8)*v.wow*.002+flutter:this.mode==='dub'?Math.sin(this.age*2*Math.PI*.31)*v.modDepth*.004:0;
    const rightTime=this.mode==='pingpong'?(v.sync>=.5?(v.rightDivision>0?tempo/60*v.rightDivision:time):(v.rightTime>0?v.rightTime:time)):time+(this.mode==='digital'?v.stereoOffset:0);
    const a=this.lines[0].read(fxClamp(time+motion,.001,fxDelayLimit)),b=this.lines[1].read(fxClamp(rightTime-motion,.001,fxDelayLimit));
    const envTarget=Math.max(Math.abs(left),Math.abs(right));this.env+=(envTarget-this.env)*(envTarget>this.env?.01:.00015);
    let fa=a,fb=b;
    const hz=this.mode==='tape'?9000-v.age*7800:this.mode==='dub'?v.frequency:v.tone??20000;
    if(this.mode!=='dub'){fa=this.tone(fa,0,hz);fb=this.tone(fb,1,hz);}
    if(this.mode==='digital'){fa=this.highpass(fa,0,v.highpass);fb=this.highpass(fb,1,v.highpass);}
    if(this.mode==='dub'){
      // TPT state-variable band-pass; normalize the resonance peak to unity.
      if(!this.dubG||this.samples%8===0){this.dubG=Math.tan(Math.PI*fxClamp(hz,20,sampleRate*.4)/sampleRate);this.dubK=1/Math.max(.1,v.resonance);this.dubA=1/(1+this.dubG*(this.dubG+this.dubK));}
      fa=this.dubBand(fa,0);fb=this.dubBand(fb,1);
    }
    if(this.mode==='tape'||this.mode==='dub'){
      const sat=this.mode==='tape'?v.age*3+(v.saturation??0)*12:(v.feedbackSaturation??0)*12,k=1+sat;
      fa=Math.tanh(fa*k)/k;fb=Math.tanh(fb*k)/k;
    }
    const cross=this.mode==='pingpong'?v.crossFeedback:0,g=Math.min(.92,v.feedback),mono=(left+right)*.5;
    this.lines[0].write((this.mode==='pingpong'?mono:left)+(fa*(1-cross)+fb*cross)*g);
    this.lines[1].write((this.mode==='pingpong'?0:right)+(fb*(1-cross)+fa*cross)*g);
    const out=this.returned,duck=1/(1+(v.ducking??0)*this.env*12);
    if(this.mode==='multitap'){
      out[0]=0;out[1]=0;for(let i=1;i<=3;i++){
        const t=fxClamp(i===1?time:time*v.spacing*(i-1),.001,fxDelayLimit),sample=(this.lines[0].read(t+1/sampleRate)+this.lines[1].read(t+1/sampleRate))*.5*v['tap'+i+'Level'],pan=v['tap'+i+'Pan']*v.width;
        out[0]+=sample*Math.cos((pan+1)*Math.PI/4);out[1]+=sample*Math.sin((pan+1)*Math.PI/4);
      }
    }else if(this.mode==='pingpong'){const width=v.width;out[0]=(a*(1+width)+b*(1-width))*.5;out[1]=(b*(1+width)+a*(1-width))*.5;}
    else {out[0]=a*duck;out[1]=b*duck;}
    this.age+=1/sampleRate;return out;
  }
  reverb(left,right,v){
    const out=this.returned,mono=(left+right)*.5;
    this.env+=(Math.max(Math.abs(left),Math.abs(right))-this.env)*.01;
    const pre=v.predelay??0;this.pre[0].write(left);this.pre[1].write(right);let excitation=(this.pre[0].read(Math.max(1/sampleRate,pre))+this.pre[1].read(Math.max(1/sampleRate,pre)))*.5;
    const diffusion=this.mode==='plate'?v.diffusion*.95:.65;
    for(let j=0;j<4;j++){const d=this.diff[j].read(.0031+j*.0027),y=d-excitation*diffusion;this.diff[j].write(excitation+y*diffusion);excitation=y;}
    this.early.write(mono);let earlyL=0,earlyR=0;const taps=this.earlyTaps;for(let i=0;i<taps.length;i++){earlyL+=this.early.read(taps[i])/(i+2);earlyR+=this.early.read(taps[i]*1.07)/(i+2);}
    const count=this.mode==='spring'?this.springCount*2:8,decay=Math.max(.2,v.decay),tension=this.mode==='spring'?1.4-v.tension:1;
    if(this.samples%8===1)for(let i=0;i<count;i++){const seconds=(.0297+i*.00913+(i%3)*.0017)*tension;this.reverbTimes[i]=seconds;this.reverbGains[i]=Math.exp(-6.9078*seconds/decay);}
    let sum=0;for(let i=0;i<count;i++){const x=this.lines[i].read(this.reverbTimes[i]),hz=this.mode==='plate'?3000+v.brightness*15000:v.damping??9000;this.low[i]+=this.cachedAlpha(hz,i)*(x-this.low[i]);this.network[i]=this.low[i];sum+=this.network[i];}
    for(let i=0;i<count;i++){const gain=this.reverbGains[i],mixed=sum*2/count-this.network[i];let x=excitation*.18+mixed*gain;
      if(this.mode==='spring')x=Math.tanh(x*(1+v.drive*8))/(1+v.drive*8);
      this.lines[i].write(x);
    }
    let lateL=0,lateR=0;for(let i=0;i<count;i++){lateL+=this.network[i]*(i%2?-.5:.5);lateR+=this.network[i]*(i%3?-.5:.5);}
    const earlyAmount=this.mode==='room'?v.early:this.mode==='hall'?1-v.earlyLate:.15,lateAmount=this.mode==='hall'?v.earlyLate:1;
    let a=lateL*lateAmount+earlyL*earlyAmount,b=lateR*lateAmount+earlyR*earlyAmount;
    if(this.mode==='gated'){
      if(this.env>=Math.pow(10,v.threshold/20))this.hold=v.hold+v.gate*decay*.5;else this.hold=Math.max(0,this.hold-1/sampleRate);
      const open=this.hold>0?1:0;this.gate+=(open-this.gate)*Math.min(1,1/(sampleRate*(open?.005:v.release)));a*=this.gate;b*=this.gate;
    }
    a=this.highpass(a,0,v.lowCut);b=this.highpass(b,1,v.lowCut);a=this.tone(a,10,v.highCut);b=this.tone(b,11,v.highCut);
    const mid=(a+b)*.5,side=(a-b)*.5*v.width;out[0]=mid+side;out[1]=mid-side;return out;
  }
  process(a,b,v,tempo){this.samples++;this.dry[0]=a;this.dry[1]=b;if(this.slot==='saturationMode')return this.sat(a,b,v);if(this.slot==='modulationMode')return this.modulation(a,b,v,tempo);if(this.slot==='delayMode')return this.delay(a,b,v,tempo);return this.reverb(a,b,v);}
}
`;
