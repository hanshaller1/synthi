import { Modulator } from "./modulation-worklet";
import { PARAMETER_REGISTRY, setParameters } from "./parameters";
import { DYNAMIC_META } from "./parameter-spec";
import { getParameter } from "./parameters";
import { EngineSource } from "./engine-worklet";
import { ENGINE_KEYS, engineOwner, needsEngineWorklet, sampleRegion, sampleSliceSelection } from "./engine-config";
import { grainEnvelope, quantizeGrain, GRAIN_BEATS } from "./grain-tools";
import { FILTER_KEYS, FILTER_TARGETS, filterAdsrAt, filterAdsrReleaseAt, filterCurve, filterFrequencyAt, filterReleaseFrequencyAt, filterLevels, needsAdvancedFilter } from "./filter-config";
import { FmSource } from "./fm-worklet";
import { FM_KEYS, FM_TARGETS, migrateFmLocks } from "./fm-config";
import { sequenceFrame } from "./sequence";
import type { ChanceState } from "./sequence";
import { SAMPLE_LIBRARY, sampleData, wavetableSpectrum } from "./catalog";
import { makeLfoSource } from "./lfo";
import type { Lfo } from "./model";
import { MasterProcessor } from "./master-audio";
import {
  TRACK_COUNT,
  LOCK_PARAMS,
  clamp,
  midiHz,
  stepIndex,
} from "./model";
import { EffectRack } from "./effects";
import { FX_PARAMETERS, FX_SLOT_MODES } from "./fx-spec";
import { VoiceFilter } from "./filters";
import { prepareFilterWorklet } from "./filter-worklet";
import { SpectralSource, SPECTRAL_KEYS } from "./spectral-worklet";
import { modulatedNumber, modulationScale, triggerPatch, requiresModulationWorklet } from "./modulation";
import { PARAMS, MOD_TARGETS } from "./model";
import type { Envelope, ModTarget, Numbers, Param, Patch, Project, Track } from "./model";

type Context = AudioContext | OfflineAudioContext;
async function decodeSample(context: Context, data: string): Promise<AudioBuffer> {
  const raw=atob(data.slice(data.indexOf(",")+1)),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const buffer=await context.decodeAudioData(bytes.buffer);
  if(buffer.duration>60)throw new Error("Samples dürfen maximal 60 Sekunden lang sein.");
  return buffer;
}
type Source = OscillatorNode | AudioBufferSourceNode | ConstantSourceNode | SpectralSource | FmSource | EngineSource;
type Voice = {
  track: number;
  note: number;
  velocity: number;
  time: number;
  amp: GainNode;
  volume: GainNode;
  updateLevel: (value: number, time: number) => void;
  updateFilter: (patch: Patch, previous: Patch | undefined, time: number) => void;
  updateFm: (patch: Patch, previous: Patch | undefined, time: number) => void;
  filter: VoiceFilter;
  panner: StereoPannerNode;
  sources: Source[];
  nodes: AudioNode[];
  gates: AudioParam[];
  patch: Patch;
  basePatch: Patch;
  retune: (note: number, time: number) => void;
  released: boolean;
  releaseAt: number;
  end: number;
  pitch: AudioParam[];
  pitchOffsets: Map<AudioParam, number>;
  modwheelParams: AudioParam[];
  modulator?: Modulator;
  effectId: number;
  lfoControls: {
    index: number;
    source: AudioBufferSourceNode | ConstantSourceNode;
    gain: GainNode;
    scale: number;
    config: Lfo;
  }[];
  cleanupTimer?: number;
  release: (time: number) => void;
};
type Bus = EffectRack & {
  input: GainNode;
  paraFilter: VoiceFilter;
  paraAmp: GainNode;
  level: GainNode;
  pan: StereoPannerNode;
  paraStart: number;
  paraPatch: Patch | null;
};
const EPS = 0.00001;
const NOISE_GAIN = 0.1;

function envelopeAt(e: Envelope, elapsed: number) {
  if (elapsed < e.attack) return Math.max(EPS, elapsed / e.attack);
  if (elapsed < e.attack + e.decay)
    return 1 + ((e.sustain - 1) * (elapsed - e.attack)) / e.decay;
  return Math.max(EPS, e.sustain);
}
const filterEnvelopeAt = filterFrequencyAt;
// Curve zero uses the original ramp endpoints exactly. Curved segments use
// scheduled ramps, which can safely be interrupted by note-off/legato.
function scheduleFilterAD(param: AudioParam, p: Patch, origin: number, now = origin, hz = true, scale = 1) {
  const elapsed = Math.max(0, now - origin), levels = filterLevels(p);
  if (now === origin) param.setValueAtTime(hz ? p.cutoff : EPS, now);
  const segment = (from: number, duration: number, curve: number, a: number, b: number) => {
    if (elapsed >= from + duration) return;
    const begin = Math.max(0, (elapsed - from) / duration), count = curve === 0 ? 1 : 48;
    for (let i = 1; i <= count; i++) {
      const x = begin + (1 - begin) * i / count, v = filterCurve(x, curve);
      const value = hz ? a * (b / a) ** v : Math.max(EPS, (a + (b - a) * v) * scale);
      if (hz) param.exponentialRampToValueAtTime(value, origin + from + x * duration);
      else param.linearRampToValueAtTime(value, origin + from + x * duration);
    }
  };
  segment(0, p.filterAttack, p.filterAttackCurve, hz ? levels.base : 0, hz ? levels.peak : 1);
  segment(p.filterAttack, p.filterDecay, p.filterDecayCurve, hz ? levels.peak : 1, hz ? levels.sustain : p.filterSustain);
}
function scheduleFilterRelease(param: AudioParam, p: Patch, at: number, held: number, hz = true) {
  holdParameter(param, at, held, hz);
  if (hz && p.filterReleaseCurve === 0) { param.setTargetAtTime(p.cutoff, at, Math.max(.005, p.filterRelease / 4)); return; }
  if (!hz && p.filterReleaseCurve === 0) { param.linearRampToValueAtTime(0, at + p.filterRelease); return; }
  for (let i = 1; i <= 64; i++) {
    const x = i / 64;
    const value = hz ? filterReleaseFrequencyAt(p, held, p.filterRelease * x) : filterAdsrReleaseAt(p, held, p.filterRelease * x);
    param.linearRampToValueAtTime(value, at + p.filterRelease * x);
  }
  if (hz) param.setTargetAtTime(p.cutoff, at + p.filterRelease, Math.max(.005, p.filterRelease / 4));
}
// Removing a future ramp endpoint also removes the ramp before that endpoint.
// Hold it first so releasing during attack/decay does not rewrite the attack.
function holdParameter(
  param: AudioParam,
  time: number,
  fallback: number,
  exponential = false,
) {
  if (typeof param.cancelAndHoldAtTime === "function")
    param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(time);
    if (exponential)
      param.exponentialRampToValueAtTime(Math.max(EPS, fallback), time);
    else param.linearRampToValueAtTime(fallback, time);
  }
}
function scheduleEnvelope(
  param: AudioParam,
  e: Envelope,
  start: number,
  scale = 1,
) {
  param.setValueAtTime(EPS, start);
  param.linearRampToValueAtTime(Math.max(EPS, scale), start + e.attack);
  param.linearRampToValueAtTime(
    Math.max(EPS, e.sustain * scale),
    start + e.attack + e.decay,
  );
}
function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2048),
    k = amount * 70;
  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = amount < 0.001 ? x : Math.tanh(x * (1 + k)) / Math.tanh(1 + k);
  }
  return curve;
}
function builtInSample(ctx: Context) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
    d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / ctx.sampleRate;
    d[i] =
      (0.5 *
        Math.sin(
          2 * Math.PI * 261.6256 * t + 1.7 * Math.sin(2 * Math.PI * 0.7 * t),
        ) +
        0.2 * Math.sin(2 * Math.PI * 523.251 * t) +
        0.15 * Math.sin(2 * Math.PI * 785 * t)) *
      Math.min(1, t * 20) *
      Math.min(1, (2 - t) * 10);
  }
  return b;
}

export class SynthEngine {
  readonly context: Context;
  readonly analyser: AnalyserNode;
  readonly master: GainNode;
  private limiter: DynamicsCompressorNode;
  private mixInput: GainNode;
  private masterProcessor: MasterProcessor;
  private builtins = new Map<string, AudioBuffer>();
  private reversed = new WeakMap<AudioBuffer, AudioBuffer>();
  readonly buses: Bus[] = [];
  private voices: Voice[] = [];
  private cleanupTimers = new Set<number>();
  private sampleCache = new Map<string, AudioBuffer>();
  private sampleLoads = new Map<string, Promise<AudioBuffer>>();
  private trackPatches: (Patch | undefined)[] = [];
  private filtersReady = false;
  combAvailable = false;
  private disposed = false;
  previewTrack: number | null = null;
  private audible = Array(TRACK_COUNT).fill(true) as boolean[];
  private defaultSample: AudioBuffer;
  private noise: AudioBuffer;
  private wheel = 0;
  get modwheel() {
    return this.wheel;
  }
  set modwheel(value: number) {
    this.wheel = clamp(value, 0, 1);
    for (const bus of this.buses) bus.effectExpression("wheel",this.wheel,this.context.currentTime);
    for(const voice of this.voices)voice.modulator?.expression("wheel",this.wheel);
    for (const voice of this.voices)
      for (const param of voice.modwheelParams)
        param.setTargetAtTime(this.wheel, this.context.currentTime, 0.015);
  }
  bends = Array(TRACK_COUNT).fill(0) as number[];
  private lastNotes = Array(TRACK_COUNT).fill(48) as number[];
  private monoHeld: { note: number; velocity: number; patch: Patch }[][] =
    Array.from({ length: TRACK_COUNT }, () => []);
  tempo = 118;
  private voiceSerial=0;
  pressures=Array(TRACK_COUNT).fill(0) as number[];
  constructor(context: Context, samples?: Map<string, AudioBuffer>) {
    this.context = context;
    if (samples) this.sampleCache = samples;
    this.master = context.createGain();
    this.master.gain.value = 0.7;
    this.mixInput = context.createGain();
    this.masterProcessor = new MasterProcessor(
      context,
      this.mixInput,
      this.master,
    );
    const limiter = context.createDynamicsCompressor();
    this.limiter = limiter;
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.master.connect(limiter);
    limiter.connect(this.analyser);
    this.analyser.connect(context.destination);
    this.defaultSample = builtInSample(context);
    this.noise = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate,
    );
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (let i = 0; i < TRACK_COUNT; i++) this.buses.push(this.createBus());
  }
  private createBus(): Bus {
    const c = this.context,
      input = c.createGain(),
      level = c.createGain(),
      pan = c.createStereoPanner();
    const paraFilter = new VoiceFilter(c),
      paraAmp = c.createGain();
    paraFilter.connect(paraAmp).connect(input);
    paraAmp.gain.value = 0;
    level.connect(pan).connect(this.mixInput);
    return Object.assign(new EffectRack(c, input, level), {
      input,
      paraFilter,
      paraAmp,
      level,
      pan,
      paraStart: 0,
      paraPatch: null as Patch | null,
    });
  }
  update(project: Project) {
    this.tempo = project.tempo;
    this.masterProcessor.update(project.masterFx);
    this.master.gain.setTargetAtTime(
      project.master,
      this.context.currentTime,
      0.015,
    );
    const solo = project.tracks.some((t) => t.solo);
    project.tracks.forEach((t) => this.updateTrack(t, solo));
  }
  restore(project: Project) {
    this.trackPatches = [];
    this.update(project);
  }
  updateTrack(track: Track, solo = false) {
    const p = track.patch,
      b = this.buses[track.id],
      t = this.context.currentTime,
      previous = this.trackPatches[track.id];
    const audible = !track.mute && (this.previewTrack !== null ? track.id === this.previewTrack : (!solo || track.solo));
    if (previous?.level !== p.level || this.audible[track.id] !== audible) {
      b.level.gain.cancelScheduledValues(t);
      b.level.gain.setTargetAtTime(audible ? 1 : 0, t, 0.02);
    }
    this.audible[track.id] = audible;
    if(previous?.pan!==p.pan||previous?.modVersion!==p.modVersion){b.pan.pan.cancelScheduledValues(t);b.pan.pan.setTargetAtTime(p.modVersion===2?0:p.pan,t,.02);}
    b.effectExpression("tempo",this.tempo,t);
    b.updateEffects(p, previous, t);
    if (this.filtersReady && p.voiceMode === "para")
      b.paraFilter.update(p, previous, t);
    if (previous?.resonance !== p.resonance) {
      b.paraFilter.Q.cancelScheduledValues(t);
      b.paraFilter.Q.setTargetAtTime(p.resonance, t, 0.025);
    }
    if (p.voiceMode === "para" && previous?.cutoff !== p.cutoff) {
      b.paraFilter.frequency.cancelScheduledValues(t);
      b.paraFilter.frequency.setTargetAtTime(p.cutoff, t, 0.025);
    }
    for (const voice of this.voices.filter(
      (v) =>
        v.track === track.id &&
        v.time <= t &&
        v.releaseAt > t,
    )) {
      voice.updateFilter(p, previous, t);
      if (voice.patch.voiceMode !== "para" && previous?.cutoff !== p.cutoff) {
        voice.filter.frequency.cancelScheduledValues(t);
        voice.filter.frequency.setTargetAtTime(p.cutoff, t, 0.025);
      }
      if (previous?.resonance !== p.resonance) {
        voice.filter.Q.cancelScheduledValues(t);
        voice.filter.Q.setTargetAtTime(p.resonance, t, 0.025);
      }
    }
    for (const voice of this.voices.filter(
      (v) => v.track === track.id && v.end > t,
    )) {
      if (previous?.level !== p.level) voice.updateLevel(p.level, t);
      if(voice.patch.modVersion===2&&previous?.pan!==p.pan){voice.panner.pan.cancelScheduledValues(t);voice.panner.pan.setTargetAtTime(p.pan,t,.02);}
      if (voice.time <= t && voice.releaseAt > t) voice.updateFm(p, previous, t);
      if(voice.modulator){
        const edits=Object.fromEntries(Object.keys(PARAMS).filter(id=>!PARAMETER_REGISTRY[id as Param].trigger&&(voice.releaseAt>t||PARAMETER_REGISTRY[id as Param].scope!=="voice"||id==="level"||id==="pan")&&getParameter(p,id)!==getParameter(previous??voice.basePatch,id)).map(id=>[id,getParameter(p,id)]));
        const base=setParameters({...voice.patch,lfos:p.lfos,mods:p.mods},edits);voice.modulator.update(base,t);voice.patch=base;
      }
      voice.modulator?.expression("tempo",this.tempo,t);
      voice.patch.lfos = p.lfos;
      for (const control of voice.lfoControls) {
        const l = p.lfos[control.index];
        if (
          control.config.shape !== l.shape ||
          control.config.mode !== l.mode ||
          control.config.retrigger !== l.retrigger
        ) {
          try {
            control.source.stop(t);
          } catch {
            /* Already finished one-shot. */
          }
          control.source.disconnect();
          const oldIndex = voice.sources.indexOf(control.source);
          if (oldIndex >= 0) voice.sources.splice(oldIndex, 1);
          control.source = makeLfoSource(
            this.context,
            l,
            this.tempo,
            t,
            control.index,
          );
          control.source.connect(control.gain);
          voice.sources.push(control.source);
          if (Number.isFinite(voice.end)) control.source.stop(voice.end);
        } else if (control.source instanceof AudioBufferSourceNode) {
          control.source.playbackRate.setTargetAtTime(
            l.sync ? this.tempo / 60 / l.division : l.rate,
            t,
            0.02,
          );
        }
        control.config = { ...l };
        control.gain.gain.setTargetAtTime(control.scale * l.depth, t, 0.02);
      }
    }
    this.trackPatches[track.id] = p;
  }
  scheduleTrack(track: number, patch: Patch, when: number) {
    const b = this.buses[track];
    const values: [AudioParam, number][] = [
      [b.level.gain, this.audible[track] ? 1 : 0],
      [b.pan.pan, patch.modVersion===2?0:patch.pan],
    ];
    for (const [param, value] of values) param.setTargetAtTime(value, when, .003);
    b.scheduleEffects(patch, when);
  }
  private builtin(id: string) {
    const cached = this.builtins.get(id);
    if (cached) return cached;
    const descriptor = SAMPLE_LIBRARY.find((s) => s.id === id);
    if (!descriptor) return this.defaultSample;
    const data = sampleData(descriptor, this.context.sampleRate);
    const buffer = this.context.createBuffer(
      1,
      data.length,
      this.context.sampleRate,
    );
    buffer.copyToChannel(data, 0);
    this.builtins.set(id, buffer);
    if (this.builtins.size > 12)
      this.builtins.delete(this.builtins.keys().next().value!);
    return buffer;
  }
  private reverse(buffer: AudioBuffer) {
    const cached = this.reversed.get(buffer);
    if (cached) return cached;
    const result = this.context.createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel++)
      result.copyToChannel(
        buffer.getChannelData(channel).slice().reverse(),
        channel,
      );
    this.reversed.set(buffer, result);
    return result;
  }
  async loadSample(data: string): Promise<AudioBuffer> {
    const cached = this.sampleCache.get(data);
    if (cached) return cached;
    const pending = this.sampleLoads.get(data);
    if (pending) return pending;
    const load = decodeSample(this.context,data).then((buffer)=>{this.sampleCache.set(data,buffer);return buffer;})
      .finally(() => this.sampleLoads.delete(data));
    this.sampleLoads.set(data, load);
    return load;
  }
  async prepare(project: Project) {
    let workletError: unknown;
    try {
      await prepareFilterWorklet(this.context);
      this.combAvailable = Boolean(this.context.audioWorklet);
    } catch (error) {
      this.combAvailable = false;
      workletError = error;
    }
    if (this.disposed) return;
    if (
      !this.combAvailable &&
      project.tracks.some((t) => t.patch.filterType === "comb")
    )
      throw new Error(
        "Der Combfilter konnte nicht geladen werden. Bitte einen aktuellen Browser über HTTPS oder localhost verwenden oder einen anderen Filter wählen.",
        { cause: workletError },
      );
    if (!this.combAvailable && project.tracks.some((t) => needsAdvancedFilter(t.patch)))
      throw new Error("Diese Filterfunktionen benötigen AudioWorklet. Bitte einen aktuellen Browser über HTTPS oder localhost verwenden.", { cause: workletError });
    if (!this.combAvailable && project.tracks.some((t) => t.patch.engine === "fm" || needsEngineWorklet(t.patch)))
      throw new Error("Diese Synthese benötigt AudioWorklet. Bitte einen aktuellen Browser über HTTPS oder localhost verwenden.", { cause: workletError });
    if (!this.combAvailable && project.tracks.some((t) => requiresModulationWorklet(t.patch)))
      throw new Error("Laufende Spektral- und Drive-Modulation benötigt AudioWorklet. Bitte einen aktuellen Browser über HTTPS oder localhost verwenden.", { cause: workletError });
    if(!this.combAvailable&&project.tracks.some(t=>t.patch.fxVersion===2))throw new Error("Erweiterte Effects benötigen AudioWorklet über HTTPS oder localhost.");
    if(this.combAvailable)project.tracks.forEach(t=>this.buses[t.id].prepareEffects(t.patch,project.tempo));
    if (!this.filtersReady) {
      this.filtersReady = true;
      this.update(project);
    }
    for (const { patch } of project.tracks)
      if (
        !patch.sample &&
        (patch.engine === "sampler" || patch.engine === "granular")
      )
        this.builtin(
          patch.engine === "granular" ? patch.grainSampleId : patch.sampleId,
        );
    await Promise.all(
      project.tracks
        .filter((t) => t.patch.sample)
        .map((t) => this.loadSample(t.patch.sample!)),
    );
  }
  private cleanupVoice(voice: Voice) {
    if (voice.cleanupTimer !== undefined) {
      window.clearTimeout(voice.cleanupTimer);
      this.cleanupTimers.delete(voice.cleanupTimer);
      voice.cleanupTimer = undefined;
    }
    voice.modulator?.dispose();
    voice.filter.dispose();
    for (const source of voice.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    for (const node of voice.nodes) {
      if (typeof AudioWorkletNode !== "undefined" && node instanceof AudioWorkletNode)
        node.port.postMessage("dispose");
      node.disconnect();
    }
    this.voices = this.voices.filter((v) => v !== voice);
  }
  private queueCleanup(voice: Voice) {
    if (!(this.context instanceof AudioContext) || this.disposed) return;
    if (voice.cleanupTimer !== undefined) {
      window.clearTimeout(voice.cleanupTimer);
      this.cleanupTimers.delete(voice.cleanupTimer);
    }
    const timer = window.setTimeout(() => {
      this.cleanupTimers.delete(timer);
      voice.cleanupTimer = undefined;
      // Wall time can advance while the audio context is suspended.
      if (this.context.currentTime < voice.end) this.queueCleanup(voice);
      else this.cleanupVoice(voice);
    }, Math.max(25, (voice.end - this.context.currentTime) * 1000 + 25));
    voice.cleanupTimer = timer;
    this.cleanupTimers.add(timer);
  }
  noteOn(
    track: number,
    note: number,
    velocity: number,
    patch: Patch,
    when = this.context.currentTime,
    duration?: number,
  ): Voice {
    const c = this.context,
      start = Math.max(when, c.currentTime),
      p = triggerPatch(patch, start, note, velocity, this.modwheel, this.tempo, this.combAvailable,{pressure:this.pressures[track],pitchbend:this.bends[track]/200}),
      frequency = midiHz(note + p.tune);
    const filterVelocityScale = 1 - p.filterVelocity * (1 - velocity);
    const envelopePatch = { ...p, filterAmount: p.filterAmount * filterVelocityScale };
    if (!this.combAvailable && needsAdvancedFilter(p)) throw new Error("Diese Filterfunktionen benötigen AudioWorklet über HTTPS oder localhost.");
    if (!this.combAvailable && (p.engine === "fm" || needsEngineWorklet(p))) throw new Error("Diese Synthese benötigt AudioWorklet über HTTPS oder localhost.");
    if (!this.combAvailable && requiresModulationWorklet(p))
      throw new Error("Diese Modulationsziele benötigen AudioWorklet über HTTPS oder localhost.");
    // Background tabs may delay cleanup timers beyond the next note.
    for (const voice of [...this.voices])
      if (voice.end <= c.currentTime) this.cleanupVoice(voice);
    const alive = this.voices.filter(
      (v) => v.time <= start && v.releaseAt > start,
    );
    const held = alive.filter((v) => v.track === track);
    if (p.voiceMode === "mono" && duration === undefined) {
      this.monoHeld[track] = this.monoHeld[track].filter(
        (v) => v.note !== note,
      );
      this.monoHeld[track].push({ note, velocity, patch });
    }
    const legato = p.voiceMode === "mono" && p.legato && held.length > 0;
    const previousVoice = held.at(-1);
    if (legato && duration === undefined && previousVoice?.releaseAt === Infinity && previousVoice.basePatch === patch) {
      previousVoice.retune(note, start);
      this.lastNotes[track] = note;
      return previousVoice;
    }
    const filter = new VoiceFilter(c, p.voiceMode === "para"),
      amp = c.createGain(),
      volume = c.createGain(),
      tremolo = c.createGain(),
      panner = c.createStereoPanner(),
      drive = c.createGain(), preDriveGain = c.createGain(), driveBypass = c.createGain(),
      driveProcessor = this.combAvailable && p.mods.some((m) => m.target === "drive" && m.amount !== 0)
        ? new AudioWorkletNode(c, "phase-voice-drive", { outputChannelCount: [2] })
        : c.createWaveShaper();
    if (p.voiceMode === "mono")
      for (const old of held) {
        old.release(start);
        old.amp.gain.cancelScheduledValues(start);
        old.amp.gain.setTargetAtTime(EPS, start, 0.006);
        for (const source of old.sources)
          try {
            source.stop(start + 0.035);
          } catch {
            /* already stopped */
          }
        old.end = start + 0.035;
        for (const gate of old.gates) {
          gate.cancelScheduledValues(start);
          gate.setValueAtTime(0, old.end);
        }
        old.releaseAt = start;
        old.released = true;
        this.queueCleanup(old);
      }
    if (p.engine === "fm") {
      const candidates = this.voices.filter((v) => v.patch.engine === "fm" && v.time <= start && v.end > start);
      candidates.sort((a, b) => Number(!a.released) - Number(!b.released) || a.time - b.time);
      let layers = candidates.reduce((sum, v) => sum + Math.round(v.patch.unison), 0);
      while (candidates.length >= 32 || layers + Math.round(p.unison) > 128) {
        const victim = candidates.shift(); if (!victim) break;
        layers -= Math.round(victim.patch.unison);
        victim.release(start);
        holdParameter(victim.amp.gain, start, Math.max(EPS, victim.amp.gain.value));
        victim.amp.gain.setTargetAtTime(EPS, start, .002);
        victim.end = start + .015;
        for (const source of victim.sources) try { source.stop(victim.end); } catch { /* Already finished. */ }
        for (const gate of victim.gates) { gate.cancelScheduledValues(start); gate.setValueAtTime(0, victim.end); }
        this.queueCleanup(victim);
      }
    }
    if (alive.length >= 32) {
      const oldest = alive.find((v) => !v.released) || alive[0];
      oldest.release(start);
    }
    filter.schedule(p, start);
    filter.Q.value = p.resonance;
    if (driveProcessor instanceof WaveShaperNode) {
      driveProcessor.curve = distortionCurve(p.drive * 0.2);
      driveProcessor.oversample = "2x";
    } else driveProcessor.parameters.forEach((param, key) => {
      if (key === "amount") param.value = p.drive;
      else if (key === "active") param.setValueAtTime(1, start);
    });
    const bus = this.buses[track],
      isPara = p.voiceMode === "para";
    preDriveGain.gain.value = p.drivePosition >= .5 ? 0 : 1;
    driveBypass.gain.value = p.drivePosition >= .5 ? 1 : 0;
    drive.connect(driveProcessor).connect(preDriveGain).connect(filter.input);
    drive.connect(driveBypass).connect(filter.input);
    filter.setNote(note, start);
    filter.connect(amp);
    volume.gain.value = p.level;
    // Modulation multiplies the envelope: it cannot reopen a silent/released note.
    if(p.modVersion===2)panner.pan.setValueAtTime(p.pan,start);
    amp.connect(tremolo).connect(volume).connect(panner);
    panner.connect(isPara ? bus.paraFilter.input : bus.input);
    const env: Envelope = {
      attack: p.attack,
      decay: p.decay,
      sustain: p.sustain,
      release: p.release,
    };
    if (isPara) amp.gain.setValueAtTime(velocity * 0.24, start);
    else if (legato)
      amp.gain.setValueAtTime(
        Math.max(EPS, velocity * 0.24 * p.sustain),
        start,
      );
    else scheduleEnvelope(amp.gain, env, start, velocity * 0.24);
    scheduleFilterAD(filter.frequency, envelopePatch, start);
    if (isPara) {
      bus.paraFilter.schedule(p, start);
      bus.paraFilter.setNote(note, start);
      bus.paraFilter.Q.setValueAtTime(p.resonance, start);
      if (!held.length) {
        bus.paraStart = start;
        bus.paraPatch = envelopePatch;
        bus.paraAmp.gain.cancelScheduledValues(start);
        scheduleEnvelope(bus.paraAmp.gain, env, start, 1);
        bus.paraFilter.frequency.cancelScheduledValues(start);
        scheduleFilterAD(bus.paraFilter.frequency, envelopePatch, start);
      } else {
        // A newly held key extends the common articulation, including a release
        // previously scheduled by an earlier sequencer voice.
        const shared = bus.paraPatch ?? p,
          origin = bus.paraStart,
          elapsed = start - origin;
        const sharedEnv = {
          attack: shared.attack,
          decay: shared.decay,
          sustain: shared.sustain,
          release: shared.release,
        };
        holdParameter(bus.paraAmp.gain, start, envelopeAt(sharedEnv, elapsed));
        if (start < origin + shared.attack)
          bus.paraAmp.gain.linearRampToValueAtTime(1, origin + shared.attack);
        if (start < origin + shared.attack + shared.decay)
          bus.paraAmp.gain.linearRampToValueAtTime(
            Math.max(EPS, shared.sustain),
            origin + shared.attack + shared.decay,
          );
        holdParameter(bus.paraFilter.frequency, start, filterEnvelopeAt(shared, elapsed), true);
        scheduleFilterAD(bus.paraFilter.frequency, shared, origin, start);
        if (duration === undefined)
          for (const old of held)
            if (Number.isFinite(old.releaseAt)) {
              old.amp.gain.cancelScheduledValues(old.releaseAt);
              old.amp.gain.setValueAtTime(old.velocity * 0.24, old.releaseAt);
              old.amp.gain.linearRampToValueAtTime(EPS, old.releaseAt + 0.025);
            }
      }
    }
    const gates: AudioParam[] = [];
    if (!(driveProcessor instanceof WaveShaperNode))
      driveProcessor.parameters.forEach((param, key) => { if (key === "active") gates.push(param); });
    const sources: Source[] = [],
      nodes: AudioNode[] = [drive, driveProcessor, preDriveGain, driveBypass, amp, tremolo, volume, panner],
      pitch: AudioParam[] = [];
    const pitchOffsets = new Map<AudioParam, number>(),
      modwheelParams: AudioParam[] = [],
      keytrackParams: AudioParam[] = [],
      filterEnvParams: { param: AudioParam; scale: number }[] = [],
      lfoControls: Voice["lfoControls"] = [],
      pitchModNodes: GainNode[] = [];
    const fixedEnds = new Map<Source, number>();
    let modulationRelease = Infinity;
    const bindings: Record<string, { param: AudioParam; weight: number }[]> = {};
    const routeOutputs: Record<string, GainNode[]> = {};
    const weightedOutputs = new Map<GainNode, Map<number, GainNode>>();
    const connectBinding = (output: GainNode, param: AudioParam, weight: number) => {
      if (weight === 1) { output.connect(param); return; }
      const cache = weightedOutputs.get(output) ?? new Map<number, GainNode>();
      weightedOutputs.set(output, cache);
      let scaled = cache.get(weight);
      if (!scaled) {
        scaled = c.createGain();
        scaled.gain.value = weight;
        output.connect(scaled);
        cache.set(weight, scaled);
        nodes.push(scaled);
      }
      scaled.connect(param);
    };
    const bind = (key: string, param: AudioParam, weight = 1) => {
      (bindings[key] ??= []).push({ param, weight });
      for (const output of routeOutputs[key] ?? []) connectBinding(output, param, weight);
    };
    const routed = (key: string) => p.mods.some((m) => m.target === key && m.amount !== 0);
    const numberAt = (key: Param, at: number) => modulatedNumber(
      p, key, at, start, note, velocity, this.modwheel, this.tempo, modulationRelease,{pressure:this.pressures[track],pitchbend:this.bends[track]/200},
    );
    if (!(driveProcessor instanceof WaveShaperNode))
      driveProcessor.parameters.forEach((param, key) => { if (key === "amount") bind("drive", param); });
    let physicalBuffer: AudioBuffer | undefined;
    let physicalRate = 1;
    const grainTimers: number[] = [];
    const grainSchedulers: ((until: number) => void)[] = [];
    const previousNote = this.lastNotes[track];
    let pitchShift = 0;
    const applyPitch = (param: AudioParam, offset = 0) => {
      offset += pitchShift;
      pitch.push(param);
      bind("tune", param, 100);
      pitchOffsets.set(param, offset);
      for (const mod of pitchModNodes) mod.connect(param);
      const target = offset + this.bends[track];
      param.setValueAtTime(target, start);
      if (p.voiceMode === "mono" && held.length > 0 && p.glide > 0.001) {
        param.setValueAtTime(target + (previousNote - note) * 100, start);
        param.linearRampToValueAtTime(target, start + p.glide);
      }
    };
    const addOsc = (
      wave: OscillatorType,
      freq: number,
      gain: number,
      detune = 0,
      target?: string,
    ) => {
      const osc = c.createOscillator(),
        level = c.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      applyPitch(osc.detune, detune);
      level.gain.value = gain;
      osc.connect(level);
      level.connect(drive);
      sources.push(osc);
      nodes.push(level);
      if (target) bind(target, level.gain);
      osc.start(start);
      return osc;
    };
    const layers = Math.round(p.unison);
    let fmSource: FmSource | undefined;
    const engineSources: EngineSource[] = [];
    const enhanced = needsEngineWorklet(p);
    let oneShotDuration: number | undefined;
    if (p.engine === "fm") {
      const fm = new FmSource(c, p);
      fmSource = fm;
      fm.frequency.value = frequency;
      applyPitch(fm.detune);
      // Note tracking / glide belongs to the ratio reference. Fixed-Hz operators
      // still receive transpose, pitch bend and deliberate pitch modulation.
      fm.detune.cancelScheduledValues(start);
      fm.detune.setValueAtTime(this.bends[track], start);
      if (p.voiceMode === "mono" && held.length > 0 && p.glide > .001) {
        fm.frequency.setValueAtTime(midiHz(previousNote + p.tune), start);
        fm.frequency.exponentialRampToValueAtTime(frequency, start + p.glide);
      }
      bind("unisonDetune", fm.param("unisonDetune"));
      bind("unisonWidth", fm.param("unisonWidth"));
      for (const key of FM_KEYS) if (!FM_TARGETS[key].trigger) bind(key, fm.param(key));
      fm.connect(drive); fm.start(start); sources.push(fm);
    }
    for (let layer = 0; layer < (p.engine === "fm" ? 0 : layers); layer++) {
      const position = layers === 1 ? 0 : (layer / (layers - 1)) * 2 - 1;
      const layerDetune =
        position * p.unisonDetune + (Math.random() - 0.5) * p.drift;
      const layerSink = c.createGain(),
        layerPan = c.createStereoPanner();
      layerSink.gain.value = 1 / layers;
      layerPan.pan.value = position * p.unisonWidth;
      layerSink.connect(layerPan).connect(drive);
      nodes.push(layerSink, layerPan);
      bind("unisonWidth", layerPan.pan, position);
      const applyLayerPitch = (param: AudioParam, offset = 0) => {
        applyPitch(param, offset + layerDetune);
        bind("unisonDetune", param, position);
      };
      const makeSpectral = (engine: string, freq = frequency, detune = 0) => {
        const osc = new SpectralSource(c, p, engine, Math.max(8, Math.floor(96 / layers)), position);
        osc.frequency.value = freq;
        applyLayerPitch(osc.detune, detune);
        for (const key of SPECTRAL_KEYS) if (!MOD_TARGETS[key].trigger) bind(key, osc.param(key));
        sources.push(osc);
        osc.start(start);
        return osc;
      };
      const addSpectral = (gain: number, detune = 0, engine: string = p.engine, freq = frequency) => {
        const osc = makeSpectral(engine, freq, detune), level = c.createGain();
        level.gain.value = gain;
        osc.connect(level).connect(layerSink);
        nodes.push(level);
        return { osc, level };
      };
      const addLayerOsc = (
        wave: OscillatorType,
        freq: number,
        gain: number,
        detune = 0,
      ) => {
        const osc = c.createOscillator(),
          level = c.createGain();
        osc.type = wave;
        osc.frequency.value = freq;
        applyLayerPitch(osc.detune, detune);
        level.gain.value = gain;
        if (wave === "square" && Math.abs(p.pulseWidth - 0.5) > 0.001) {
          const real = new Float32Array(65),
            imag = new Float32Array(65);
          for (let n = 1; n < 65; n++) {
            real[n] = Math.sin(n * 2 * Math.PI * p.pulseWidth) / (n * Math.PI);
            imag[n] =
              (1 - Math.cos(n * 2 * Math.PI * p.pulseWidth)) / (n * Math.PI);
          }
          osc.setPeriodicWave(c.createPeriodicWave(real, imag));
        }
        osc.connect(level).connect(layerSink);
        nodes.push(level);
        sources.push(osc);
        osc.start(start);
        return osc;
      };
      const makeEngine = (sample?: AudioBuffer) => {
        const source = new EngineSource(c, p, sample, velocity);
        source.frequency.value = frequency;
        applyLayerPitch(source.detune);
        // Ratio references glide; fixed-Hz modulators retain their independent pitch.
        source.detune.cancelScheduledValues(start);
        source.detune.setValueAtTime(layerDetune + this.bends[track], start);
        if (p.voiceMode === "mono" && held.length > 0 && p.glide > .001) {
          source.frequency.setValueAtTime(midiHz(previousNote + p.tune), start);
          source.frequency.exponentialRampToValueAtTime(frequency, start + p.glide);
        }
        for (const key of source.keys) if (!(key in MOD_TARGETS) || !MOD_TARGETS[key as keyof typeof MOD_TARGETS].trigger) bind(key, source.param(key));
        source.connect(layerSink); source.start(start); sources.push(source); engineSources.push(source);
        return source;
      };
      if (enhanced && ["subtractive", "ring", "physical"].includes(p.engine)) makeEngine();
      if (p.engine === "subtractive" && !enhanced) {
        const add = (wave: Patch["wave"], second: boolean) => {
          const gain = second ? p.mix * .7 : 1 - p.mix * .5;
          const detune = (second ? .5 : -.5) * p.detune + (second ? p.osc2Tune * 100 : 0);
          let osc: OscillatorNode | SpectralSource;
          if (wave === "square" && routed("pulseWidth") && this.combAvailable) {
            const result = addSpectral(gain, detune, "pulse");
            osc = result.osc;
            bind("mix", result.level.gain, second ? .7 : -.5);
          } else {
            osc = addLayerOsc(wave, frequency, gain, detune);
            const level = nodes[nodes.length - 1] as GainNode;
            bind("mix", level.gain, second ? .7 : -.5);
          }
          bind("detune", osc.detune, second ? .5 : -.5);
          if (second) bind("osc2Tune", osc.detune, 100);
        };
        add(p.wave, false);
        add(p.wave2, true);
      }
      if (p.engine === "wavetable") {
        if (this.combAvailable && (enhanced || SPECTRAL_KEYS.some(routed))) {
          const first = addSpectral(.8, -p.detune / 2);
          bind("detune", first.osc.detune, -.5);
          if (p.detune > .05 || routed("detune")) {
            const second = addSpectral(.5, p.detune / 2);
            bind("detune", second.osc.detune, .5);
          }
        } else {
        const { real, imag } = wavetableSpectrum(
          p.wavetable,
          p.shape,
          p.wtWarp,
          p.wtFormant,
          p.brightness,
        );
        const wave = c.createPeriodicWave(real, imag);
        const first = addLayerOsc("sine", frequency, .8, -p.detune / 2);
        first.setPeriodicWave(wave);
        bind("detune", first.detune, -.5);
        if (p.detune > 0.05 || routed("detune")) {
          const second = addLayerOsc("sine", frequency, .5, p.detune / 2);
          second.setPeriodicWave(wave);
          bind("detune", second.detune, .5);
        }
        }
      }
      if (p.engine === "additive") {
        if (this.combAvailable && (enhanced || SPECTRAL_KEYS.some(routed))) addSpectral(.85);
        else {
        const real = new Float32Array(65),
          imag = new Float32Array(65);
        for (let n = 1; n <= Math.round(p.harmonics); n++) {
          const peak = Math.exp(-(((n - p.spectralPeak) / 2) ** 2));
          imag[n] =
            Math.pow(n, -(2.5 - p.brightness * 2 - p.spectralTilt)) *
            (1 - p.shape * 0.8 + (n % 2 ? p.shape * 0.8 : 0)) *
            (1 + peak * p.spectralResonance * 5);
        }
        if (p.inharmonicity < 0.0001)
          addLayerOsc("sine", frequency, 0.85).setPeriodicWave(
            c.createPeriodicWave(real, imag),
          );
        else {
          let energy = 0;
          for (const amplitude of imag) energy += Math.abs(amplitude);
          const count = Math.min(
            Math.round(p.harmonics),
            Math.max(8, Math.floor(96 / layers)),
          );
          for (let n = 1; n <= count; n++)
            addLayerOsc(
              "sine",
              frequency * n * Math.sqrt(1 + p.inharmonicity * n * n),
              imag[n] / Math.max(1, energy),
            );
        }
        }
      }
      if (p.engine === "ring" && !enhanced) {
        const carrier = c.createOscillator(),
          mod = c.createOscillator();
        const ringGain = c.createGain(), depth = c.createGain(),
          wet = c.createGain(), dry = c.createGain();
        carrier.type = p.wave;
        carrier.frequency.value = frequency;
        applyLayerPitch(carrier.detune);
        mod.type = p.wave2;
        mod.frequency.value = Math.max(
          0.01,
          frequency * p.fmRatio + (p.engine === "ring" ? p.ringOffset : 0),
        );
        bind("fmRatio", mod.frequency, frequency);
        bind("ringOffset", mod.frequency);
        applyLayerPitch(mod.detune);
        ringGain.gain.value = (1 - p.shape) * .5 + (p.ringBiasMode >= .5 ? p.ringBias : 0);
        depth.gain.value = .5 + p.shape * .5;
        wet.gain.value = p.ringDepth;
        dry.gain.value = 1 - p.ringDepth + p.ringDry + (p.ringBiasMode < .5 ? p.ringBias : 0);
        bind("shape", ringGain.gain, -.5);
        bind("shape", depth.gain, .5);
        bind("ringDepth", wet.gain);
        bind("ringDepth", dry.gain, -1);
        bind("ringDry", dry.gain);
        bind("ringBias", p.ringBiasMode < .5 ? dry.gain : ringGain.gain);
        carrier.connect(dry).connect(layerSink);
        mod.connect(depth);
        depth.connect(ringGain.gain);
        carrier.connect(ringGain);
        ringGain.connect(wet).connect(layerSink);
        sources.push(carrier, mod);
        nodes.push(ringGain, depth, wet, dry);
        carrier.start(start);
        mod.start(start);
      }
      if (p.engine === "physical" && !enhanced) {
        if (!physicalBuffer) {
          const count = Math.ceil(
              c.sampleRate * Math.min(12, p.stringDecay * 1.5),
            ),
            buffer = c.createBuffer(1, count, c.sampleRate),
            d = buffer.getChannelData(0),
            period = Math.max(2, Math.round(c.sampleRate / frequency + .5 - p.dispersion * .2)),
            line = new Float32Array(period);
          for (let i = 0; i < period; i++)
            line[i] =
              (p.excitation === "bow"
                ? Math.sin((i / period) * Math.PI * 2) * 0.6 +
                  (Math.random() * 2 - 1) * 0.4
                : Math.random() * 2 - 1) *
              (0.3 + p.brightness * 0.7);
          {
            const original = line.slice(),
              offset = Math.max(1, Math.floor(period * p.pluckPosition));
            for (let i = 0; i < period; i++)
              line[i] -=
                original[(i + offset) % period] *
                (p.excitation === "pick" ? 0.9 : 0.4);
          }
          for (let i = 0; i < count; i++) {
            const index = i % period,
              next = (index + 1) % period;
            const val =
              (line[index] * (0.5 + p.dispersion * 0.2) +
                line[next] * (0.5 - p.dispersion * 0.2)) *
              p.damping *
              Math.exp(-4 / (frequency * p.stringDecay));
            d[i] = line[index];
            line[index] = val;
          }
          const neighbor = .5 - p.dispersion * .2;
          let lo = 0, hi = Math.min(Math.PI * 2, Math.PI * 2 / (period - 1));
          for (let iteration = 0; iteration < 32; iteration++) {
            const w = (lo + hi) / 2;
            const phase = Math.atan2(neighbor * Math.sin(w), 1 - neighbor + neighbor * Math.cos(w));
            if (period * w - phase < Math.PI * 2) lo = w; else hi = w;
          }
          physicalRate = frequency / (((lo + hi) / 2) * c.sampleRate / (Math.PI * 2));
          physicalBuffer = buffer;
        }
        const source = c.createBufferSource();
        source.buffer = physicalBuffer;
        source.playbackRate.value = physicalRate;
        applyLayerPitch(source.detune);
        const body = c.createBiquadFilter();
        body.type = "peaking";
        body.frequency.value = 180 + p.bodySize * 650;
        body.Q.value = 0.7 + p.bodySize * 3;
        body.gain.value = p.bodySize * 12;
        bind("bodySize", body.frequency, 650);
        bind("bodySize", body.Q, 3);
        bind("bodySize", body.gain, 12);
        source.connect(body).connect(layerSink);
        if (routed("brightness")) {
          const tone = c.createBiquadFilter();
          tone.type = "lowpass";
          tone.frequency.value = 500 + p.brightness * 17500;
          body.disconnect(layerSink);
          body.connect(tone).connect(layerSink);
          bind("brightness", tone.frequency, 17500);
          nodes.push(tone);
        }
        nodes.push(body);
        sources.push(source);
        source.start(start);
      }
      if (p.engine === "sampler" || p.engine === "granular") {
        const sample =
            (p.sample && this.sampleCache.get(p.sample)) ||
            this.builtin(
              p.engine === "granular" ? p.grainSampleId : p.sampleId,
            ),
          rate = 2 ** ((note + p.tune - p.sampleRoot) / 12);
        const sampleStart =
            Math.min(p.sampleStart, p.sampleEnd - 0.01) * sample.duration,
          sampleEnd =
            Math.max(p.sampleEnd, p.sampleStart + 0.01) * sample.duration;
        if (p.engine === "sampler" && enhanced) {
          makeEngine(p.sampleReverse >= .5 ? this.reverse(sample) : sample);
          if (p.samplePlayback === 1) {
            const region = sampleRegion(p, sample.duration, velocity);
            oneShotDuration = Math.max(oneShotDuration ?? 0, (region.end-region.start) * (p.sampleStretchMode >= .5 ? p.sampleStretch : 1 / (rate * 2 ** ((p.sampleFine+layerDetune+this.bends[track])/1200))));
          }
        } else if (p.engine === "sampler") {
          const source = c.createBufferSource();
          source.buffer =
            p.sampleReverse >= 0.5 ? this.reverse(sample) : sample;
          source.playbackRate.value = rate * 2 ** (p.sampleFine / 1200);
          applyLayerPitch(source.detune);
          bind("sampleRoot", source.detune, -100);
          bind("sampleFine", source.detune);
          source.loop = p.sampleLoop;
          source.loopStart =
            sampleStart +
            Math.min(p.sampleLoopStart, p.sampleLoopEnd - 0.01) *
              (sampleEnd - sampleStart);
          source.loopEnd =
            sampleStart +
            Math.max(p.sampleLoopEnd, p.sampleLoopStart + 0.01) *
              (sampleEnd - sampleStart);
          const fade = c.createGain();
          const clipDuration =
            (sampleEnd - sampleStart) /
            (source.playbackRate.value *
              2 ** ((layerDetune + this.bends[track]) / 1200));
          const edge = p.sampleLoop
            ? p.sampleFade
            : Math.min(p.sampleFade, clipDuration * 0.45);
          fade.gain.setValueAtTime(edge > 0 ? 0 : 1, start);
          if (edge > 0) fade.gain.linearRampToValueAtTime(1, start + edge);
          if (!p.sampleLoop && edge > 0) {
            const end = start + clipDuration;
            fade.gain.setValueAtTime(1, end - edge);
            fade.gain.linearRampToValueAtTime(0, end);
          }
          source.connect(fade).connect(layerSink);
          nodes.push(fade);
          sources.push(source);
          source.start(
            start,
            sampleStart,
            p.sampleLoop ? undefined : sampleEnd - sampleStart,
          );
        } else {
          // Live clouds are replenished with a short lookahead, without accumulating ended grains.
          let cursor = start, scanOffset = 0, scanAt = start;
          type GrainPlan = { offset: number; length: number; rate: number; reverse: boolean; pan: number; shape: number; attack: number; release: number; window: number; amplitude: number; end: number };
          let recent: GrainPlan[] = [], frozen: GrainPlan[] = [], freezeIndex = 0, wasFrozen = false;
          const motionPhase = Math.random() * Math.PI * 2;
          const scheduleGrains = (until: number) => {
            if (c instanceof AudioContext && cursor < c.currentTime - 0.1)
              cursor = c.currentTime;
            while (cursor < until) {
              const at = cursor,
                source = c.createBufferSource(),
                window = c.createGain();
              const sync = numberAt("grainSync", at) >= .5;
              const density = sync ? Math.min(128, this.tempo / 60 / GRAIN_BEATS[Math.round(numberAt("grainSyncDivision", at))]) : numberAt("grainDensity", at);
              const freeze = numberAt("grainFreeze", at) >= .5;
              if (freeze && !wasFrozen) { frozen = recent.filter((g) => g.end > at); if (!frozen.length) frozen = recent.slice(-1); freezeIndex = 0; }
              if (!freeze) frozen = [];
              wasFrozen = freeze;
              if (!freeze) scanOffset += (at - scanAt) * numberAt("grainScan", at) * .15;
              scanAt = at;
              cursor += 1 / density;
              const scatter = (Math.random() - .5) * numberAt("grainPitch", at);
              const quantized = quantizeGrain(note + p.tune + scatter, numberAt("grainQuantize", at), numberAt("grainScaleRoot", at));
              const pitchRate = 2 ** ((quantized - p.sampleRoot - pitchShift / 100) / 12);
              const actualRate = pitchRate * 2 ** ((layerDetune + this.bends[track]) / 1200);
              const proposedLength = Math.min(numberAt("grainSize", at), sample.duration / actualRate);
              const proposedOffset = clamp(((((numberAt("position", at) + scanOffset) % 1) + 1) % 1) * sample.duration + (Math.random() - .5) * numberAt("spread", at) * sample.duration, 0, Math.max(0, sample.duration - proposedLength * actualRate));
              const plan: GrainPlan = frozen.length ? { ...frozen[freezeIndex++ % frozen.length], end: at + frozen[(freezeIndex-1)%frozen.length].length } : {
                offset: proposedOffset, length: proposedLength, rate: pitchRate, reverse: Math.random() < numberAt("grainReverse", at),
                pan: clamp((Math.random() * 2 - 1) * numberAt("grainPan", at) + Math.sin((at-start)*Math.PI*2*numberAt("grainMotionRate",at)+motionPhase)*numberAt("grainStereoMotion",at) + Math.sin((at-start)*.37+motionPhase*1.7)*numberAt("grainDrift",at), -1, 1),
                shape: Math.round(numberAt("grainWindowShape",at)), attack: numberAt("grainAttack",at), release: numberAt("grainRelease",at), window: numberAt("grainWindow",at),
                amplitude: .75 / Math.sqrt(Math.max(1, density * proposedLength)), end: at + proposedLength,
              };
              if (!freeze || !frozen.length) { recent = recent.filter((g) => g.end > at); recent.push(plan); if (freeze) frozen = [plan]; }
              const { length, offset } = plan;
              source.buffer = plan.reverse ? this.reverse(sample) : sample;
              source.playbackRate.value = plan.rate;
              applyLayerPitch(source.detune);
              bind("sampleRoot", source.detune, -100);
              if (plan.shape === 0 && plan.attack === 0 && plan.release === 0) {
                window.gain.setValueAtTime(0, at);
                window.gain.linearRampToValueAtTime(plan.amplitude, at + length * plan.window);
                window.gain.linearRampToValueAtTime(0, at + length);
              } else window.gain.setValueCurveAtTime(grainEnvelope(plan.shape, length, plan.attack, plan.release, plan.window, plan.amplitude), at, Math.max(1/c.sampleRate,length));
              source.connect(window);
              const grainPan = c.createStereoPanner();
              grainPan.pan.value = plan.pan;
              window.connect(grainPan).connect(layerSink);
              nodes.push(grainPan);
              sources.push(source);
              nodes.push(window);
              source.start(at, offset);
              source.stop(at + length);
              fixedEnds.set(source, at + length);
              source.onended = () => {
                source.disconnect();
                fixedEnds.delete(source);
                window.disconnect();
                grainPan.disconnect();
                const gi = nodes.indexOf(grainPan);
                if (gi >= 0) nodes.splice(gi, 1);
                const si = sources.indexOf(source);
                if (si >= 0) sources.splice(si, 1);
                const ni = nodes.indexOf(window);
                if (ni >= 0) nodes.splice(ni, 1);
                const pi = pitch.indexOf(source.detune);
                if (pi >= 0) pitch.splice(pi, 1);
                pitchOffsets.delete(source.detune);
                for (const key of Object.keys(bindings))
                  bindings[key] = bindings[key].filter((b) => b.param !== source.detune);
                for (const mod of [...pitchModNodes, ...Object.values(routeOutputs).flat(), ...[...weightedOutputs.values()].flatMap((cache) => [...cache.values()])])
                  try {
                    mod.disconnect(source.detune);
                  } catch {
                    /* The voice may already have been disconnected. */
                  }
              };
            }
          };
          grainSchedulers.push(scheduleGrains);
          if (duration === undefined && c instanceof AudioContext) {
            scheduleGrains(start + 0.15);
            grainTimers.push(
              window.setInterval(
                () => scheduleGrains?.(c.currentTime + 0.15),
                25,
              ),
            );
          } else scheduleGrains(start + (duration ?? 8) + p.release);
        }
      }
    }
    if (
      (p.sub > 0.001 || routed("sub")) &&
      p.engine !== "granular" &&
      p.engine !== "sampler" &&
      p.engine !== "physical"
    )
      addOsc((["sine", "triangle", "sawtooth", "square"] as const)[Math.round(p.subWave)], frequency * 2 ** p.subOctave, p.sub, 0, "sub");
    if (p.noise > 0.001 || routed("noise")) {
      const source = c.createBufferSource(),
        gain = c.createGain();
      source.buffer = this.noise;
      source.loop = true;
      gain.gain.value = p.noise * NOISE_GAIN;
      bind("noise", gain.gain, NOISE_GAIN);
      source.connect(gain);
      if (p.noiseColor !== 0 || routed("noiseColor")) {
        const color = c.createBiquadFilter(); color.type = "lowshelf"; color.frequency.value = 1000; color.gain.value = -p.noiseColor * 24;
        bind("noiseColor", color.gain, -24); gain.connect(color).connect(drive); nodes.push(color);
      } else gain.connect(drive);
      sources.push(source);
      nodes.push(gain);
      source.start(start);
    }
    // Modulation is connected at audio rate, including each LFO's own depth and tempo sync.
    this.lastNotes[track] = note;
    const activeFilter = isPara ? bus.paraFilter : filter;
    bind("resonance", activeFilter.Q);
    bind("drive", activeFilter.parameter("drive")!);
    for (const key of FILTER_KEYS) {
      if (FILTER_TARGETS[key].trigger) continue;
      const param = activeFilter.parameter(key); if (param) bind(key, param);
    }
    bind("combFeedback", activeFilter.combFeedback);
    bind("combDamping", activeFilter.combDamping);
    bind("combMix", activeFilter.combMix);
    bind("level", volume.gain);
    if (routed("filterAmount")) {
      const source = c.createConstantSource(), amount = c.createGain();
      amount.gain.value = 0;
      scheduleFilterAD(source.offset, p, start, start, false, 1200 * filterVelocityScale);
      source.connect(amount).connect(activeFilter.detune);
      source.start(start);
      sources.push(source);
      nodes.push(amount);
      filterEnvParams.push({ param: source.offset, scale: 1200 * filterVelocityScale });
      bind("filterAmount", amount.gain);
    }
    const targets: Record<string, { params: AudioParam[]; scale: number }> = {
      ...Object.fromEntries(Object.entries(bindings).map(([key, values]) => [
        key, { params: values.map((value) => value.param), scale: modulationScale(key as ModTarget) },
      ])),
      cutoff: {
        params: [isPara ? bus.paraFilter.frequency : filter.frequency],
        scale: Math.min(6000, p.cutoff * 2),
      },
      pitch: { params: pitch, scale: 1200 },
      amplitude: { params: [tremolo.gain], scale: 0.66 },
      pan: { params: [panner.pan], scale: 1 },
    };
    const controls = new Map<string, { input: AudioParam; bias: AudioParam; output: GainNode; clamp: WaveShaperNode }>();
    const boundedControl = (key: Param) => {
      const existing = controls.get(key);
      if (existing) return existing;
      const [min, max] = PARAMS[key], half = (max - min) / 2;
      const signal = c.createConstantSource(), bias = c.createConstantSource(),
        clamp = c.createWaveShaper(), range = c.createGain(), output = c.createGain();
      signal.offset.value = (getParameter(p,key) - min) / half - 1;
      bias.offset.value = min + half - getParameter(p,key);
      // WaveShaper holds its endpoints outside [-1, 1], clipping the sum of
      // all routes once, before it is mapped back to the parameter's range.
      clamp.curve = p.legacyPeakModulation && key === "filterPeakGain"
        ? Float32Array.from({ length: 193 }, (_, i) => Math.max(0, Math.min(5 / 6, i / 96 - 1)))
        : new Float32Array([-1, 1]);
      range.gain.value = half;
      signal.connect(clamp).connect(range).connect(output);
      bias.connect(output);
      signal.start(start); bias.start(start);
      sources.push(signal, bias);
      nodes.push(clamp, range, output);
      const control = { input: signal.offset, bias: bias.offset, output, clamp };
      controls.set(key, control);
      for (const binding of bindings[key]) connectBinding(output, binding.param, binding.weight);
      routeOutputs[key] = [output];
      return control;
    };
    let modulator: Modulator | undefined;
    if (p.modVersion === 2 && p.mods.length && this.combAvailable) {
      const ids = [...new Set(p.mods.filter(r=>targets[r.target]?.params.length && !MOD_TARGETS[r.target].trigger).map(r=>r.target))];
      modulator = new Modulator(c,p,ids,start,note,velocity,false,note+1);
      modulator.expression("tempo",this.tempo,start);modulator.expression("wheel",this.modwheel,start);modulator.expression("pressure",this.pressures[track],start);modulator.expression("bend",this.bends[track]/200,start);
      for (const id of ids) {
        const output=c.createGain();modulator.connect(id,output);nodes.push(output);
        if(bindings[id])for(const binding of bindings[id])connectBinding(output,binding.param,binding.weight);
        else for(const param of targets[id].params)output.connect(param);
        routeOutputs[id]=[output];if(id==="pitch")pitchModNodes.push(output);
      }
    } else {
    for (const mod of p.mods) {
      const target = targets[mod.target];
      if (!target?.params.length || Math.abs(mod.amount) < 0.0001) continue;
      const control = bindings[mod.target] && Object.hasOwn(PARAMS, mod.target)
        ? boundedControl(mod.target as Param) : undefined;
      const gain = c.createGain();
      const scale = mod.amount * (control ? 1 : target.scale);
      gain.gain.value = scale;
      nodes.push(gain);
      if (
        mod.source === "lfo1" ||
        mod.source === "lfo2" ||
        mod.source === "lfo3"
      ) {
        const index = Number(mod.source.slice(-1)) - 1;
        const l = p.lfos[index],
          source = makeLfoSource(c, l, this.tempo, start, index);
        gain.gain.value *= l.depth;
        source.connect(gain);
        lfoControls.push({
          index,
          source,
          gain,
          scale,
          config: { ...l },
        });
        sources.push(source);
      } else {
        const source = c.createConstantSource();
        source.offset.value =
          mod.source === "velocity"
            ? velocity
            : mod.source === "keytrack"
              ? (note - 60) / 36
              : mod.source === "modwheel"
                ? this.modwheel
                : 0;
        if (mod.source === "modwheel") modwheelParams.push(source.offset);
        if (mod.source === "keytrack") keytrackParams.push(source.offset);
        if (mod.source === "filterEnv") {
          filterEnvParams.push({ param: source.offset, scale: 1 });
          scheduleFilterAD(source.offset, p, start, start, false);
        }
        source.connect(gain);
        sources.push(source);
        source.start(start);
      }
      if (control) gain.connect(control.input);
      else if (bindings[mod.target]) {
        for (const binding of bindings[mod.target]) connectBinding(gain, binding.param, binding.weight);
        (routeOutputs[mod.target] ??= []).push(gain);
      } else for (const param of target.params) gain.connect(param);
      if (mod.target === "pitch") pitchModNodes.push(gain);
    }
    }
    const effectId=++this.voiceSerial;
    this.buses[track].effectNote(effectId,note,velocity,p,start);
    const voice: Voice = { effectId, modulator,
      track,
      note,
      velocity,
      time: start,
      amp,
      volume,
      updateLevel: (value, time) => {
        volume.gain.cancelScheduledValues(time);
        volume.gain.setTargetAtTime(value, time, .015);
        const control = controls.get("level");
        if (control) {
          control.input.cancelScheduledValues(time);
          control.bias.cancelScheduledValues(time);
          control.input.setTargetAtTime(value * 2 - 1, time, .015);
          control.bias.setTargetAtTime(.5 - value, time, .015);
        }
      },
      updateFilter: (next, previous, time) => {
        const peakControl = controls.get("filterPeakGain");
        if (peakControl && previous?.legacyPeakModulation !== next.legacyPeakModulation)
          peakControl.clamp.curve = next.legacyPeakModulation
            ? Float32Array.from({ length: 193 }, (_, i) => Math.max(0, Math.min(5 / 6, i / 96 - 1))) : new Float32Array([-1, 1]);
        filter.update(next, previous, time);
        if (previous?.drivePosition !== next.drivePosition) {
          preDriveGain.gain.cancelScheduledValues(time); driveBypass.gain.cancelScheduledValues(time);
          preDriveGain.gain.setTargetAtTime(next.drivePosition >= .5 ? 0 : 1, time, .004);
          driveBypass.gain.setTargetAtTime(next.drivePosition >= .5 ? 1 : 0, time, .004);
        }
        if (previous?.drive !== next.drive) {
          if (driveProcessor instanceof WaveShaperNode) driveProcessor.curve = distortionCurve(next.drive * .2);
          else driveProcessor.parameters.forEach((param, key) => { if (key === "amount") param.setTargetAtTime(next.drive, time, .015); });
        }
        for (const key of [...FILTER_KEYS, "drive"] as Param[]) {
          if (previous?.[key] === next[key]) continue;
          const control = controls.get(key);
          if (!control) continue;
          const [min, max] = PARAMS[key], half = (max - min) / 2;
          control.input.cancelScheduledValues(time); control.bias.cancelScheduledValues(time);
          control.input.setTargetAtTime((getParameter(next,key) - min) / half - 1, time, .015);
          control.bias.setTargetAtTime(min + half - getParameter(next,key), time, .015);
        }
      },
      updateFm: (next, previous, time) => {
        if (next.engine !== p.engine) return;
        const changed = new Set<Param>();
        for (const source of sources) {
          if (!(source instanceof EngineSource || source instanceof SpectralSource)) continue;
          const keys = source instanceof EngineSource ? source.keys : SPECTRAL_KEYS;
          for (const key of keys) {
            if (previous?.[key] === next[key] || (key in MOD_TARGETS && MOD_TARGETS[key as keyof typeof MOD_TARGETS].trigger)) continue;
            const param = source.param(key); param.cancelScheduledValues(time); param.setTargetAtTime(getParameter(next,key), time, .015); changed.add(key);
          }
        }
        if (p.engine === "granular") for (const key of [...ENGINE_KEYS.filter((key) => engineOwner(key) === "granular"), "grainSize", "grainDensity", "grainScan", "grainReverse", "grainPitch", "position", "spread", "grainWindow", "grainPan", "tune", "sampleRoot"] as Param[]) {
          if (previous?.[key] !== next[key]) { p[key] = getParameter(next,key); changed.add(key); }
        }
        if (engineSources.length && previous?.tune !== next.tune) {
          for (const source of engineSources) { source.frequency.setTargetAtTime(midiHz(note+next.tune),time,.015); source.param("transpose").setTargetAtTime(next.tune,time,.015); }
          p.tune=next.tune; changed.add("tune");
        }
        for (const key of changed) {
          const control=controls.get(key); if(!control) continue;
          const [min,max]=PARAMS[key],half=(max-min)/2;
          control.input.cancelScheduledValues(time);control.bias.cancelScheduledValues(time);
          control.input.setTargetAtTime((getParameter(next,key)-min)/half-1,time,.015);control.bias.setTargetAtTime(min+half-getParameter(next,key),time,.015);
        }
        if (!fmSource || next.engine !== "fm") return;
        if (previous?.tune !== next.tune) {
          fmSource.frequency.cancelScheduledValues(time);
          fmSource.frequency.setTargetAtTime(midiHz(note + next.tune), time, .015);
          fmSource.param("transpose").setTargetAtTime(next.tune, time, .015);
          p.tune = next.tune;
          const control = controls.get("tune");
          if (control) {
            control.input.setTargetAtTime(next.tune / 24, time, .015);
            control.bias.setTargetAtTime(-next.tune, time, .015);
          }
        }
        for (const key of [...FM_KEYS.filter((key) => !FM_TARGETS[key].trigger), "unisonDetune", "unisonWidth"] as Param[]) {
          if (previous?.[key] === next[key]) continue;
          const param = fmSource.param(key), value = getParameter(next,key);
          param.cancelScheduledValues(time); param.setTargetAtTime(value, time, .015);
          const control = controls.get(key);
          if (control) {
            const [min, max] = PARAMS[key], half = (max-min)/2;
            control.input.cancelScheduledValues(time); control.bias.cancelScheduledValues(time);
            control.input.setTargetAtTime((value-min)/half-1, time, .015);
            control.bias.setTargetAtTime(min+half-value, time, .015);
          }
        }
      },
      filter,
      panner,
      sources,
      nodes,
      gates,
      patch: p,
      basePatch: patch,
      retune: (next, at) => {
        const delta = (next - note) * 100;
        pitchShift += delta;
        note = next;
        voice.note = next;modulator?.retune(next,at);this.buses[track].effectRetune(effectId,next,at);
        activeFilter.setNote(next, at);
        if (fmSource) {
          holdParameter(fmSource.frequency, at, fmSource.frequency.value, true);
          fmSource.frequency.exponentialRampToValueAtTime(midiHz(next + p.tune), at + Math.max(.003, p.glide));
        }
        for (const source of engineSources) {
          holdParameter(source.frequency, at, source.frequency.value, true);
          source.frequency.exponentialRampToValueAtTime(midiHz(next+p.tune),at+Math.max(.003,p.glide));
        }
        for (const param of pitch) {
          if (param === fmSource?.detune || engineSources.some((source) => source.detune === param)) continue;
          const offset = (pitchOffsets.get(param) ?? 0) + delta;
          pitchOffsets.set(param, offset);
          holdParameter(param, at, param.value);
          param.linearRampToValueAtTime(offset + this.bends[track], at + Math.max(.003, p.glide));
        }
        for (const param of keytrackParams) param.setTargetAtTime((next - 60) / 36, at, .01);
      },
      released: false,
      releaseAt: Infinity,
      end: Infinity,
      pitch,
      pitchOffsets,
      modwheelParams,
      lfoControls,
      release: () => {},
    };
    voice.release = (at: number) => {
      if (voice.released && at >= voice.releaseAt) return;
      voice.released = true;
      const releaseAt = Math.max(at, start),
        value =
          (isPara
            ? 1
            : legato
              ? p.sustain
              : envelopeAt(env, releaseAt - start)) *
          velocity *
          0.24;
      voice.releaseAt = releaseAt;
      modulationRelease = releaseAt;
      modulator?.release(releaseAt);this.buses[track].effectRelease(effectId,releaseAt);
      for (const source of sources) if (source instanceof FmSource || source instanceof EngineSource) source.release(releaseAt);
      for (const timer of grainTimers) window.clearInterval(timer);
      grainTimers.length = 0;
      for (const schedule of grainSchedulers) schedule(releaseAt + p.release);
      const others = this.voices.filter(
        (v) =>
          v !== voice &&
          v.track === track &&
          v.time <= releaseAt &&
          v.releaseAt > releaseAt,
      );
      const releaseLength = isPara && others.length ? 0.025 : p.release;
      holdParameter(amp.gain, releaseAt, Math.max(EPS, value));
      // The final paraphonic voice is released by the shared bus envelope.
      // Releasing both gains would square the envelope and shorten its decay.
      if (!isPara || others.length) amp.gain.exponentialRampToValueAtTime(EPS, releaseAt + releaseLength);
      if (isPara) {
        const priority = others.at(-1);
        if (priority) bus.paraFilter.setNote(priority.note, releaseAt);
        const latest = Math.max(releaseAt, ...others.map((v) => v.releaseAt));
        for (const sibling of this.voices.filter(
          (v) =>
            v.track === track &&
            v.patch.voiceMode === "para" &&
            v.time <= releaseAt &&
            v.releaseAt >= start &&
            Number.isFinite(v.releaseAt),
        )) {
          sibling.amp.gain.cancelScheduledValues(sibling.releaseAt);
          sibling.amp.gain.setValueAtTime(
            sibling.velocity * 0.24,
            sibling.releaseAt,
          );
          if (sibling.releaseAt < latest)
            sibling.amp.gain.linearRampToValueAtTime(
              EPS,
              sibling.releaseAt + 0.025,
            );
        }
        if (Number.isFinite(latest)) {
          const shared = bus.paraPatch ?? p;
          holdParameter(
            bus.paraAmp.gain,
            latest,
            Math.max(
              EPS,
              envelopeAt(
                {
                  attack: shared.attack,
                  decay: shared.decay,
                  sustain: shared.sustain,
                  release: shared.release,
                },
                latest - bus.paraStart,
              ),
            ),
          );
          bus.paraAmp.gain.exponentialRampToValueAtTime(
            EPS,
            latest + shared.release,
          );
          scheduleFilterRelease(bus.paraFilter.frequency, shared, latest, filterEnvelopeAt(shared, latest - bus.paraStart));
        }
      }
      scheduleFilterRelease(filter.frequency, envelopePatch, releaseAt, filterEnvelopeAt(envelopePatch, releaseAt - start));
      for (const { param, scale } of filterEnvParams)
        scheduleFilterRelease(param, p, releaseAt, Math.max(EPS, filterAdsrAt(p, releaseAt - start)) * scale, false);
      const end = releaseAt + releaseLength + 0.05;
      voice.end = end;
      for (const gate of gates) {
        gate.cancelScheduledValues(end);
        gate.setValueAtTime(0, end);
      }
      for (const source of sources) {
        try {
          source.stop(Math.min(end, fixedEnds.get(source) ?? end));
        } catch {
          /* A short grain may already have ended. */
        }
      }
      const cleanup = sources[0];
      if (cleanup)
        cleanup.addEventListener(
          "ended",
          () => {
            // The first granular source is shorter than the entire voice; disconnect only at voice end.
            if (c.currentTime >= voice.end) this.cleanupVoice(voice);
          },
          { once: true },
        );
      this.queueCleanup(voice);
    };
    this.voices.push(voice);
    const releaseAfter = oneShotDuration ?? duration;
    if (releaseAfter !== undefined) voice.release(start + Math.max(1 / c.sampleRate, releaseAfter));
    return voice;
  }
  noteOff(track: number, note: number, when = this.context.currentTime) {
    const wasLast = this.monoHeld[track].at(-1)?.note === note;
    this.monoHeld[track] = this.monoHeld[track].filter((v) => v.note !== note);
    const fallback = this.monoHeld[track].at(-1);
    if (wasLast && fallback)
      this.noteOn(
        track,
        fallback.note,
        fallback.velocity,
        fallback.patch,
        when,
      );
    for (const v of this.voices)
      if (v.track === track && v.note === note && !v.released) v.release(when);
  }
  pitchBend(track: number, value: number) {
    this.bends[track] = clamp(value, -1, 1) * 200;
    this.buses[track].effectExpression("bend",value,this.context.currentTime);
    for(const voice of this.voices)if(voice.track===track)voice.modulator?.expression("bend",value);
    for (const voice of this.voices)
      if (voice.track === track)
        for (const param of voice.pitch) {
          param.cancelScheduledValues(this.context.currentTime);
          param.setTargetAtTime(
            this.bends[track] + (voice.pitchOffsets.get(param) ?? 0),
            this.context.currentTime,
            0.015,
          );
        }
  }
  pressure(track:number,value:number,note?:number){
    const pressure=clamp(value,0,1),at=this.context.currentTime;
    if(note===undefined)this.pressures[track]=pressure;
    this.buses[track].effectPressure(pressure,at,note);
    if(note===undefined)this.buses[track].effectExpression("pressure",pressure,at);
    for(const voice of this.voices)if(voice.track===track&&(note===undefined||voice.note===note))voice.modulator?.pressure(pressure,at,note);
  }
  modulationReading(track:number){const voice=this.voices.filter(v=>v.track===track&&v.time<=this.context.currentTime&&v.end>this.context.currentTime).at(-1);return {voice:voice?.modulator?.reading,fx:this.buses[track].effectReading};}
  panic(track?: number) {
    const now = this.context.currentTime;
    this.monoHeld = this.monoHeld.map((notes, i) =>
      track === undefined || i === track ? [] : notes,
    );
    for (const v of [...this.voices])
      if (track === undefined || v.track === track) {
        v.release(now);
        v.amp.gain.cancelScheduledValues(now);
        v.amp.gain.setTargetAtTime(EPS, now, 0.005);
        for (const s of v.sources)
          try {
            s.stop(now + 0.025);
          } catch {
            /* Already stopped. */
          }
        v.end = now + 0.025;
        for (const gate of v.gates) {
          gate.cancelScheduledValues(now);
          gate.setValueAtTime(0, v.end);
        }
        this.queueCleanup(v);
      }
    this.buses.forEach((bus, index) => {
      if (track !== undefined && index !== track) return;
      bus.paraAmp.gain.cancelScheduledValues(now);
      bus.paraAmp.gain.setTargetAtTime(0, now, 0.005);
      bus.effectPanic(now);
      bus.paraFilter.reset();
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.panic();
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.clear();
    for (const voice of [...this.voices]) this.cleanupVoice(voice);
    this.voices = [];
    for (const b of this.buses) {
      b.disposeEffects();
      b.paraFilter.dispose();
      b.paraAmp.disconnect();
      b.input.disconnect();
      b.level.disconnect();
      b.pan.disconnect();
    }
    this.masterProcessor.dispose();
    this.mixInput.disconnect();
    this.master.disconnect();
    this.limiter.disconnect();
    this.analyser.disconnect();
  }
}

export type StepEvent = {
  track: number;
  step: number;
  cycle: number;
  time: number;
};
type ScheduledNote = {
  track: number; note: number; velocity: number; patch: Patch;
  at: number; gate: number;
};
type PendingEvent = { at: number; track: number; patch: Patch; configure?: boolean; note?: ScheduledNote; head?: StepEvent };
export class Transport {
  private timer: number | undefined;
  private tick = 0;
  private next = 0;
  private clockNext = 0;
  private epoch = 0;
  private pending: PendingEvent[] = [];
  private uiQueue: StepEvent[] = [];
  private positions = new Map<number, { step: number; absolute: number; time: number; duration: number; advance: number; reverse: boolean }[]>();
  fill = false;
  external = false;
  private clockPulses = 0;
  private cursors = Array.from({ length: TRACK_COUNT }, () => ({ next: 0, position: 0 }));
  private chances: ChanceState[] = Array.from({ length: TRACK_COUNT }, () => new Map());
  private patternIndex = -1;
  onStep: (event: StepEvent) => void = () => {};
  onClock: (status: number, time: number) => void = () => {};
  onNote: (track: number, note: number, velocity: number, time: number, duration: number) => void = () => {};
  constructor(readonly engine: SynthEngine, readonly getProject: () => Project) {}
  get running() { return this.timer !== undefined || this.external; }
  position(track: number) {
    const frames = this.positions.get(track), now = this.engine.context.currentTime;
    const p = frames ? [...frames].reverse().find((frame) => frame.time <= now) : undefined;
    if (!p || !this.running) return null;
    const progress = clamp((now - p.time) / p.duration, 0, p.advance);
    return { step: Math.max(0, p.reverse ? p.step + 1 - progress : p.step + progress), absolute: p.absolute + progress };
  }
  start(external = false) {
    if (this.running) return;
    this.tick = 0;
    this.resetCursors(0);
    this.patternIndex = this.getProject().activePattern;
    this.next = this.engine.context.currentTime + 0.07;
    this.clockNext = this.next;
    this.epoch = this.next;
    this.external = external;
    this.clockPulses = 0;
    if (!external) this.onClock(0xfa, this.next);
    this.timer = window.setInterval(() => {
      if (!this.external) this.schedule();
      else this.flush();
    }, 20);
    if (!external) this.schedule();
  }
  private resetCursors(tick: number) {
    this.cursors = Array.from({ length: TRACK_COUNT }, () => ({ next: tick, position: 0 }));
    this.chances = Array.from({ length: TRACK_COUNT }, () => new Map());
    this.pending = [];
    this.positions.clear();
    this.uiQueue = [];
  }
  private schedule() {
    const c = this.engine.context, project = this.getProject();
    if (this.patternIndex !== project.activePattern) {
      this.patternIndex = project.activePattern;
      this.engine.panic();
      this.resetCursors(this.tick);
      this.next = Math.max(c.currentTime + 0.04, this.clockNext);
      this.epoch = this.next;
    }
    // Skip elapsed clock time after a suspended/background tab; never burst old notes.
    if (this.next < c.currentTime - 0.15) {
      const skipped = Math.ceil((c.currentTime - this.next) / (60 / project.tempo / 8));
      this.tick += skipped;
      this.next = c.currentTime + 0.04;
      this.clockNext = this.next;
      this.epoch = this.next;
      this.resetCursors(this.tick);
    }
    const early = Math.max(0, ...project.tracks.map((track) => {
      const pat = track.patterns[project.activePattern];
      const units = track.mode === "piano"
        ? Math.max(0, ...pat.notes.map((n) => -n.micro))
        : Math.max(0, ...pat.steps.slice(0, pat.length).map((s) => -s.micro * s.span));
      return units * 240 / project.tempo / pat.division;
    }));
    while (this.next < c.currentTime + 0.12 + early) {
      this.scheduleTick(this.tick++, this.next);
      this.next += 60 / project.tempo / 8;
    }
    while (this.clockNext < c.currentTime + 0.12) {
      if (this.clockNext >= c.currentTime - 0.03) this.onClock(0xf8, this.clockNext);
      this.clockNext += 60 / project.tempo / 24;
    }
    this.flush();
  }
  clock() {
    if (!this.external) return;
    if (this.clockPulses++ % 3 === 0) {
      this.scheduleTick(this.tick++, this.engine.context.currentTime + 0.025);
      this.flush();
    }
  }
  private scheduleTick(tick: number, time: number) {
    const project = this.getProject(), quantum = 60 / project.tempo / 8;
    if (this.patternIndex !== project.activePattern) {
      this.patternIndex = project.activePattern;
      this.resetCursors(tick);
    }
    for (const track of project.tracks) {
      const pattern = track.patterns[project.activePattern], cursor = this.cursors[track.id];
      while (cursor.next < tick + 1 - 0.00001) {
        const position = cursor.position;
        const frame = sequenceFrame(track, pattern, position, project.swing, this.fill, this.chances[track.id]);
        const duration = quantum * 32 / pattern.division;
        const baseTime = time + (cursor.next - tick) * quantum;
        cursor.position += frame.advance;
        cursor.next += 32 / pattern.division * frame.advance;
        // The playhead follows the grid; microtiming belongs to notes, not the clock.
        this.pending.push({ at: baseTime, track: track.id, patch: track.patch, configure: frame.trigger,
          head: { track: track.id, step: frame.index, cycle: frame.cycle, time: baseTime } });
        const frames = this.positions.get(track.id) ?? [];
        frames.push({ step: track.mode === "piano" && pattern.direction !== "random" ? stepIndex(position, pattern.length, pattern.direction) : frame.index,
          absolute: position, time: baseTime, duration, advance: frame.advance,
          reverse: pattern.length > 1 && (pattern.direction === "reverse" || (pattern.direction === "pingpong" && position % Math.max(1, pattern.length * 2 - 2) >= pattern.length - 1)) });
        while (frames.length > 1 && frames[1].time <= this.engine.context.currentTime) frames.shift();
        this.positions.set(track.id, frames);
        for (const n of frame.notes) {
          const at = Math.max(this.epoch, baseTime + n.offset * duration);
          const patch = lockedPatch(track.patch, n.locks);
          this.pending.push({ at, track: track.id, patch,
            note: { track: track.id, note: n.note, velocity: n.velocity, patch, at, gate: n.duration * duration } });
        }
      }
    }
  }
  private flush() {
    const now = this.engine.context.currentTime;
    this.pending.sort((a, b) => a.at - b.at || Number(!!a.note) - Number(!!b.note));
    while (this.pending.length && this.pending[0].at < now + 0.12) {
      const event = this.pending.shift()!;
      if (event.at < now - 0.1) continue;
      const project = this.getProject(), track = project.tracks[event.track];
      const at = Math.max(now, event.at);
      if (event.head) {
        this.uiQueue.push(event.head);
        if (event.configure) this.engine.scheduleTrack(track.id, track.patch, at);
      }
      if (!event.note || track.mute || (project.tracks.some((t) => t.solo) && !track.solo)) continue;
      const n = event.note;
      this.engine.scheduleTrack(track.id, n.patch, at);
      this.engine.noteOn(track.id, n.note, n.velocity, n.patch, at, n.gate);
      this.onNote(track.id, n.note, n.velocity, at, n.gate);
    }
    this.uiQueue.sort((a, b) => a.time - b.time);
    while (this.uiQueue.length && this.uiQueue[0].time <= now) this.onStep(this.uiQueue.shift()!);
  }
  stop() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.external = false;
    this.tick = 0;
    this.resetCursors(0);
    this.onClock(0xfc, this.engine.context.currentTime);
    this.engine.panic();
  }
}
export function lockedPatch(patch: Patch, locks: Partial<Numbers>): Patch {
  let p = { ...patch };
  const migrated = migrateFmLocks(locks, patch);
  for (const key of Object.keys(migrated) as Param[])
    if (LOCK_PARAMS.includes(key) && !Object.hasOwn(DYNAMIC_META,key))
      p[key] = clamp(migrated[key]!, PARAMS[key][0], PARAMS[key][1]);
  const dynamic=Object.fromEntries(Object.entries(migrated).filter(([id])=>Object.hasOwn(DYNAMIC_META,id)));
  p=setParameters(p,dynamic);
  if(Object.keys(migrated).some(id=>id.startsWith("fx.")||FX_PARAMETERS.has(id as Param)&&!["chorus","delay","delayTime","feedback","reverb"].includes(id)))p.fxVersion=2;
  if (patch.engineVersion === 1 && locks.pulseWidth !== undefined && locks.pulseWidth2 === undefined) p.pulseWidth2 = p.pulseWidth;
  return Object.assign(p, sampleSliceSelection(p.sampleSlices, p.sampleSlice));
}
function delayTail(time: number, feedback: number) {
  // Include repeats until their amplitude falls below -60 dB.
  const repeats =
    feedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(feedback)) : 1;
  return time * Math.max(1, repeats);
}
/** Conservative bounds include switched algorithms, sync divisions and modulated feedback. */
function effectTail(patch: Patch,tempo:number) {
  const canonical=(id:string)=>DYNAMIC_META[id as keyof typeof DYNAMIC_META]?.canonical??id;
  const routed=(id:string)=>patch.mods.some(r=>r.amount!==0&&canonical(r.target)===canonical(id));
  const upper=(id:string)=>routed(id)?PARAMETER_REGISTRY[id as Param].max:getParameter(patch,id);
  const enabled=(slot:"delayMode"|"reverbMode")=>patch.fxEnabled[slot]||routed(`fx.${slot}.bypass`);
  const modes=(slot:"delayMode"|"reverbMode")=>routed(`fx.${slot}.mode`)?FX_SLOT_MODES[slot]:[patch[slot]];
  let delay=0,reverb=0;
  if(enabled("delayMode"))for(const mode of modes("delayMode")){
    const id=(key:string)=>`fx.delayMode.${mode}.${key}`;
    if(upper(id("mix"))<=0)continue;
    const seconds=upper(id("sync"))>=.5?60/tempo*upper(id("division")):upper(id("time"));
    const right=mode==="pingpong"?(upper(id("sync"))>=.5?60/tempo*upper(id("rightDivision")):upper(id("rightTime"))):mode==="digital"?Math.abs(upper(id("stereoOffset"))):0;
    const time=Math.min(16,Math.max(seconds+(mode==="digital"?right:0),right)+.006);
    delay=Math.max(delay,delayTail(time,Math.min(.92,upper(id("feedback"))))+(mode==="multitap"?Math.min(16,time*upper(id("spacing"))*2):0));
  }
  if(enabled("reverbMode"))for(const mode of modes("reverbMode")){
    const id=(key:string)=>`fx.reverbMode.${mode}.${key}`;
    if(upper(id("mix"))<=0)continue;
    const decay=upper(id("decay")),pre=Object.hasOwn(PARAMETER_REGISTRY,id("predelay"))?upper(id("predelay")):0;
    reverb=Math.max(reverb,decay+pre+.2+(mode==="gated"?upper(id("hold"))+upper(id("gate"))*decay*.5+upper(id("release"))*7:0));
  }
  // The modulation delay itself also retains a short signal tail.
  return delay+reverb+(patch.fxEnabled.modulationMode?.12:0);
}
export async function renderProject(
  project: Project,
  bars = 4,
  fill = false,
): Promise<AudioBuffer> {
  const samples = new Map<string,AudioBuffer>();
  const imported = [...new Set(project.tracks.map((t)=>t.patch.sample).filter((data): data is string => Boolean(data)))];
  if(imported.length){
    const decoder=new OfflineAudioContext(1,1,44100);
    await Promise.all(imported.map(async(data)=>samples.set(data,await decodeSample(decoder,data))));
  }
  const quarter = 60 / project.tempo,
    seconds = bars * 4 * quarter,
    ticks = bars * 32;
  const events: PendingEvent[] = [];
  let end = seconds;
  for (const track of project.tracks) {
    if (track.mute || (project.tracks.some((t) => t.solo) && !track.solo)) continue;
    const pat = track.patterns[project.activePattern], chance: ChanceState = new Map();
    let tick = 0, position = 0;
    while (tick < ticks) {
      const frame = sequenceFrame(track, pat, position, project.swing, fill, chance);
      const unit = quarter * 4 / pat.division, baseTime = tick * quarter / 8;
      if (frame.trigger) events.push({ at: baseTime, track: track.id, patch: track.patch });
      position += frame.advance;
      tick += 32 / pat.division * frame.advance;
      for (const n of frame.notes) {
        const patch = lockedPatch(track.patch, n.locks), at = Math.max(0, baseTime + n.offset * unit), gate = n.duration * unit;
        events.push({ at, track: track.id, patch,
          note: { track: track.id, note: n.note, velocity: n.velocity, patch, at, gate } });
        const articulation = triggerPatch(patch, at, n.note, n.velocity, 0, project.tempo, true);
        let audibleGate = gate;
        if(articulation.engine === "sampler" && articulation.samplePlayback === 1){
          const sampleSeconds=articulation.sample ? samples.get(articulation.sample)?.duration ?? 1 : SAMPLE_LIBRARY.find((s)=>s.id===articulation.sampleId)?.duration ?? 1;
          const region=sampleRegion(articulation,sampleSeconds,n.velocity);
          // Reserve the slowest unison layer, including analog drift.
          const slowest=articulation.unison>1?-articulation.unisonDetune:0;
          audibleGate=(region.end-region.start)*(articulation.sampleStretchMode>=.5?articulation.sampleStretch:1/(2**((n.note+articulation.tune-articulation.sampleRoot)/12)*2**((articulation.sampleFine+slowest-articulation.drift*.5)/1200)));
        }
        end = Math.max(end, at + Math.max(0.01, audibleGate) +
          (patch.mods.some((m) => m.target === "release" && m.amount !== 0) ? PARAMS.release[1] : patch.release) + effectTail(patch,project.tempo));
      }
    }
  }
  const master = project.masterFx;
  if (master.enabled) {
    if (master.delayEnabled && master.delay > 0)
      end += delayTail(master.delayTime, master.feedback);
    if (master.reverbEnabled && master.reverb > 0)
      end += master.reverbSize + 0.02;
  }
  const ctx = new OfflineAudioContext(2, Math.ceil((end + 0.1) * 44100), 44100),
    engine = new SynthEngine(ctx, samples);
  try {
    engine.update(project);
    await engine.prepare(project);
    // Voice limits and shared paraphonic articulation depend on note order.
    // A full track or a long ratchet must not be scheduled ahead of earlier notes.
    events.sort((a, b) => a.at - b.at || Number(!!a.note) - Number(!!b.note));
    for (const event of events) {
      engine.scheduleTrack(event.track, event.patch, event.at);
      const n = event.note;
      if (n) engine.noteOn(n.track, n.note, n.velocity, n.patch, n.at, n.gate);
    }
    return await ctx.startRendering();
  } finally {
    engine.dispose();
  }
}
