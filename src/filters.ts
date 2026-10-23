import { PARAMS } from "./model";
import type { Param, Patch } from "./model";
import { FILTER_AUDIO_PARAMS } from "./advanced-filter-worklet";
import { needsAdvancedFilter } from "./filter-config";
import { createFilterDsp } from "./filter-dsp";
import type { FilterDspSettings } from "./filter-dsp";

type Context = AudioContext | OfflineAudioContext;
type Branch = { input: AudioNode; gain: GainNode; nodes: AudioNode[]; connections: [AudioNode, AudioNode | AudioParam][]; worklet?: AudioWorkletNode };
const dsp = createFilterDsp();
export function filterSettings(p: Patch, note = 60): FilterDspSettings {
  return { ...p, native: !needsAdvancedFilter(p), type: p.filterType, mode: p.multimodeType, character: p.filterCharacter, frequency: p.cutoff, detune: 0, note, polarity: p.combPolarity === "negative" ? -1 : 1 };
}
function nativeMode(p: Patch) {
  const m = dsp.mode(filterSettings(p));
  return { type: m.name as BiquadFilterType, stages: m.stages, peak: m.name === "peaking" };
}
const controlDefaults: Record<string, number> = {
  detune: 0, note: 60, polarity: 1, drive: PARAMS.drive[2],
  combFeedback: PARAMS.combFeedback[2], combDamping: PARAMS.combDamping[2], combMix: PARAMS.combMix[2],
  ...Object.fromEntries(FILTER_AUDIO_PARAMS.map((key) => [key, PARAMS[key][2]])),
};
/** Shared control sources retain scheduled envelopes and modulation across topology crossfades. */
export class VoiceFilter {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly frequency: AudioParam;
  readonly Q: AudioParam;
  readonly detune: AudioParam;
  readonly combFeedback: AudioParam;
  readonly combDamping: AudioParam;
  readonly combMix: AudioParam;
  private sources: Record<string, ConstantSourceNode>;
  private branches = new Set<Branch>();
  private branch?: Branch;
  private shape = "";
  private timers = new Set<number>();
  private disposed = false;
  constructor(private context: Context, private bypass = false) {
    this.input = context.createGain(); this.output = context.createGain();
    this.sources = Object.fromEntries(Object.entries({ frequency: 2400, resonance: 2.2, ...controlDefaults }).map(([key, value]) => {
      const source = context.createConstantSource(); source.offset.value = value; source.start(); return [key, source];
    }));
    this.frequency = this.sources.frequency.offset; this.Q = this.sources.resonance.offset;
    this.detune = this.sources.detune.offset; this.combFeedback = this.sources.combFeedback.offset;
    this.combDamping = this.sources.combDamping.offset; this.combMix = this.sources.combMix.offset;
    if (bypass) this.input.connect(this.output);
  }
  parameter(key: string) { return this.sources[key]?.offset; }
  setNote(note: number, when: number) { this.sources.note.offset.setValueAtTime(note, when); }
  private destroy(branch: Branch) {
    if (!this.branches.delete(branch)) return;
    this.input.disconnect(branch.input);
    branch.worklet?.port.postMessage("dispose");
    for (const [source, target] of branch.connections) {
      if (target instanceof AudioParam) source.disconnect(target); else source.disconnect(target);
    }
    for (const node of branch.nodes) node.disconnect();
  }
  private setShape(p: Patch, when: number) {
    if (this.bypass || this.disposed) return false;
    const advanced = needsAdvancedFilter(p), mode = nativeMode(p);
    const shape = `${p.filterType}:${p.multimodeType}:${advanced ? p.filterCharacter : "native"}:${p.drivePosition >= .5 ? "post" : "pre"}:${p.combMode}:${p.combInterpolation}`;
    if (this.shape === shape) return false;
    const c = this.context, gain = c.createGain(), nodes: AudioNode[] = [gain], connections: Branch["connections"] = [];
    const wire = (key: string, target: AudioParam | AudioNode, scale = 1) => {
      const source = this.sources[key];
      if (target instanceof AudioParam) target.value = 0;
      if (scale === 1) { if (target instanceof AudioParam) source.connect(target); else source.connect(target); connections.push([source, target]); }
      else { const weight = c.createGain(); weight.gain.value = scale; source.connect(weight); connections.push([source, weight]); if (target instanceof AudioParam) weight.connect(target); else weight.connect(target); nodes.push(weight); }
    };
    let input: AudioNode, worklet: AudioWorkletNode | undefined;
    if (advanced || p.filterType === "comb") {
      if (!c.audioWorklet || typeof AudioWorkletNode === "undefined") throw new Error("Diese Filter benötigen AudioWorklet über HTTPS oder localhost.");
      worklet = new AudioWorkletNode(c, advanced ? "phase-advanced-filter" : "phase-comb-filter", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit",
        processorOptions: { type: p.filterType, mode: p.multimodeType, character: p.filterCharacter, drivePosition: p.drivePosition },
      });
      worklet.parameters.forEach((param, key) => wire(({ feedback: "combFeedback", damping: "combDamping", mix: "combMix" } as Record<string, string>)[key] ?? key, param));
      input = worklet; worklet.connect(gain); nodes.push(worklet);
    } else {
      let first: BiquadFilterNode | undefined, last: BiquadFilterNode | undefined;
      for (let i = 0; i < mode.stages; i++) {
        const filter = c.createBiquadFilter(); filter.type = mode.type;
        wire("frequency", filter.frequency); wire("detune", filter.detune);
        if (mode.peak) { filter.Q.value = 1.2; wire("filterPeakGain", filter.gain, 1 / mode.stages); }
        else {
          // Web Audio adds the legacy .0001 intrinsic Q to the shared resonance input.
          const weight = c.createGain(); weight.gain.value = 1 / mode.stages;
          wire("resonance", weight); filter.Q.value = .0001; weight.connect(filter.Q); nodes.push(weight);
        }
        first ??= filter; last?.connect(filter); last = filter; nodes.push(filter);
      }
      last!.connect(gain); input = first!;
    }
    const old = this.branch, branch: Branch = { input, gain, nodes, connections, worklet };
    this.input.connect(input); gain.connect(this.output); gain.gain.value = old ? 0 : 1;
    if (old) {
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(1, when + .012);
      old.gain.gain.cancelScheduledValues(when); old.gain.gain.setTargetAtTime(0, when, .004);
      if (c instanceof AudioContext) {
        const timer = window.setTimeout(() => { this.timers.delete(timer); this.destroy(old); }, Math.max(0, when - c.currentTime) * 1000 + 80);
        this.timers.add(timer);
      }
    }
    this.branches.add(branch); this.branch = branch; this.shape = shape; return true;
  }
  private controls(p: Patch, when: number, previous?: Patch, scheduled = false, force = false) {
    for (const key of Object.keys(controlDefaults)) {
      if (key === "detune" || key === "note") continue;
      const value = key === "polarity" ? p.combPolarity === "negative" ? -1 : 1 : p[key as Param];
      const old = key === "polarity" ? previous?.combPolarity === "negative" ? -1 : 1 : previous?.[key as Param];
      const param = this.sources[key].offset;
      if (scheduled) param.setValueAtTime(value, when);
      else if (force || old !== value) { param.cancelScheduledValues(when); param.setTargetAtTime(value, when, .015); }
    }
  }
  update(p: Patch, previous: Patch | undefined, when: number) { this.controls(p, when, previous, false, this.setShape(p, when)); }
  schedule(p: Patch, when: number) { this.setShape(p, when); this.controls(p, when, undefined, true); }
  connect(destination: AudioNode) { return this.output.connect(destination); }
  reset() { for (const b of this.branches) b.worklet?.port.postMessage("reset"); }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const timer of this.timers) window.clearTimeout(timer); this.timers.clear();
    for (const branch of this.branches) this.destroy(branch);
    for (const source of Object.values(this.sources)) { source.stop(); source.disconnect(); }
    this.input.disconnect(); this.output.disconnect();
  }
}
/** Prepare the immutable display settings once per curve, outside its frequency loop. */
export function filterResponse(p: Patch, sampleRate = 48000, note = 60) {
  const settings = filterSettings(p, note);
  // Small-signal Drive gain. Native pre-drive uses a 2048-point interpolated
  // curve; the worklet variant uses the analytic tanh transfer.
  const amount = 1 + p.drive * 14, preWorklet = p.mods.some((m) => m.target === "drive" && m.amount !== 0);
  const drive = p.drive < .005 && !(preWorklet && p.drivePosition < .5) ? 1 : p.drivePosition >= .5 || preWorklet
    ? amount / Math.tanh(amount) : 2047 * Math.tanh(amount / 2047) / Math.tanh(amount);
  return (hz: number, channel = 0) => Math.hypot(...dsp.response(settings, hz, sampleRate, channel)) * drive;
}
