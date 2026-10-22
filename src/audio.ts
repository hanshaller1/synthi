import {
  CHORDS,
  LOCK_PARAMS,
  clamp,
  midiHz,
  shouldTrigger,
  stepIndex,
} from "./model";
import { PARAMS } from "./model";
import type { Envelope, Numbers, Param, Patch, Project, Track } from "./model";

type Context = AudioContext | OfflineAudioContext;
type Source = OscillatorNode | AudioBufferSourceNode | ConstantSourceNode;
type Voice = {
  track: number;
  note: number;
  velocity: number;
  time: number;
  amp: GainNode;
  filter: BiquadFilterNode;
  panner: StereoPannerNode;
  sources: Source[];
  nodes: AudioNode[];
  patch: Patch;
  released: boolean;
  releaseAt: number;
  end: number;
  pitch: AudioParam[];
  pitchOffsets: Map<AudioParam, number>;
  modwheelParams: AudioParam[];
  lfoControls: {
    index: number;
    oscillator: OscillatorNode;
    gain: GainNode;
    scale: number;
    shape: OscillatorType;
  }[];
  release: (time: number) => void;
};
type Bus = {
  input: GainNode;
  paraFilter: BiquadFilterNode;
  paraAmp: GainNode;
  level: GainNode;
  pan: StereoPannerNode;
  distortion: WaveShaperNode;
  dry: GainNode;
  chorus: GainNode;
  chorusDelay: DelayNode;
  chorusLfo: OscillatorNode;
  delay: DelayNode;
  delayWet: GainNode;
  feedback: GainNode;
  reverb: ConvolverNode;
  reverbWet: GainNode;
  room: number;
  paraStart: number;
  paraPatch: Patch | null;
};
const EPS = 0.00001;

function envelopeAt(e: Envelope, elapsed: number) {
  if (elapsed < e.attack) return Math.max(EPS, elapsed / e.attack);
  if (elapsed < e.attack + e.decay)
    return 1 + ((e.sustain - 1) * (elapsed - e.attack)) / e.decay;
  return Math.max(EPS, e.sustain);
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
function impulse(ctx: Context, duration: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * duration),
    b = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let seed = 7361 + c;
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 1073741823.5 - 1) * Math.pow(1 - i / length, 2.8);
    }
  }
  return b;
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
  readonly buses: Bus[] = [];
  private voices: Voice[] = [];
  private sampleCache = new Map<string, AudioBuffer>();
  private sampleLoads = new Map<string, Promise<AudioBuffer>>();
  private trackPatches: (Patch | undefined)[] = [];
  private audible = [true, true, true, true];
  private defaultSample: AudioBuffer;
  private noise: AudioBuffer;
  private wheel = 0;
  get modwheel() {
    return this.wheel;
  }
  set modwheel(value: number) {
    this.wheel = clamp(value, 0, 1);
    for (const voice of this.voices)
      for (const param of voice.modwheelParams)
        param.setTargetAtTime(this.wheel, this.context.currentTime, 0.015);
  }
  bends = [0, 0, 0, 0];
  private lastNotes = [48, 48, 48, 48];
  private monoHeld: { note: number; velocity: number; patch: Patch }[][] = [
    [],
    [],
    [],
    [],
  ];
  tempo = 118;
  constructor(context: Context) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.7;
    const limiter = context.createDynamicsCompressor();
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
    for (let i = 0; i < 4; i++) this.buses.push(this.createBus());
  }
  private createBus(): Bus {
    const c = this.context,
      input = c.createGain(),
      level = c.createGain(),
      pan = c.createStereoPanner(),
      distortion = c.createWaveShaper(),
      dry = c.createGain(),
      chorus = c.createGain(),
      chorusDelay = c.createDelay(0.1),
      chorusLfo = c.createOscillator(),
      chorusDepth = c.createGain(),
      delay = c.createDelay(2),
      delayWet = c.createGain(),
      feedback = c.createGain(),
      reverb = c.createConvolver(),
      reverbWet = c.createGain();
    distortion.curve = distortionCurve(0.05);
    distortion.oversample = "2x";
    const paraFilter = c.createBiquadFilter(),
      paraAmp = c.createGain();
    paraFilter.connect(paraAmp);
    paraAmp.connect(input);
    paraAmp.gain.value = 0;
    input.connect(distortion);
    distortion.connect(dry);
    dry.connect(level);
    distortion.connect(chorusDelay);
    chorusDelay.delayTime.value = 0.018;
    chorusLfo.frequency.value = 0.65;
    chorusDepth.gain.value = 0.006;
    chorusLfo.connect(chorusDepth);
    chorusDepth.connect(chorusDelay.delayTime);
    chorusLfo.start();
    chorusDelay.connect(chorus);
    chorus.connect(level);
    distortion.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(level);
    distortion.connect(reverb);
    reverb.buffer = impulse(c, 2.6);
    reverb.connect(reverbWet);
    reverbWet.connect(level);
    level.connect(pan);
    pan.connect(this.master);
    return {
      input,
      paraFilter,
      paraAmp,
      level,
      pan,
      distortion,
      dry,
      chorus,
      chorusDelay,
      chorusLfo,
      delay,
      delayWet,
      feedback,
      reverb,
      reverbWet,
      room: 2.6,
      paraStart: 0,
      paraPatch: null,
    };
  }
  update(project: Project) {
    this.tempo = project.tempo;
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
    const audible = !track.mute && (!solo || track.solo);
    if (previous?.level !== p.level || this.audible[track.id] !== audible) {
      b.level.gain.cancelScheduledValues(t);
      b.level.gain.setTargetAtTime(audible ? p.level : 0, t, 0.02);
    }
    this.audible[track.id] = audible;
    const smooth = (key: Param, param: AudioParam, scale = 1) => {
      if (previous?.[key] !== p[key]) {
        param.cancelScheduledValues(t);
        param.setTargetAtTime(p[key] * scale, t, 0.02);
      }
    };
    smooth("pan", b.pan.pan);
    smooth("chorus", b.chorus.gain, 0.6);
    smooth("delayTime", b.delay.delayTime);
    smooth("delay", b.delayWet.gain, 0.7);
    smooth("feedback", b.feedback.gain);
    smooth("reverb", b.reverbWet.gain, 0.7);
    if (previous?.distortion !== p.distortion)
      b.distortion.curve = distortionCurve(p.distortion);
    if (Math.abs(b.room - p.reverbSize) > 0.05) {
      b.room = p.reverbSize;
      b.reverb.buffer = impulse(this.context, p.reverbSize);
    }
    if (previous?.resonance !== p.resonance)
      b.paraFilter.Q.setTargetAtTime(p.resonance, t, 0.025);
    if (p.voiceMode === "para" && previous?.cutoff !== p.cutoff)
      b.paraFilter.frequency.setTargetAtTime(p.cutoff, t, 0.025);
    for (const voice of this.voices.filter(
      (v) =>
        v.track === track.id &&
        v.time <= t &&
        v.releaseAt > t &&
        v.patch.voiceMode !== "para",
    )) {
      if (previous?.cutoff !== p.cutoff) {
        voice.filter.frequency.cancelScheduledValues(t);
        voice.filter.frequency.setTargetAtTime(p.cutoff, t, 0.025);
      }
      if (previous?.resonance !== p.resonance)
        voice.filter.Q.setTargetAtTime(p.resonance, t, 0.025);
    }
    for (const voice of this.voices.filter(
      (v) => v.track === track.id && v.end > t,
    ))
      for (const control of voice.lfoControls) {
        const l = p.lfos[control.index];
        if (control.shape !== l.shape) {
          control.oscillator.type = l.shape;
          control.shape = l.shape;
        }
        control.oscillator.frequency.setTargetAtTime(
          l.sync ? this.tempo / 60 / l.division : l.rate,
          t,
          0.02,
        );
        control.gain.gain.setTargetAtTime(control.scale * l.depth, t, 0.02);
      }
    this.trackPatches[track.id] = p;
  }
  scheduleTrack(track: number, patch: Patch, when: number) {
    const b = this.buses[track];
    const values: [AudioParam, number][] = [
      [b.level.gain, this.audible[track] ? patch.level : 0],
      [b.pan.pan, patch.pan],
      [b.chorus.gain, patch.chorus * 0.6],
      [b.delay.delayTime, patch.delayTime],
      [b.delayWet.gain, patch.delay * 0.7],
      [b.feedback.gain, patch.feedback],
      [b.reverbWet.gain, patch.reverb * 0.7],
    ];
    for (const [param, value] of values) param.setValueAtTime(value, when);
  }
  async loadSample(data: string): Promise<AudioBuffer> {
    const cached = this.sampleCache.get(data);
    if (cached) return cached;
    const pending = this.sampleLoads.get(data);
    if (pending) return pending;
    const comma = data.indexOf(","),
      raw = atob(data.slice(comma + 1)),
      bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const load = this.context
      .decodeAudioData(bytes.buffer)
      .then((buffer) => {
        if (buffer.duration > 60)
          throw new Error("Samples dürfen maximal 60 Sekunden lang sein.");
        this.sampleCache.set(data, buffer);
        return buffer;
      })
      .finally(() => this.sampleLoads.delete(data));
    this.sampleLoads.set(data, load);
    return load;
  }
  async prepare(project: Project) {
    await Promise.all(
      project.tracks
        .filter((t) => t.patch.sample)
        .map((t) => this.loadSample(t.patch.sample!)),
    );
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
      p = patch,
      frequency = midiHz(note + p.tune),
      filter = c.createBiquadFilter(),
      amp = c.createGain(),
      panner = c.createStereoPanner(),
      drive = c.createWaveShaper();
    this.voices = this.voices.filter((v) => v.end > c.currentTime);
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
        old.end = start + 0.04;
        old.releaseAt = start;
        old.released = true;
      }
    if (alive.length >= 32) {
      const oldest = alive.find((v) => !v.released) || alive[0];
      oldest.release(start);
    }
    filter.type = p.filterType;
    filter.Q.value = p.resonance;
    drive.curve = distortionCurve(p.drive * 0.2);
    drive.oversample = "2x";
    const bus = this.buses[track],
      isPara = p.voiceMode === "para";
    drive.connect(filter);
    filter.connect(amp);
    amp.connect(panner);
    panner.connect(isPara ? bus.paraFilter : bus.input);
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
    const base = p.cutoff,
      peak = clamp(base * 2 ** p.filterAmount, 20, 20000),
      sustain = clamp(
        base * 2 ** (p.filterAmount * p.filterSustain),
        20,
        20000,
      );
    filter.frequency.setValueAtTime(base, start);
    filter.frequency.exponentialRampToValueAtTime(peak, start + p.filterAttack);
    filter.frequency.exponentialRampToValueAtTime(
      sustain,
      start + p.filterAttack + p.filterDecay,
    );
    if (isPara) {
      filter.type = "allpass";
      bus.paraFilter.type = p.filterType;
      bus.paraFilter.Q.setValueAtTime(p.resonance, start);
      if (!held.length) {
        bus.paraStart = start;
        bus.paraPatch = p;
        bus.paraAmp.gain.cancelScheduledValues(start);
        scheduleEnvelope(bus.paraAmp.gain, env, start, 1);
        bus.paraFilter.frequency.cancelScheduledValues(start);
        bus.paraFilter.frequency.setValueAtTime(base, start);
        bus.paraFilter.frequency.exponentialRampToValueAtTime(
          peak,
          start + p.filterAttack,
        );
        bus.paraFilter.frequency.exponentialRampToValueAtTime(
          sustain,
          start + p.filterAttack + p.filterDecay,
        );
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
        bus.paraAmp.gain.cancelScheduledValues(start);
        bus.paraAmp.gain.setValueAtTime(envelopeAt(sharedEnv, elapsed), start);
        if (start < origin + shared.attack)
          bus.paraAmp.gain.linearRampToValueAtTime(1, origin + shared.attack);
        if (start < origin + shared.attack + shared.decay)
          bus.paraAmp.gain.linearRampToValueAtTime(
            Math.max(EPS, shared.sustain),
            origin + shared.attack + shared.decay,
          );
        const sharedPeak = clamp(
            shared.cutoff * 2 ** shared.filterAmount,
            20,
            20000,
          ),
          sharedSustain = clamp(
            shared.cutoff * 2 ** (shared.filterAmount * shared.filterSustain),
            20,
            20000,
          );
        const freq =
          elapsed < shared.filterAttack
            ? shared.cutoff *
              (sharedPeak / shared.cutoff) ** (elapsed / shared.filterAttack)
            : elapsed < shared.filterAttack + shared.filterDecay
              ? sharedPeak *
                (sharedSustain / sharedPeak) **
                  ((elapsed - shared.filterAttack) / shared.filterDecay)
              : sharedSustain;
        bus.paraFilter.frequency.cancelScheduledValues(start);
        bus.paraFilter.frequency.setValueAtTime(freq, start);
        if (start < origin + shared.filterAttack)
          bus.paraFilter.frequency.exponentialRampToValueAtTime(
            sharedPeak,
            origin + shared.filterAttack,
          );
        if (start < origin + shared.filterAttack + shared.filterDecay)
          bus.paraFilter.frequency.exponentialRampToValueAtTime(
            sharedSustain,
            origin + shared.filterAttack + shared.filterDecay,
          );
        if (duration === undefined)
          for (const old of held)
            if (Number.isFinite(old.releaseAt)) {
              old.amp.gain.cancelScheduledValues(old.releaseAt);
              old.amp.gain.setValueAtTime(old.velocity * 0.24, old.releaseAt);
              old.amp.gain.linearRampToValueAtTime(EPS, old.releaseAt + 0.025);
            }
      }
    }
    const sources: Source[] = [],
      nodes: AudioNode[] = [drive, filter, amp, panner],
      pitch: AudioParam[] = [];
    const pitchOffsets = new Map<AudioParam, number>(),
      modwheelParams: AudioParam[] = [],
      lfoControls: Voice["lfoControls"] = [],
      pitchModNodes: GainNode[] = [];
    let grainTimer: number | undefined;
    let scheduleGrains: ((until: number) => void) | undefined;
    const previousNote = this.lastNotes[track];
    const applyPitch = (param: AudioParam, offset = 0) => {
      pitch.push(param);
      pitchOffsets.set(param, offset);
      for (const mod of pitchModNodes) mod.connect(param);
      const target = offset + this.bends[track];
      param.setValueAtTime(target, start);
      if (p.voiceMode === "mono" && p.glide > 0.001) {
        param.setValueAtTime(target + (previousNote - note) * 100, start);
        param.linearRampToValueAtTime(target, start + p.glide);
      }
    };
    let ringGain: GainNode | undefined, fmGain: GainNode | undefined;
    const addOsc = (
      wave: OscillatorType,
      freq: number,
      gain: number,
      detune = 0,
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
      osc.start(start);
      return osc;
    };
    if (p.engine === "subtractive") {
      addOsc(p.wave, frequency, 1 - p.mix * 0.5, -p.detune / 2);
      addOsc(p.wave2, frequency, p.mix * 0.7, p.detune / 2);
    }
    if (p.engine === "wavetable") {
      const osc = addOsc("sine", frequency, 0.7, -p.detune / 2),
        real = new Float32Array(65),
        imag = new Float32Array(65);
      // Four spectral anchors: sine → triangle → saw → square.
      const x = p.shape * 3,
        a = Math.floor(x),
        m = x - a;
      const coefficient = (type: number, n: number) =>
        type === 0
          ? n === 1
            ? 1
            : 0
          : type === 1
            ? n % 2
              ? Math.sin((n * Math.PI) / 2) / (n * n)
              : 0
            : type === 2
              ? (n % 2 ? 1 : -1) / n
              : n % 2
                ? 1 / n
                : 0;
      for (let n = 1; n < 65; n++)
        imag[n] =
          (1 - m) * coefficient(a, n) + m * coefficient(Math.min(3, a + 1), n);
      const wave = c.createPeriodicWave(real, imag);
      osc.setPeriodicWave(wave);
      if (p.detune > 0.05)
        addOsc("sine", frequency, 0.5, p.detune / 2).setPeriodicWave(wave);
    }
    if (p.engine === "fm") {
      const carrier = addOsc(p.wave, frequency, 0.85),
        mod = c.createOscillator();
      fmGain = c.createGain();
      mod.type = p.wave2;
      mod.frequency.value = frequency * p.fmRatio;
      applyPitch(mod.detune);
      fmGain.gain.value = frequency * p.fmIndex;
      mod.connect(fmGain);
      fmGain.connect(carrier.frequency);
      sources.push(mod);
      nodes.push(fmGain);
      mod.start(start);
    }
    if (p.engine === "additive") {
      const osc = addOsc("sine", frequency, 0.85),
        real = new Float32Array(65),
        imag = new Float32Array(65);
      for (let n = 1; n <= Math.round(p.harmonics); n++)
        imag[n] =
          Math.pow(n, -(2.5 - p.brightness * 2)) *
          (1 - p.shape * 0.8 + (n % 2 ? p.shape * 0.8 : 0));
      osc.setPeriodicWave(c.createPeriodicWave(real, imag));
    }
    if (p.engine === "ring") {
      const carrier = c.createOscillator(),
        mod = c.createOscillator();
      ringGain = c.createGain();
      const depth = c.createGain();
      carrier.type = p.wave;
      carrier.frequency.value = frequency;
      applyPitch(carrier.detune);
      mod.type = p.wave2;
      mod.frequency.value = frequency * p.fmRatio;
      applyPitch(mod.detune);
      ringGain.gain.value = (1 - p.shape) * 0.5;
      depth.gain.value = 0.5 + p.shape * 0.5;
      mod.connect(depth);
      depth.connect(ringGain.gain);
      carrier.connect(ringGain);
      ringGain.connect(drive);
      sources.push(carrier, mod);
      nodes.push(ringGain, depth);
      carrier.start(start);
      mod.start(start);
    }
    if (p.engine === "physical") {
      const count = Math.ceil(c.sampleRate * 6),
        buffer = c.createBuffer(1, count, c.sampleRate),
        d = buffer.getChannelData(0),
        period = Math.max(2, Math.floor(c.sampleRate / frequency)),
        line = new Float32Array(period);
      for (let i = 0; i < period; i++)
        line[i] = (Math.random() * 2 - 1) * (0.3 + p.brightness * 0.7);
      for (let i = 0; i < count; i++) {
        const index = i % period,
          next = (index + 1) % period;
        const val = (line[index] + line[next]) * 0.5 * p.damping;
        d[i] = line[index];
        line[index] = val;
      }
      const source = c.createBufferSource();
      source.buffer = buffer;
      applyPitch(source.detune);
      source.connect(drive);
      sources.push(source);
      source.start(start);
    }
    if (p.engine === "sampler" || p.engine === "granular") {
      const sample =
          (p.sample && this.sampleCache.get(p.sample)) || this.defaultSample,
        rate = 2 ** ((note + p.tune - p.sampleRoot) / 12);
      const sampleStart =
          Math.min(p.sampleStart, p.sampleEnd - 0.01) * sample.duration,
        sampleEnd =
          Math.max(p.sampleEnd, p.sampleStart + 0.01) * sample.duration;
      if (p.engine === "sampler") {
        const source = c.createBufferSource();
        source.buffer = sample;
        source.playbackRate.value = rate;
        applyPitch(source.detune);
        source.loop = p.sampleLoop;
        source.loopStart = sampleStart;
        source.loopEnd = sampleEnd;
        source.connect(drive);
        sources.push(source);
        source.start(
          start,
          sampleStart,
          p.sampleLoop ? undefined : sampleEnd - sampleStart,
        );
      } else {
        // Live clouds are replenished with a short lookahead, without accumulating ended grains.
        let cursor = start;
        scheduleGrains = (until: number) => {
          if (c instanceof AudioContext && cursor < c.currentTime - 0.1)
            cursor = c.currentTime;
          while (cursor < until) {
            const at = cursor,
              source = c.createBufferSource(),
              window = c.createGain();
            cursor += 1 / p.grainDensity;
            source.buffer = sample;
            source.playbackRate.value =
              rate * (1 + (Math.random() - 0.5) * p.spread * 0.08);
            applyPitch(source.detune);
            const length = Math.min(p.grainSize, sample.duration / rate),
              offset = clamp(
                p.position * sample.duration +
                  (Math.random() - 0.5) * p.spread * sample.duration,
                0,
                Math.max(0, sample.duration - length * rate),
              );
            window.gain.setValueAtTime(0, at);
            window.gain.linearRampToValueAtTime(
              0.75 / Math.sqrt(Math.max(1, p.grainDensity * length)),
              at + length * 0.4,
            );
            window.gain.linearRampToValueAtTime(0, at + length);
            source.connect(window);
            window.connect(drive);
            sources.push(source);
            nodes.push(window);
            source.start(at, offset);
            source.stop(at + length);
            source.onended = () => {
              source.disconnect();
              window.disconnect();
              const si = sources.indexOf(source);
              if (si >= 0) sources.splice(si, 1);
              const ni = nodes.indexOf(window);
              if (ni >= 0) nodes.splice(ni, 1);
              const pi = pitch.indexOf(source.detune);
              if (pi >= 0) pitch.splice(pi, 1);
              pitchOffsets.delete(source.detune);
              for (const mod of pitchModNodes)
                try {
                  mod.disconnect(source.detune);
                } catch {
                  /* The voice may already have been disconnected. */
                }
            };
          }
        };
        if (duration === undefined && c instanceof AudioContext) {
          scheduleGrains(start + 0.15);
          grainTimer = window.setInterval(
            () => scheduleGrains?.(c.currentTime + 0.15),
            25,
          );
        } else scheduleGrains(start + (duration ?? 8) + p.release);
      }
    }
    if (
      p.sub > 0.001 &&
      p.engine !== "granular" &&
      p.engine !== "sampler" &&
      p.engine !== "physical"
    )
      addOsc("sine", frequency / 2, p.sub);
    if (p.noise > 0.001) {
      const source = c.createBufferSource(),
        gain = c.createGain();
      source.buffer = this.noise;
      source.loop = true;
      gain.gain.value = p.noise;
      source.connect(gain);
      gain.connect(drive);
      sources.push(source);
      nodes.push(gain);
      source.start(start);
    }
    // Modulation is connected at audio rate, including each LFO's own depth and tempo sync.
    this.lastNotes[track] = note;
    const targets: Record<string, { params: AudioParam[]; scale: number }> = {
      cutoff: {
        params: [isPara ? bus.paraFilter.frequency : filter.frequency],
        scale: Math.min(6000, p.cutoff * 2),
      },
      pitch: { params: pitch, scale: 1200 },
      amplitude: { params: [amp.gain], scale: 0.16 * velocity },
      pan: { params: [panner.pan], scale: 1 },
      fmIndex: { params: fmGain ? [fmGain.gain] : [], scale: frequency * 10 },
    };
    for (const mod of p.mods) {
      const target = targets[mod.target];
      if (!target?.params.length || Math.abs(mod.amount) < 0.0001) continue;
      const gain = c.createGain();
      gain.gain.value = mod.amount * target.scale;
      nodes.push(gain);
      if (mod.source === "lfo1" || mod.source === "lfo2") {
        const l = p.lfos[mod.source === "lfo1" ? 0 : 1],
          osc = c.createOscillator();
        osc.type = l.shape;
        osc.frequency.value = l.sync ? this.tempo / 60 / l.division : l.rate;
        gain.gain.value *= l.depth;
        // A continuously phased LFO uses context time; retriggered LFOs start at phase zero.
        if (!l.retrigger) {
          const real = new Float32Array([
              0,
              Math.sin(start * osc.frequency.value * 2 * Math.PI),
            ]),
            imag = new Float32Array([
              0,
              Math.cos(start * osc.frequency.value * 2 * Math.PI),
            ]);
          if (l.shape === "sine")
            osc.setPeriodicWave(c.createPeriodicWave(real, imag));
        }
        osc.connect(gain);
        lfoControls.push({
          index: mod.source === "lfo1" ? 0 : 1,
          oscillator: osc,
          gain,
          scale: mod.amount * target.scale,
          shape: l.shape,
        });
        sources.push(osc);
        osc.start(start);
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
        if (mod.source === "filterEnv")
          scheduleEnvelope(
            source.offset,
            {
              attack: p.filterAttack,
              decay: p.filterDecay,
              sustain: p.filterSustain,
              release: p.filterRelease,
            },
            start,
          );
        source.connect(gain);
        sources.push(source);
        source.start(start);
      }
      for (const param of target.params) gain.connect(param);
      if (mod.target === "pitch") pitchModNodes.push(gain);
    }
    const voice: Voice = {
      track,
      note,
      velocity,
      time: start,
      amp,
      filter,
      panner,
      sources,
      nodes,
      patch: p,
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
      if (grainTimer !== undefined) {
        window.clearInterval(grainTimer);
        grainTimer = undefined;
        scheduleGrains?.(releaseAt + p.release);
      }
      const others = this.voices.filter(
        (v) =>
          v !== voice &&
          v.track === track &&
          v.time <= releaseAt &&
          v.releaseAt > releaseAt,
      );
      const releaseLength = isPara && others.length ? 0.025 : p.release;
      amp.gain.cancelScheduledValues(releaseAt);
      amp.gain.setValueAtTime(Math.max(EPS, value), releaseAt);
      amp.gain.exponentialRampToValueAtTime(EPS, releaseAt + releaseLength);
      if (isPara) {
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
          bus.paraAmp.gain.cancelScheduledValues(latest);
          bus.paraAmp.gain.setValueAtTime(
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
            latest,
          );
          bus.paraAmp.gain.exponentialRampToValueAtTime(
            EPS,
            latest + shared.release,
          );
          bus.paraFilter.frequency.setTargetAtTime(
            shared.cutoff,
            latest,
            Math.max(0.005, shared.filterRelease / 4),
          );
        }
      }
      filter.frequency.cancelScheduledValues(releaseAt);
      filter.frequency.setTargetAtTime(
        p.cutoff,
        releaseAt,
        Math.max(0.005, p.filterRelease / 4),
      );
      const end = releaseAt + releaseLength + 0.05;
      voice.end = end;
      for (const source of sources) {
        try {
          source.stop(end);
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
            if (c.currentTime + 0.1 >= end)
              for (const n of [...sources, ...nodes]) n.disconnect();
          },
          { once: true },
        );
      if (c instanceof AudioContext)
        window.setTimeout(
          () => {
            for (const n of [...sources, ...nodes]) n.disconnect();
            this.voices = this.voices.filter((v) => v !== voice);
          },
          Math.max(0, (end - c.currentTime) * 1000) + 100,
        );
    };
    this.voices.push(voice);
    if (duration !== undefined) voice.release(start + Math.max(0.01, duration));
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
  panic(track?: number) {
    const now = this.context.currentTime;
    this.monoHeld = this.monoHeld.map((notes, i) =>
      track === undefined || i === track ? [] : notes,
    );
    for (const v of this.voices)
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
      }
  }
  dispose() {
    this.panic();
    for (const b of this.buses) {
      b.chorusLfo.stop();
      b.input.disconnect();
      b.level.disconnect();
      b.pan.disconnect();
      b.feedback.disconnect();
    }
    this.master.disconnect();
  }
}

export type StepEvent = {
  track: number;
  step: number;
  cycle: number;
  time: number;
};
export class Transport {
  private timer: number | undefined;
  private tick = 0;
  private next = 0;
  private epoch = 0;
  private uiTimers = new Set<number>();
  fill = false;
  external = false;
  private clockPulses = 0;
  onStep: (event: StepEvent) => void = () => {};
  onClock: (status: number, time: number) => void = () => {};
  onNote: (
    track: number,
    note: number,
    velocity: number,
    time: number,
    duration: number,
  ) => void = () => {};
  getProject: () => Project;
  constructor(
    readonly engine: SynthEngine,
    getProject: () => Project,
  ) {
    this.getProject = getProject;
  }
  get running() {
    return this.timer !== undefined || this.external;
  }
  start(external = false) {
    if (this.running) return;
    this.tick = 0;
    this.epoch = this.engine.context.currentTime + 0.07;
    this.next = this.epoch;
    this.external = external;
    this.clockPulses = 0;
    if (!external) {
      this.onClock(0xfa, this.epoch);
      this.timer = window.setInterval(() => this.schedule(), 20);
      this.schedule();
    }
  }
  private schedule() {
    const c = this.engine.context;
    while (this.next < c.currentTime + 0.12) {
      this.scheduleTick(this.tick, this.next);
      for (let pulse = 0; pulse < 3; pulse++)
        this.onClock(
          0xf8,
          this.next + pulse * (60 / this.getProject().tempo / 24),
        );
      this.next += 60 / this.getProject().tempo / 8;
      this.tick++;
    }
  }
  clock() {
    if (!this.external) return;
    if (this.clockPulses++ % 3 === 0) {
      this.scheduleTick(this.tick, this.engine.context.currentTime + 0.025);
      this.tick++;
    }
  }
  private scheduleTick(tick: number, time: number) {
    const project = this.getProject(),
      quantum = 60 / project.tempo / 8;
    project.tracks.forEach((track) => {
      const pattern = track.patterns[project.activePattern],
        ratio = 32 / pattern.division;
      if (tick % ratio !== 0) return;
      const position = tick / ratio,
        index = stepIndex(position, pattern.length, pattern.direction),
        cycle = Math.floor(
          position /
            (pattern.direction === "pingpong"
              ? Math.max(1, pattern.length * 2 - 2)
              : pattern.length),
        );
      const step = pattern.steps[index],
        duration = quantum * ratio,
        swing = position % 2 ? project.swing * duration : 0;
      const at = Math.max(
        this.engine.context.currentTime,
        time + swing + step.micro * duration,
      );
      const id = window.setTimeout(
        () => {
          this.uiTimers.delete(id);
          this.onStep({ track: track.id, step: index, cycle, time: at });
        },
        Math.max(0, (at - this.engine.context.currentTime) * 1000),
      );
      this.uiTimers.add(id);
      const audible =
        !track.mute && (!project.tracks.some((t) => t.solo) || track.solo);
      if (audible && shouldTrigger(step, cycle, this.fill)) {
        const patch = lockedPatch(track.patch, step.locks);
        this.engine.scheduleTrack(track.id, patch, at);
        for (let r = 0; r < step.retrig; r++)
          for (const offset of CHORDS[step.chord]) {
            const note = clamp(step.note + offset, 0, 127),
              time = at + (r * duration) / step.retrig,
              gate = (duration * step.gate) / step.retrig;
            this.engine.noteOn(
              track.id,
              note,
              step.velocity,
              patch,
              time,
              gate,
            );
            this.onNote(track.id, note, step.velocity, time, gate);
          }
      }
    });
  }
  stop() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.external = false;
    this.tick = 0;
    for (const id of this.uiTimers) window.clearTimeout(id);
    this.uiTimers.clear();
    this.onClock(0xfc, this.engine.context.currentTime);
    this.engine.panic();
  }
}
export function lockedPatch(patch: Patch, locks: Partial<Numbers>): Patch {
  const p = { ...patch };
  for (const key of Object.keys(locks) as Param[])
    if (LOCK_PARAMS.includes(key))
      p[key] = clamp(locks[key]!, PARAMS[key][0], PARAMS[key][1]);
  return p;
}
export async function renderProject(
  project: Project,
  bars = 4,
  fill = false,
): Promise<AudioBuffer> {
  const quarter = 60 / project.tempo,
    seconds = bars * 4 * quarter,
    tail = Math.max(
      5,
      ...project.tracks.map((t) => t.patch.release + t.patch.reverbSize),
    ),
    ctx = new OfflineAudioContext(
      2,
      Math.ceil((seconds + tail) * 44100),
      44100,
    ),
    engine = new SynthEngine(ctx);
  engine.update(project);
  await engine.prepare(project);
  const ticks = bars * 32;
  for (let tick = 0; tick < ticks; tick++)
    for (const track of project.tracks) {
      if (track.mute || (project.tracks.some((t) => t.solo) && !track.solo))
        continue;
      const pat = track.patterns[project.activePattern],
        ratio = 32 / pat.division;
      if (tick % ratio) continue;
      const pos = tick / ratio,
        index = stepIndex(pos, pat.length, pat.direction),
        cycle = Math.floor(
          pos /
            (pat.direction === "pingpong"
              ? Math.max(1, pat.length * 2 - 2)
              : pat.length),
        ),
        s = pat.steps[index],
        duration = (quarter * 4) / pat.division;
      if (!shouldTrigger(s, cycle, fill)) continue;
      const at = Math.max(
        0,
        (tick * quarter) / 8 +
          (pos % 2 ? project.swing * duration : 0) +
          s.micro * duration,
      );
      const patch = lockedPatch(track.patch, s.locks);
      engine.scheduleTrack(track.id, patch, at);
      for (let r = 0; r < s.retrig; r++)
        for (const offset of CHORDS[s.chord])
          engine.noteOn(
            track.id,
            clamp(s.note + offset, 0, 127),
            s.velocity,
            patch,
            at + (r * duration) / s.retrig,
            (duration * s.gate) / s.retrig,
          );
    }
  return ctx.startRendering();
}
