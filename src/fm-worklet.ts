import { FM_PARAMS, FM_ALGORITHMS, FM_OP_KEYS, fmCurve } from "./fm-config";
import type { FmParam } from "./fm-config";
import type { Patch } from "./model";

const descriptors = Object.entries(FM_PARAMS).map(([name, [minValue, maxValue, defaultValue]]) => ({
  name, minValue, maxValue, defaultValue,
  automationRate: /(?:Wave|Mode|Attack|Decay|Sustain|Release|Curve)$/.test(name) ? "k-rate" : "a-rate",
}));

// One stereo processor per note, including all unison layers. Routing and feedback
// run sample by sample; there is no render-quantum delay in the feedback loops.
export const fmProcessor = `
const phaseFmCurve = ${fmCurve.toString()};
const phaseFmOperators = ${JSON.stringify(FM_OP_KEYS)};
const phaseFmAlgorithms = ${JSON.stringify(FM_ALGORITHMS)};
const phaseFmSize = 2048;
const phaseFmTables = Array.from({length:4}, () => []);
for (let band=0; band<9; band++) {
  const limit = 1 << band;
  for (let wave=0; wave<4; wave++) {
    const table = new Float32Array(phaseFmSize+1);
    for (let i=0; i<phaseFmSize; i++) {
      const angle = i * 2 * Math.PI / phaseFmSize;
      let value = 0;
      if (wave === 0) value = Math.sin(angle);
      else for (let n=1; n<=limit; n++) {
        if (wave === 1 && n%2) value += 8/(Math.PI*Math.PI) * (n%4===1 ? 1 : -1) * Math.sin(n*angle)/(n*n);
        if (wave === 2) value += -2/Math.PI * Math.sin(n*angle)/n;
        if (wave === 3 && n%2) value += 4/Math.PI * Math.sin(n*angle)/n;
      }
      table[i] = value;
    }
    table[phaseFmSize] = table[0];
    phaseFmTables[wave][band] = table;
  }
}
const phaseFmRead = (table, phase) => {
  const point = phase * phaseFmSize, i = Math.floor(point);
  return table[i] + (point-i) * (table[i+1]-table[i]);
};
class PhaseFmVoice extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    {name:'frequency', defaultValue:440, minValue:0, maxValue:24000, automationRate:'a-rate'},
    {name:'detune', defaultValue:0, minValue:-19200, maxValue:19200, automationRate:'a-rate'},
    {name:'transpose', defaultValue:0, minValue:-24, maxValue:24, automationRate:'a-rate'},
    {name:'unisonDetune', defaultValue:12, minValue:0, maxValue:50, automationRate:'a-rate'},
    {name:'unisonWidth', defaultValue:.7, minValue:0, maxValue:1, automationRate:'a-rate'},
    {name:'gate', defaultValue:1, minValue:0, maxValue:1, automationRate:'a-rate'},
    {name:'active', defaultValue:0, minValue:0, maxValue:1, automationRate:'a-rate'},
    ...${JSON.stringify(descriptors)}
  ]; }
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.layers = Math.max(1, Math.min(8, o.layers || 1));
    this.algorithm = phaseFmAlgorithms[o.algorithm || 0];
    this.phases = new Float64Array(this.layers*3);
    this.previous = new Float64Array(this.layers*3);
    this.drift = Float64Array.from({length:this.layers}, () => (Math.random()-.5)*(o.drift || 0));
    this.elapsed = 0; this.released = false; this.releaseTime = 0;
    this.releaseFrom = new Float64Array(3);
    this.buffers = Array.from({length:12}, () => new Float64Array(128));
    this.started = false; this.disposed = false;
    this.port.onmessage = ({data}) => { if (data==='dispose') { this.disposed=true; this.port.close(); } };
  }
  ads(e, time) {
    if (e.attack>0 && time<e.attack) return phaseFmCurve(time/e.attack, e.attackCurve);
    const x = (time-e.attack)/e.decay;
    return x<1 ? 1+(e.sustain-1)*phaseFmCurve(x, e.decayCurve) : e.sustain;
  }
  process(inputs, outputs, p) {
    if (this.disposed) return false;
    const out = outputs[0], left = out[0], right = out[1] || left;
    if (!left) return true;
    left.fill(0); if (right!==left) right.fill(0);
    if (p.active.length===1 && p.active[0]<.5) {
      if (this.started) { this.port.postMessage('ended'); return false; }
      return true;
    }
    const at = (a, i) => a[a.length===1 ? 0 : i];
    const ops = [1,2,3].map((op) => {
      const k = phaseFmOperators[op], e = {};
      for (const name of ['attack','decay','sustain','release','attackCurve','decayCurve','releaseCurve']) e[name]=p[k[name]][0];
      return {e, wave:Math.round(p[k.wave][0]), fixed:p[k.mode][0]>=.5,
        ratio:p[k.ratio], hz:p[k.hz], fine:p[k.fine], level:p[k.level], feedback:p[k.feedback]};
    });
    const f=this.buffers.slice(0,3), amp=this.buffers.slice(3,6), fb=this.buffers.slice(6,9), index=this.buffers.slice(9,12);
    const edges=this.algorithm.edges, outs=this.algorithm.out;
    const edge21=edges.some((e)=>e[0]===2&&e[1]===1), edge32=edges.some((e)=>e[0]===3&&e[1]===2), edge31=edges.some((e)=>e[0]===3&&e[1]===1);
    const out1=outs.includes(1), out2=outs.includes(2), out3=outs.includes(3);
    const invRate=1/sampleRate, maxHz=sampleRate*.49;
    const normalization=.85/this.layers/Math.sqrt(outs.length);
    const fine=ops.map((o)=>Math.pow(2,o.fine[0]/1200));
    const fixedPitch=Math.pow(2,p.transpose[0]/12),commonPitch=Math.pow(2,p.detune[0]/1200);
    // Envelopes, tuning, levels and edge depths are common to all unison layers.
    // Resolve them once per sample, not for each of the up to eight layers.
    for (let i=0;i<left.length;i++) {
      if (at(p.active,i)<.5) { for (let op=0;op<3;op++) amp[op][i]=0; continue; }
      this.started=true;
      if (!this.released&&at(p.gate,i)<.5) {
        this.released=true; this.releaseTime=this.elapsed;
        for (let op=0;op<3;op++) this.releaseFrom[op]=this.ads(ops[op].e,this.elapsed);
      }
      const base=Math.max(.001,at(p.frequency,i)), pitch=p.detune.length===1?commonPitch:Math.pow(2,at(p.detune,i)/1200);
      const fixedTranspose=p.transpose.length===1?fixedPitch:Math.pow(2,at(p.transpose,i)/12);
      for (let op=0;op<3;op++) {
        const o=ops[op],e=o.e;
        const env=this.released ? this.releaseFrom[op]*(1-phaseFmCurve((this.elapsed-this.releaseTime)/e.release,e.releaseCurve)) : this.ads(e,this.elapsed);
        f[op][i]=Math.min(maxHz,(o.fixed?at(o.hz,i)*fixedTranspose:base*at(o.ratio,i))*pitch*(o.fine.length===1?fine[op]:Math.pow(2,at(o.fine,i)/1200)));
        amp[op][i]=env*at(o.level,i);
        fb[op][i]=(o.fixed?f[op][i]:base)*.7*at(o.feedback,i);
      }
      index[0][i]=edge21?at(p.fmIndex21,i):0;
      index[1][i]=edge32?at(p.fmIndex32,i):0;
      index[2][i]=edge31?at(p.fmIndex31,i):0;
      this.elapsed+=invRate;
    }
    // Select one conservative, band-limited table for each operator/block.
    // This also avoids discontinuous table switches within an FM cycle.
    const max=[0,0,0], feedbackPeak=[0,0,0];
    for(let i=0;i<left.length;i++) for(let op=0;op<3;op++) {
      max[op]=Math.max(max[op],f[op][i]); feedbackPeak[op]=Math.max(feedbackPeak[op],fb[op][i]*1.5);
    }
    const excursion=max.map((hz,op)=>hz+feedbackPeak[op]);
    for(const edge of edges) {
      const depth=p[edge[2]];
      let peak=depth[0];for(let i=1;i<depth.length;i++)peak=Math.max(peak,depth[i]);
      excursion[edge[1]-1]+=max[edge[0]-1]*peak;
    }
    const tables=ops.map((o,op)=>{
      const limit=Math.max(1,Math.min(256,Math.floor(sampleRate*.45/Math.max(1,excursion[op]*1.04))));
      return phaseFmTables[o.wave][Math.max(0,Math.floor(Math.log2(limit)))];
    });
    const f1=f[0],f2=f[1],f3=f[2],a1=amp[0],a2=amp[1],a3=amp[2],b1=fb[0],b2=fb[1],b3=fb[2];
    const i21=index[0],i32=index[1],i31=index[2],t1=tables[0],t2=tables[1],t3=tables[2];
    for(let layer=0;layer<this.layers;layer++) {
      const slot=layer*3,position=this.layers===1?0:layer/(this.layers-1)*2-1;
      let p1=this.phases[slot],p2=this.phases[slot+1],p3=this.phases[slot+2];
      let old1=this.previous[slot],old2=this.previous[slot+1],old3=this.previous[slot+2];
      const scalarPitch=p.unisonDetune.length===1,scalarPan=p.unisonWidth.length===1;
      const spread=Math.pow(2,(position*p.unisonDetune[0]+this.drift[layer])/1200);
      const angle=(position*p.unisonWidth[0]+1)*Math.PI/4;
      const lGain=normalization*Math.cos(angle),rGain=normalization*Math.sin(angle);
      for(let i=0;i<left.length;i++) {
        if(at(p.active,i)<.5)continue;
        const pitch=scalarPitch?spread:Math.pow(2,(position*at(p.unisonDetune,i)+this.drift[layer])/1200);
        const hz1=f1[i]*pitch,hz2=f2[i]*pitch,hz3=f3[i]*pitch;
        const v3=phaseFmRead(t3,p3)*a3[i];
        const v2=phaseFmRead(t2,p2)*a2[i];
        const v1=phaseFmRead(t1,p1)*a1[i];
        let next=p3+Math.max(-maxHz,Math.min(maxHz,hz3+old3*b3[i]))*invRate;p3=next-Math.floor(next);
        next=p2+Math.max(-maxHz,Math.min(maxHz,hz2+old2*b2[i]+v3*hz3*i32[i]))*invRate;p2=next-Math.floor(next);
        next=p1+Math.max(-maxHz,Math.min(maxHz,hz1+old1*b1[i]+v2*hz2*i21[i]+v3*hz3*i31[i]))*invRate;p1=next-Math.floor(next);
        old1=Math.max(-1.5,Math.min(1.5,v1));old2=Math.max(-1.5,Math.min(1.5,v2));old3=Math.max(-1.5,Math.min(1.5,v3));
        const mixed=(out1?v1:0)+(out2?v2:0)+(out3?v3:0);
        if(scalarPan){left[i]+=mixed*lGain;if(right!==left)right[i]+=mixed*rGain;}
        else {const pan=(position*at(p.unisonWidth,i)+1)*Math.PI/4;left[i]+=mixed*normalization*Math.cos(pan);if(right!==left)right[i]+=mixed*normalization*Math.sin(pan);}
      }
      this.phases[slot]=p1;this.phases[slot+1]=p2;this.phases[slot+2]=p3;
      this.previous[slot]=old1;this.previous[slot+1]=old2;this.previous[slot+2]=old3;
    }
    return true;
  }
}
registerProcessor('phase-fm-voice',PhaseFmVoice);
`;

export class FmSource extends EventTarget {
  readonly node: AudioWorkletNode;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  constructor(private context: AudioContext | OfflineAudioContext, p: Patch) {
    super();
    this.node = new AudioWorkletNode(context, "phase-fm-voice", {
      numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { algorithm: Math.max(0, FM_ALGORITHMS.findIndex((a) => a.id === p.fmAlgorithm)), layers: Math.round(p.unison), drift: p.drift },
    });
    this.frequency = this.param("frequency"); this.detune = this.param("detune");
    for (const key of Object.keys(FM_PARAMS) as FmParam[]) this.param(key).value = p[key];
    this.param("transpose").value = p.tune;
    this.param("unisonDetune").value = p.unisonDetune;
    this.param("unisonWidth").value = p.unisonWidth;
    this.node.port.onmessage = ({ data }) => { if (data === "ended") this.dispatchEvent(new Event("ended")); };
  }
  param(key: string) { return this.node.parameters.get(key)!; }
  connect(destination: AudioNode) { return this.node.connect(destination); }
  start(time: number) { this.param("active").setValueAtTime(1, time); this.param("gate").setValueAtTime(1, time); }
  release(time: number) { this.param("gate").cancelScheduledValues(time); this.param("gate").setValueAtTime(0, time); }
  stop(time = this.context.currentTime) { this.param("active").cancelScheduledValues(time); this.param("active").setValueAtTime(0, time); }
  disconnect() { this.node.port.postMessage("dispose"); this.node.port.close(); this.node.disconnect(); }
}
