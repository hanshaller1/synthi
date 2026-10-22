import { EffectRack } from "./effects";
import { clamp, makePatch } from "./model";
import type { MasterFx, Patch } from "./model";
type Context = AudioContext | OfflineAudioContext;
export const EQ_FREQUENCIES = {
  2: [150, 4000],
  3: [120, 1000, 8000],
  8: [63, 125, 250, 500, 1000, 2000, 4000, 8000],
};
export function heatTransfer(
  x: number,
  mode: number,
  amount: number,
  bias: number,
) {
  if (amount < 0.0001) return x;
  const k = 1 + amount * [3, 12, 7, 18, 28, 40, 20, 70][mode];
  const raw = (input: number) => {
    if (mode === 0) return clamp(input * (1 + amount * 2), -1, 1);
    if (mode === 2)
      return (
        Math.tanh(input * k) / k + Math.sin(input * Math.PI) * amount * 0.4
      );
    if (mode === 3) return Math.tanh(input * k);
    if (mode === 4) return clamp(input * k, -0.7, 0.9) * 0.8;
    if (mode === 5) return (Math.atan(input * k) * 2) / Math.PI;
    if (mode === 6)
      return Math.sign(input) * (1 - Math.exp(-Math.abs(input * k))) * 0.8;
    if (mode === 7) return Math.tanh(input * k) * 0.75;
    return Math.tanh(input * k) / Math.tanh(k);
  };
  return clamp(raw(x + bias) - raw(bias), -1, 1);
}
export class MasterProcessor {
  private nodes: AudioNode[] = [];
  private dry: GainNode;
  private wet: GainNode;
  private shaper: WaveShaperNode;
  private tone: BiquadFilterNode;
  private lowCut: BiquadFilterNode;
  private dc: BiquadFilterNode;
  private trim: GainNode;
  private eq: BiquadFilterNode[];
  private compressor: DynamicsCompressorNode;
  private makeup: GainNode;
  private matrix: GainNode[];
  private space: EffectRack;
  private spacePatch: Patch;
  private curveKey = "";
  constructor(
    private c: Context,
    input: AudioNode,
    output: AudioNode,
  ) {
    const node = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };
    const gain = () => node(c.createGain());
    this.dry = gain();
    this.wet = gain();
    this.trim = gain();
    this.wet.gain.value = 0;
    this.shaper = node(c.createWaveShaper());
    this.shaper.oversample = "2x";
    this.tone = node(c.createBiquadFilter());
    this.tone.type = "lowpass";
    this.lowCut = node(c.createBiquadFilter());
    this.lowCut.type = "highpass";
    this.dc = node(c.createBiquadFilter());
    this.dc.type = "highpass";
    this.dc.frequency.value = 15;
    input.connect(this.dry).connect(this.trim);
    input
      .connect(this.lowCut)
      .connect(this.shaper)
      .connect(this.dc)
      .connect(this.tone)
      .connect(this.wet)
      .connect(this.trim);
    this.eq = Array.from({ length: 8 }, () => node(c.createBiquadFilter()));
    this.trim.connect(this.eq[0]);
    this.eq.forEach((filter, i) => {
      if (i < 7) filter.connect(this.eq[i + 1]);
    });
    this.compressor = node(c.createDynamicsCompressor());
    this.compressor.ratio.value = 1;
    this.compressor.threshold.value = 0;
    this.makeup = gain();
    this.eq[7].connect(this.compressor).connect(this.makeup);
    const split = node(c.createChannelSplitter(2)),
      merge = node(c.createChannelMerger(2));
    this.makeup.connect(split);
    this.matrix = Array.from({ length: 4 }, gain);
    // L' = (L+R)/2 + width*(L-R)/2; R' = (L+R)/2 - width*(L-R)/2.
    split.connect(this.matrix[0], 0);
    split.connect(this.matrix[1], 1);
    split.connect(this.matrix[2], 0);
    split.connect(this.matrix[3], 1);
    this.matrix[0].connect(merge, 0, 0);
    this.matrix[1].connect(merge, 0, 0);
    this.matrix[2].connect(merge, 0, 1);
    this.matrix[3].connect(merge, 0, 1);
    const spaceInput = gain();
    merge.connect(spaceInput);
    this.space = new EffectRack(c, spaceInput, output);
    this.spacePatch = makePatch({
      fxEnabled: {
        saturationMode: false,
        modulationMode: false,
        delayMode: false,
        reverbMode: false,
      },
      reverbMode: "hall",
      delayMode: "pingpong",
    });
  }
  update(p: MasterFx) {
    const time = this.c.currentTime;
    const set = (param: AudioParam, value: number) =>
      param.setTargetAtTime(value, time, 0.02);
    const active = p.enabled && p.driveEnabled;
    set(this.dry.gain, active ? 1 - p.mix : 1);
    set(this.wet.gain, active ? p.mix : 0);
    set(this.tone.frequency, p.tone);
    set(this.lowCut.frequency, p.lowCut);
    set(this.trim.gain, 10 ** ((p.enabled ? p.output : 0) / 20));
    const key = [p.driveMode, p.drive, p.bias].join(":");
    if (this.curveKey !== key) {
      const curve = new Float32Array(8192);
      for (let i = 0; i < curve.length; i++)
        curve[i] = heatTransfer(
          (i * 2) / (curve.length - 1) - 1,
          p.driveMode,
          p.drive,
          p.bias,
        );
      this.shaper.curve = curve;
      this.curveKey = key;
    }
    const frequencies = EQ_FREQUENCIES[p.eqBands],
      values = p.eqBands === 2 ? p.eq2 : p.eqBands === 3 ? p.eq3 : p.eq8;
    this.eq.forEach((filter, i) => {
      filter.type =
        p.eqBands === 8
          ? "peaking"
          : i === 0
            ? "lowshelf"
            : i === p.eqBands - 1
              ? "highshelf"
              : "peaking";
      set(filter.frequency, frequencies[i] ?? 1000);
      set(filter.Q, p.eqBands === 8 ? 1.1 : 0.7);
      set(filter.gain, p.enabled && p.eqEnabled ? (values[i] ?? 0) : 0);
    });
    set(
      this.compressor.threshold,
      p.enabled && p.compressorEnabled ? p.threshold : 0,
    );
    set(this.compressor.ratio, p.enabled && p.compressorEnabled ? p.ratio : 1);
    set(this.compressor.knee, 10);
    set(this.compressor.attack, p.attack);
    set(this.compressor.release, p.release);
    set(
      this.makeup.gain,
      10 ** ((p.enabled && p.compressorEnabled ? p.makeup : 0) / 20),
    );
    const width = p.enabled ? p.width : 1;
    [
      0.5 + width * 0.5,
      0.5 - width * 0.5,
      0.5 - width * 0.5,
      0.5 + width * 0.5,
    ].forEach((value, i) => set(this.matrix[i].gain, value));
    const old = this.spacePatch;
    this.spacePatch = {
      ...old,
      delay: p.delay,
      delayTime: p.delayTime,
      feedback: p.feedback,
      reverb: p.reverb,
      reverbSize: p.reverbSize,
      fxEnabled: {
        ...old.fxEnabled,
        delayMode: p.enabled && p.delayEnabled,
        reverbMode: p.enabled && p.reverbEnabled,
      },
    };
    this.space.updateEffects(this.spacePatch, old, time);
  }
  dispose() {
    this.space.disposeEffects();
    this.nodes.forEach((node) => node.disconnect());
  }
}
