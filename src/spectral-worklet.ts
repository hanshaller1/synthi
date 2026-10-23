import { wavetableSpectrum } from "./catalog";
import { ENGINE_KEYS, engineOwner, needsEngineWorklet } from "./engine-config";
import { PARAMS } from "./model";
import type { Param, Patch } from "./model";

export const SPECTRAL_KEYS = [
  "wavetable", "shape", "wtWarp", "wtFormant", "brightness", "harmonics",
  "spectralTilt", "spectralPeak", "spectralResonance", "inharmonicity", "pulseWidth",
  ...ENGINE_KEYS.filter((key) => ["wavetable", "additive"].includes(engineOwner(key))),
] as const satisfies readonly Param[];
const descriptors = SPECTRAL_KEYS.map((key) => ({
  name: key, minValue: PARAMS[key][0], maxValue: PARAMS[key][1],
  defaultValue: PARAMS[key][2], automationRate: "k-rate",
}));

// Local DSP is bundled with the filter worklet, including in the portable HTML.
// Spectral changes rebuild a small band-limited wavetable, then crossfade it.
// No main-thread timers or unscheduled setPeriodicWave calls are needed.
export const spectralProcessor = `
const phaseSpectrum = ${wavetableSpectrum.toString()};
const phaseSpectralKeys = ${JSON.stringify(SPECTRAL_KEYS)};
class PhaseSpectralOscillator extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0, maxValue: 24000, automationRate: 'a-rate' },
      { name: 'detune', defaultValue: 0, minValue: -19200, maxValue: 19200, automationRate: 'a-rate' },
      { name: 'active', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      ...${JSON.stringify(descriptors)}
    ];
  }
  constructor(options) {
    super();
    this.engine = options.processorOptions.engine;
    this.enhanced = options.processorOptions.enhanced;
    this.partialLimit = options.processorOptions.partialLimit || 32;
    this.position = options.processorOptions.position || 0;
    this.elapsed = 0; this.phaseInitialized = false;
    this.seeds = Float64Array.from({length:33},()=>Math.random()*2-1);
    this.sines = Float32Array.from({length:2048},(_,i)=>Math.sin(i*2*Math.PI/2048));
    this.rawWeights = new Float64Array(33);
    this.decays = new Float64Array(33); this.steps = new Float64Array(33);
    this.size = 1024;
    this.real = new Float64Array(this.size);
    this.imag = new Float64Array(this.size);
    this.table = new Float32Array(this.size);
    this.previous = new Float32Array(this.size);
    this.phases = new Float64Array(33);
    this.weights = new Float64Array(33);
    this.ratios = new Float64Array(33);
    this.phase = 0;
    this.lastParameters = new Float64Array(phaseSpectralKeys.length).fill(NaN);
    this.lastLimit = -1;
    this.ready = false;
    this.started = false;
    this.disposed = false;
    this.port.onmessage = ({data}) => { if (data === 'dispose') { this.disposed = true; this.port.close(); } };
  }
  fft(re,im,direction){
    const size=this.size;
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
    }
    for (let length = 2; length <= size; length <<= 1) {
      const angle = direction * 2 * Math.PI / length, wr = Math.cos(angle), wi = Math.sin(angle);
      for (let i = 0; i < size; i += length) {
        let r = 1, q = 0;
        for (let j = 0; j < length / 2; j++) {
          const a = i + j, b = a + length / 2;
          const vr = re[b] * r - im[b] * q, vi = re[b] * q + im[b] * r;
          re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
          const next = r * wr - q * wi; q = r * wi + q * wr; r = next;
        }
      }
    }
  }
  rebuild(p, limit) {
    const re = this.real, im = this.imag, size = this.size;
    this.previous.set(this.table);
    re.fill(0); im.fill(0);
    let coefficients;
    if (this.engine === 'wavetable') {
      const position = Math.max(0,Math.min(1,p.shape[0]+this.position*p.wtSpread[0]*.5));
      coefficients = phaseSpectrum(Math.round(p.wavetable[0]), Math.pow(position,Math.pow(2,p.wtMorphSkew[0]*2)), !this.enhanced&&p.wtWarpMode[0]<.5?p.wtWarp[0]:0, p.wtFormant[0], p.brightness[0]);
      if(p.wtBlur[0]>0){
        const radius=Math.ceil(p.wtBlur[0]*8),real=coefficients.real.slice(),imag=coefficients.imag.slice();
        for(let n=1;n<real.length;n++){let a=0,b=0,w=0;for(let j=Math.max(1,n-radius);j<=Math.min(real.length-1,n+radius);j++){const g=Math.exp(-Math.pow((j-n)/Math.max(.5,radius*.5),2));a+=real[j]*g;b+=imag[j]*g;w+=g;}coefficients.real[n]=real[n]*(1-p.wtBlur[0])+a/w*p.wtBlur[0];coefficients.imag[n]=imag[n]*(1-p.wtBlur[0])+b/w*p.wtBlur[0];}
      }
    }
    for (let n = 1; n <= Math.min(128, limit); n++) {
      let a = 0, b = 0;
      if (this.engine === 'wavetable') { a = coefficients.real[n]; b = coefficients.imag[n]; }
      else if (this.engine === 'additive') {
        if (n > Math.round(p.harmonics[0])) continue;
        const peak = Math.exp(-Math.pow((n - p.spectralPeak[0]) / 2, 2));
        b = Math.pow(n, -(2.5 - p.brightness[0] * 2 - p.spectralTilt[0])) *
          (1 - p.shape[0] * .8 + (n % 2 ? p.shape[0] * .8 : 0)) * (1 + peak * p.spectralResonance[0] * 5);
      } else {
        a = Math.sin(n * 2 * Math.PI * p.pulseWidth[0]) / (n * Math.PI);
        b = (1 - Math.cos(n * 2 * Math.PI * p.pulseWidth[0])) / (n * Math.PI);
      }
      re[n] = re[size - n] = a / 2;
      im[n] = -b / 2; im[size - n] = b / 2;
    }
    this.fft(re,im,1);
    if(this.engine==='wavetable'&&(this.enhanced||p.wtWarpMode[0]>.5)&&Math.abs(p.wtWarp[0])>0){
      const source=re.slice(),amount=Math.abs(p.wtWarp[0]),mode=Math.round(p.wtWarpMode[0]);
      for(let i=0;i<size;i++){
        const phase=p.wtWarp[0]<0?1-i/size:i/size;let warped=phase;
        if(mode===0)warped=Math.pow(phase,1+amount*3);
        else if(mode===1){const x=Math.sin(2*Math.PI*phase)*(1+amount*7);warped=phase*(1-amount)+(Math.asin(Math.sin(x))+Math.PI/2)/Math.PI*amount;}
        else if(mode===2)warped=(phase*(1+amount*7))%1;
        else {const mirror=phase<.5?phase*2:2-phase*2;warped=phase*(1-amount)+mirror*amount;}
        if(p.wtWarp[0]<0)warped=1-warped;
        const x=((warped%1)+1)%1*size,k=Math.floor(x)%size,t=x-Math.floor(x);re[i]=source[k]+(source[(k+1)%size]-source[k])*t;im[i]=0;
      }
      this.fft(re,im,-1);
      for(let n=limit+1;n<size-limit;n++){re[n]=0;im[n]=0;}
      re[0]=0;im[0]=0;this.fft(re,im,1);
    }
    let peak = 0;
    for (let i = 0; i < size; i++) peak = Math.max(peak, Math.abs(re[i]));
    for (let i = 0; i < size; i++) this.table[i] = re[i] / Math.max(peak, 1e-8);
    if (!this.ready) this.previous.set(this.table);
  }
  process(inputs, outputs, p) {
    if (this.disposed) return false;
    const out = outputs[0][0];
    if (!out) return true;
    const f = p.frequency, detune = p.detune, active = p.active;
    if (active.length === 1 && active[0] === 0) {
      out.fill(0);
      if (this.started) { this.port.postMessage('ended'); return false; }
      return true;
    }
    const base = Math.max(1, f[0] * Math.pow(2, detune[0] / 1200));
    const limit = Math.min(128, Math.floor(sampleRate * .45 / base));
    let changed = limit !== this.lastLimit;
    for (let i = 0; i < phaseSpectralKeys.length; i++) {
      const value = p[phaseSpectralKeys[i]][0];
      if (value !== this.lastParameters[i]) changed = true;
      this.lastParameters[i] = value;
    }
    const inharmonic = this.engine === 'additive' && (this.enhanced || p.inharmonicity[0] > .00001);
    let count = 0, energy = 0;
    if (inharmonic) {
      count = Math.min(this.enhanced?32:this.partialLimit, Math.round(p.harmonics[0]));
      for (let n = 1; n <= count; n++) {
        const peak = Math.exp(-Math.pow((n - p.spectralPeak[0]) / 2, 2));
        this.weights[n] = Math.pow(n, -(2.5 - p.brightness[0] * 2 - p.spectralTilt[0])) *
          (1 - p.shape[0] * .8 + (n % 2 ? p.shape[0] * .8 : 0)) * (1 + peak * p.spectralResonance[0] * 5);
        this.ratios[n] = n * Math.sqrt(1 + p.inharmonicity[0] * n * n);
        energy += Math.abs(this.weights[n]);
        this.steps[n]=Math.pow(2,(this.seeds[n]*p.addPartialDetune[0]+Math.sin(this.elapsed*(.4+n*.017)+this.seeds[n]*Math.PI)*p.addPartialDrift[0])/1200);
        this.decays[n]=p.addSpectralDecay[0]>0?Math.exp(-this.elapsed*(n-1)/31/p.addSpectralDecay[0]):1;
      }
      this.rawWeights.set(this.weights);
      const raw=this.rawWeights,radius=Math.ceil(p.addBlur[0]*4);
      for(let n=1;n<=count;n++){
        let value=raw[n];if(radius>0){let sum=0,w=0;for(let j=Math.max(1,n-radius);j<=Math.min(count,n+radius);j++){const g=radius+1-Math.abs(n-j);sum+=raw[j]*g;w+=g;}value=raw[n]*(1-p.addBlur[0])+sum/w*p.addBlur[0];}
        this.weights[n]=value*p['addBand'+(Math.floor((n-1)/4)+1)][0];
      }
    } else if (changed) this.rebuild(p, limit);
    for (let i = 0; i < out.length; i++) {
      if (active[active.length === 1 ? 0 : i] < .5) { out[i] = 0; continue; }
      if(!this.phaseInitialized){
        this.phase=((p.wtPhase[0]+(p.wtPhaseReset[0]<.5?(currentFrame+i)/sampleRate*base:0)+(p.wtRandomPhase[0]>=.5?Math.random():0))%1+1)%1;
        if(p.addRandomPhase[0]>=.5)for(let n=1;n<33;n++)this.phases[n]=(this.seeds[n]+1)*.5;
        this.phaseInitialized=true;
      }
      this.started = true;
      const hz = Math.max(0, Math.min(sampleRate * .45, f[f.length === 1 ? 0 : i] * Math.pow(2, detune[detune.length === 1 ? 0 : i] / 1200)));
      if (inharmonic) {
        let value = 0;
        for (let n = 1; n <= count; n++) {
          const freq = hz * this.ratios[n]*this.steps[n];
          if (freq >= sampleRate * .45) continue;
          this.phases[n] = (this.phases[n] + freq / sampleRate) % 1;
          const point=this.phases[n]*2048,k=Math.floor(point),t=point-k;
          value += this.weights[n]*this.decays[n]*(this.sines[k]+(this.sines[(k+1)&2047]-this.sines[k])*t);
        }
        out[i] = value / Math.max(1, energy);
      } else {
        const point = this.phase * this.size, index = Math.floor(point), fraction = point - index;
        const next = (index + 1) & (this.size - 1);
        const value = this.table[index] + fraction * (this.table[next] - this.table[index]);
        const old = this.previous[index] + fraction * (this.previous[next] - this.previous[index]);
        out[i] = changed ? old + (value - old) * (i + 1) / out.length : value;
      }
      this.phase = (this.phase + hz / sampleRate) % 1;
      this.elapsed+=1/sampleRate;
    }
    this.ready = true;
    this.lastLimit = limit;
    return true;
  }
}
registerProcessor('phase-spectral-oscillator', PhaseSpectralOscillator);
class PhaseVoiceDrive extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    {name:'amount', defaultValue:0, minValue:0, maxValue:1, automationRate:'a-rate'},
    {name:'active', defaultValue:0, minValue:0, maxValue:1, automationRate:'a-rate'}
  ]; }
  constructor() { super(); this.active = true; this.started = false; this.port.onmessage = ({data}) => { if (data === 'dispose') { this.active = false; this.port.close(); } }; }
  process(inputs, outputs, p) {
    if (!this.active) return false;
    const input = inputs[0] || [], output = outputs[0];
    if (p.active.length === 1 && p.active[0] === 0) { for (const channel of output) channel.fill(0); return !this.started; }
    for (let ch = 0; ch < output.length; ch++) for (let i = 0; i < output[ch].length; i++) {
      if (p.active[p.active.length === 1 ? 0 : i] < .5) { output[ch][i] = 0; continue; }
      this.started = true;
      const source = input[ch] || input[0], x = source ? source[i] : 0;
      const drive = 1 + 14 * p.amount[p.amount.length === 1 ? 0 : i];
      output[ch][i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return true;
  }
}
registerProcessor('phase-voice-drive', PhaseVoiceDrive);
`;

/** A scheduled worklet oscillator with the same start/stop contract as native sources. */
export class SpectralSource extends EventTarget {
  readonly node: AudioWorkletNode;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  constructor(private context: AudioContext | OfflineAudioContext, patch: Patch, engine: string = patch.engine, partialLimit = 32, position = 0) {
    super();
    this.node = new AudioWorkletNode(context, "phase-spectral-oscillator", {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { engine, partialLimit, position, enhanced: needsEngineWorklet(patch) },
    });
    this.node.port.onmessage = ({ data }) => {
      if (data === "ended") this.dispatchEvent(new Event("ended"));
    };
    this.frequency = this.param("frequency");
    this.detune = this.param("detune");
    for (const key of SPECTRAL_KEYS) this.param(key).value = patch[key];
  }
  param(key: string) { return this.node.parameters.get(key)!; }
  connect(destination: AudioNode) { return this.node.connect(destination); }
  start(time: number) { this.param("active").setValueAtTime(1, time); }
  stop(time = this.context.currentTime) {
    this.param("active").cancelScheduledValues(time);
    this.param("active").setValueAtTime(0, time);
  }
  disconnect() {
    this.node.port.postMessage("dispose");
    this.node.disconnect();
  }
}
