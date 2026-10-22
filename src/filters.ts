import { clamp } from "./model";
import type { Patch } from "./model";

type Context = AudioContext | OfflineAudioContext;
type Branch = {
  input: AudioNode;
  gain: GainNode;
  nodes: AudioNode[];
  controls?: Map<string, AudioParam>;
  worklet?: AudioWorkletNode;
};

function nativeMode(p: Patch): {
  type: BiquadFilterType;
  stages: number;
  peak: boolean;
} {
  if (p.filterType !== "multimode")
    return {
      type: p.filterType === "comb" ? "allpass" : p.filterType,
      stages: 1,
      peak: false,
    };
  const mode = p.multimodeType;
  return {
    type: mode.startsWith("lp")
      ? "lowpass"
      : mode.startsWith("hp")
        ? "highpass"
        : mode === "bp"
          ? "bandpass"
          : mode === "peak"
            ? "peaking"
            : "notch",
    stages: mode.endsWith("4") ? 2 : 1,
    peak: mode === "peak",
  };
}

/** A filter with one automatable Hz input for envelopes and audio-rate LFOs. */
export class VoiceFilter {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly frequency: AudioParam;
  readonly Q: AudioParam;
  private frequencySource: ConstantSourceNode;
  private resonanceSource: ConstantSourceNode;
  private branches = new Set<Branch>();
  private branch?: Branch;
  private shape = "";
  private timers = new Set<number>();
  private disposed = false;

  constructor(
    private context: Context,
    private bypass = false,
  ) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.frequencySource = context.createConstantSource();
    this.resonanceSource = context.createConstantSource();
    this.frequency = this.frequencySource.offset;
    this.Q = this.resonanceSource.offset;
    this.frequency.value = 2400;
    this.Q.value = 2.2;
    this.frequencySource.start();
    this.resonanceSource.start();
    if (bypass) this.input.connect(this.output);
  }

  private destroy(branch: Branch) {
    if (!this.branches.delete(branch)) return;
    this.input.disconnect(branch.input);
    if (branch.worklet) {
      branch.worklet.port.postMessage("dispose");
    }
    for (const node of branch.nodes) {
      // A shared control source must not retain the old branch's AudioParams.
      if (node instanceof BiquadFilterNode)
        this.frequencySource.disconnect(node.frequency);
      node.disconnect();
    }
    if (branch.worklet)
      this.frequencySource.disconnect(branch.controls!.get("frequency")!);
    for (const node of branch.nodes)
      if (node instanceof GainNode && node !== branch.gain) {
        try {
          this.resonanceSource.disconnect(node);
        } catch {
          /* Not a resonance control. */
        }
      }
  }

  private setShape(p: Patch, when: number) {
    if (this.bypass || this.disposed) return false;
    const shape =
      p.filterType === "multimode"
        ? `multimode:${p.multimodeType}`
        : p.filterType;
    if (this.shape === shape) return false;
    const c = this.context,
      gain = c.createGain(),
      nodes: AudioNode[] = [gain];
    let input: AudioNode;
    let controls: Map<string, AudioParam> | undefined;
    let worklet: AudioWorkletNode | undefined;
    if (p.filterType === "comb") {
      if (!c.audioWorklet || typeof AudioWorkletNode === "undefined")
        throw new Error(
          "Combfilter benötigen AudioWorklet in einem aktuellen Browser über HTTPS oder localhost.",
        );
      worklet = new AudioWorkletNode(c, "phase-comb-filter", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: "explicit",
      });
      controls = new Map<string, AudioParam>();
      worklet.parameters.forEach((param, key) => controls!.set(key, param));
      controls.get("frequency")!.value = 0;
      this.frequencySource.connect(controls.get("frequency")!);
      worklet.connect(gain);
      input = worklet;
      nodes.push(worklet);
    } else {
      const mode = nativeMode(p);
      let first: BiquadFilterNode | undefined, last: AudioNode | undefined;
      for (let stage = 0; stage < mode.stages; stage++) {
        const filter = c.createBiquadFilter(),
          resonance = c.createGain();
        filter.type = mode.type;
        filter.frequency.value = 0;
        this.frequencySource.connect(filter.frequency);
        resonance.gain.value = 1 / mode.stages;
        this.resonanceSource.connect(resonance);
        if (mode.peak) {
          filter.Q.value = 1.2;
          filter.gain.value = 0;
          resonance.connect(filter.gain);
        } else {
          filter.Q.value = 0.0001;
          resonance.connect(filter.Q);
        }
        first ??= filter;
        last?.connect(filter);
        last = filter;
        nodes.push(filter, resonance);
      }
      last!.connect(gain);
      input = first!;
    }
    const old = this.branch,
      branch: Branch = { input, gain, nodes, controls, worklet };
    this.input.connect(input);
    gain.connect(this.output);
    gain.gain.value = old ? 0 : 1;
    if (old) {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(1, when + 0.012);
      old.gain.gain.cancelScheduledValues(when);
      old.gain.gain.setTargetAtTime(0, when, 0.004);
      if (c instanceof AudioContext) {
        const timer = window.setTimeout(
          () => {
            this.timers.delete(timer);
            this.destroy(old);
          },
          Math.max(0, when - c.currentTime) * 1000 + 80,
        );
        this.timers.add(timer);
      }
    }
    this.branches.add(branch);
    this.branch = branch;
    this.shape = shape;
    return true;
  }

  private controls(
    p: Patch,
    when: number,
    previous?: Patch,
    scheduled = false,
    force = false,
  ) {
    if (!this.branch?.controls) return;
    const values = {
      feedback: p.combFeedback,
      damping: p.combDamping,
      mix: p.combMix,
      polarity: p.combPolarity === "negative" ? -1 : 1,
    };
    const old = previous && {
      feedback: previous.combFeedback,
      damping: previous.combDamping,
      mix: previous.combMix,
      polarity: previous.combPolarity === "negative" ? -1 : 1,
    };
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      const param = this.branch.controls.get(key)!;
      if (scheduled) param.setValueAtTime(values[key], when);
      else if (force || old?.[key] !== values[key]) {
        param.cancelScheduledValues(when);
        param.setTargetAtTime(values[key], when, 0.015);
      }
    }
  }

  update(p: Patch, previous: Patch | undefined, when: number) {
    this.controls(p, when, previous, false, this.setShape(p, when));
  }
  schedule(p: Patch, when: number) {
    this.setShape(p, when);
    this.controls(p, when, undefined, true);
  }
  connect(destination: AudioNode) {
    return this.output.connect(destination);
  }
  reset() {
    for (const branch of this.branches) branch.worklet?.port.postMessage("reset");
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    for (const branch of this.branches) this.destroy(branch);
    this.frequencySource.stop();
    this.resonanceSource.stop();
    this.frequencySource.disconnect();
    this.resonanceSource.disconnect();
    this.input.disconnect();
    this.output.disconnect();
  }
}

type Complex = [number, number];
const multiply = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const divide = (a: Complex, b: Complex): Complex => {
  const scale = Math.max(1e-20, b[0] * b[0] + b[1] * b[1]);
  return [
    (a[0] * b[0] + a[1] * b[1]) / scale,
    (a[1] * b[0] - a[0] * b[1]) / scale,
  ];
};

/** Response of the same native biquad / fractional-delay comb signal paths. */
export function filterMagnitude(p: Patch, hz: number, sampleRate = 48000) {
  const w = (2 * Math.PI * hz) / sampleRate,
    z: Complex = [Math.cos(w), -Math.sin(w)];
  const cutoff = clamp(
    p.cutoff,
    20,
    sampleRate * (p.filterType === "comb" ? 0.45 : 0.5),
  );
  if (p.filterType === "comb") {
    const delay = sampleRate / cutoff,
      whole = Math.floor(delay),
      fraction = delay - whole;
    const d0: Complex = [Math.cos(w * whole), -Math.sin(w * whole)];
    const d1 = multiply(d0, z);
    const delayResponse: Complex = [
      d0[0] * (1 - fraction) + d1[0] * fraction,
      d0[1] * (1 - fraction) + d1[1] * fraction,
    ];
    const alpha =
      1 -
      Math.exp(
        (-2 * Math.PI * Math.min(sampleRate * 0.45, p.combDamping)) /
          sampleRate,
      );
    const damping = divide(
      [alpha, 0],
      [1 - (1 - alpha) * z[0], -(1 - alpha) * z[1]],
    );
    const loop = multiply(delayResponse, damping);
    const g = p.combFeedback * (p.combPolarity === "negative" ? -1 : 1);
    const wet = divide(
      [1 - p.combFeedback, 0],
      [1 - g * loop[0], -g * loop[1]],
    );
    return Math.hypot(1 - p.combMix + p.combMix * wet[0], p.combMix * wet[1]);
  }
  const mode = nativeMode(p),
    w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cosine = Math.cos(w0),
    sine = Math.sin(w0),
    q = 0.0001 + p.resonance / mode.stages;
  const alpha =
    sine /
    (2 *
      (mode.type === "lowpass" || mode.type === "highpass"
        ? 10 ** (q / 20)
        : mode.peak
          ? 1.2
          : q));
  let b: number[],
    a = [1 + alpha, -2 * cosine, 1 - alpha];
  if (mode.type === "lowpass")
    b = [(1 - cosine) / 2, 1 - cosine, (1 - cosine) / 2];
  else if (mode.type === "highpass")
    b = [(1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2];
  else if (mode.type === "bandpass") b = [alpha, 0, -alpha];
  else if (mode.type === "notch") b = [1, -2 * cosine, 1];
  else {
    const A = 10 ** (p.resonance / 40);
    b = [1 + alpha * A, -2 * cosine, 1 - alpha * A];
    a = [1 + alpha / A, -2 * cosine, 1 - alpha / A];
  }
  const z2 = multiply(z, z),
    response = (v: number[]): Complex => [
      v[0] + v[1] * z[0] + v[2] * z2[0],
      v[1] * z[1] + v[2] * z2[1],
    ];
  const result = divide(response(b), response(a));
  return Math.hypot(...result) ** mode.stages;
}
