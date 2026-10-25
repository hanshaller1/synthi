import { MODULATION_PARAMS, MODULATION_LABELS, MOD_SOURCES, LFO_MODES, LFO_SHAPES } from "./modulation-spec";
import { migrateLfoPatch, migrateLfoLocks } from "./lfo-migration";
import type { DynamicParam } from "./modulation-spec";
import { DYNAMIC_META, DYNAMIC_PARAMS, DYNAMIC_TARGETS, normalizeModulationPatch } from "./parameter-spec";
import { ENGINE_PARAMS, ENGINE_KEYS, ENGINE_TARGETS, ENGINE_DISCRETE, sampleSliceSelection, normalizeSampleLocks } from "./engine-config";
import { makeSoundBank } from "./factory-presets";
import { FILTER_PARAMS, FILTER_KEYS, FILTER_TARGETS, FILTER_DISCRETE } from "./filter-config";
import { FM_PARAMS, FM_KEYS, FM_TARGETS, FM_ALGORITHMS, LEGACY_FM_KEYS, migrateFmPatch, migrateFmLocks } from "./fm-config";
import type { FmAlgorithm } from "./fm-config";
import { FX_CONTROLS, LEGACY_FX_KEYS, FX_PARAMETER_META, defaultFxSettings } from "./fx-spec";
import type { FxSettings } from "./fx-spec";
export const TRACK_COUNT = 12;
export const KEYBOARD_OCTAVES = 4;

export type Engine =
  | "subtractive"
  | "wavetable"
  | "fm"
  | "additive"
  | "ring"
  | "granular"
  | "sampler"
  | "physical";
export type Wave = "sawtooth" | "square" | "triangle" | "sine";
export type FilterType =
  | "lowpass"
  | "highpass"
  | "bandpass"
  | "notch"
  | "multimode"
  | "comb";
export const MULTIMODE_FILTERS = [
  { id: "lp2", label: "LP 12 dB" },
  { id: "lp4", label: "LP 24 dB" },
  { id: "lp6", label: "LP 36 dB" },
  { id: "lp8", label: "LP 48 dB" },
  { id: "hp2", label: "HP 12 dB" },
  { id: "hp4", label: "HP 24 dB" },
  { id: "hp6", label: "HP 36 dB" },
  { id: "hp8", label: "HP 48 dB" },
  { id: "morph", label: "Morph LP ↔ BP ↔ HP · 24 dB" },
  { id: "bp", label: "Bandpass" },
  { id: "notch", label: "Notch / Bandstop" },
  { id: "peak", label: "Peak" },
] as const;
export type MultimodeFilter = (typeof MULTIMODE_FILTERS)[number]["id"];
export type Envelope = {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};
export type LfoShape = (typeof LFO_SHAPES)[number];
export type LfoMode = (typeof LFO_MODES)[number];
export type Lfo = {
  shape: LfoShape;
  mode: LfoMode;
  legacyTriggerMod?:boolean;
  randomRepeat?:number;
  rate: number;
  sync: boolean;
  division: number;
  depth: number;
  phase?:number; delay?:number; fade?:number; fadeOut?:number; slew?:number; skew?:number; pulseWidth?:number; polarity?:number;
};
export type ModSource = keyof typeof MOD_SOURCES;
export type ModTarget = keyof typeof MOD_TARGETS;
export type Modulation = {
  source: ModSource;
  target: ModTarget;
  amount: number;
  curve?: "linear" | "exponential" | "logarithmic";
};
export const BASE_PARAMS = {
  ...FM_PARAMS,
  ...FILTER_PARAMS,
  ...ENGINE_PARAMS,
  ...MODULATION_PARAMS,
  tune: [-24, 24, 0],
  unison: [1, 8, 1],
  unisonDetune: [0, 50, 12],
  unisonWidth: [0, 1, 0.7],
  osc2Tune: [-24, 24, 0],
  pulseWidth: [0.05, 0.95, 0.5],
  drift: [0, 20, 0],
  wavetable: [0, 31, 0],
  wtWarp: [-1, 1, 0],
  wtFormant: [0, 1, 0],
  fmFeedback: [0, 1, 0],
  fmDecay: [0.01, 5, 1],
  fmEnd: [0, 1, 1],
  fmRatio2: [0.25, 16, 3],
  fmIndex2: [0, 20, 0],
  spectralTilt: [-1, 1, 0],
  spectralPeak: [1, 32, 4],
  spectralResonance: [0, 1, 0],
  inharmonicity: [0, 0.04, 0],
  ringDepth: [0, 1, 1],
  ringDry: [0, 1, 0],
  ringBias: [-1, 1, 0],
  ringOffset: [-2000, 2000, 0],
  grainScan: [-1, 1, 0],
  grainPitch: [0, 24, 0],
  grainReverse: [0, 1, 0],
  grainPan: [0, 1, 0.5],
  grainWindow: [0.05, 0.95, 0.4],
  sampleReverse: [0, 1, 0],
  sampleFine: [-100, 100, 0],
  sampleLoopStart: [0, 0.95, 0],
  sampleLoopEnd: [0.05, 1, 1],
  sampleFade: [0, 0.1, 0.005],
  pluckPosition: [0.01, 0.99, 0.2],
  stringDecay: [0.2, 12, 5],
  bodySize: [0, 1, 0.2],
  dispersion: [0, 1, 0.1],
  detune: [0, 50, 9],
  mix: [0, 1, 0.5],
  sub: [0, 1, 0.18],
  noise: [0, 1, 0.01],
  glide: [0, 2, 0.08],
  shape: [0, 1, 0.35],
  fmRatio: [0.25, 16, 2],
  fmIndex: [0, 20, 3],
  harmonics: [1, 32, 12],
  brightness: [0, 1, 0.5],
  grainSize: [0.015, 0.4, 0.1],
  grainDensity: [2, 40, 12],
  position: [0, 1, 0.3],
  spread: [0, 1, 0.25],
  damping: [0.1, 0.999, 0.985],
  sampleRoot: [24, 96, 60],
  sampleStart: [0, 0.95, 0],
  sampleEnd: [0.05, 1, 1],
  cutoff: [30, 18000, 2400],
  resonance: [0, 20, 2.2],
  combFeedback: [0, 0.98, 0.65],
  combDamping: [100, 18000, 8000],
  combMix: [0, 1, 0.75],
  filterAmount: [-6, 6, 2.6],
  drive: [0, 1, 0.12],
  attack: [0.002, 4, 0.008],
  decay: [0.01, 4, 0.32],
  sustain: [0, 1, 0.5],
  release: [0.01, 8, 0.45],
  filterAttack: [0.002, 4, 0.006],
  filterDecay: [0.01, 4, 0.4],
  filterSustain: [0, 1, 0.15],
  filterRelease: [0.01, 8, 0.3],
  level: [0, 1, 0.65],
  pan: [-1, 1, 0],
  chorus: [0, 1, 0.12],
  delay: [0, 1, 0.16],
  delayTime: [0.04, 1.5, 0.375],
  feedback: [0, 0.85, 0.32],
  reverb: [0, 1, 0.2],
  reverbSize: [0.2, 5, 2.6],
  distortion: [0, 1, 0.05],
  saturationOutputTrim: [-24,12,0], reverbLowCut: [20,2000,20], reverbHighCut: [500,20000,20000], reverbWidth: [0,1,1],
} as const;
export const PARAMS: typeof BASE_PARAMS & typeof DYNAMIC_PARAMS = { ...BASE_PARAMS, ...DYNAMIC_PARAMS };
export type BaseParam = keyof typeof BASE_PARAMS;
export type Param = keyof typeof PARAMS;
export type MidiTarget = Param | "fmAlgorithm";
const destination = (label: string, group: string, trigger = false) => ({ label, group, trigger });
const TARGET_SPEC = {
  ...Object.fromEntries(Object.keys(BASE_PARAMS).map(key=>[key,destination(key, key.startsWith("modEnv")?"Modulation envelopes":key.startsWith("macro")?"Macros":"Synthesizer")])) as Record<BaseParam,ReturnType<typeof destination>>,
  ...Object.fromEntries(Object.entries(FX_PARAMETER_META).map(([id,m])=>[id,destination(m.label,m.group)])),
  ...Object.fromEntries(Object.entries(MODULATION_LABELS).map(([id,label])=>[id,destination(label,id.startsWith("modEnv")?"Modulation envelopes":id.startsWith("macro")?"Macros":"Random",id.startsWith("modEnv"))])),
  ...DYNAMIC_TARGETS,
  ...FM_TARGETS,
  ...FILTER_TARGETS,
  ...ENGINE_TARGETS,
  distortion: destination("Saturation drive", "Track FX"), chorus: destination("Modulation FX mix", "Track FX"), delay: destination("Delay mix", "Track FX"), delayTime: destination("Delay time", "Track FX"), feedback: destination("Delay feedback", "Track FX"), reverb: destination("Reverb mix", "Track FX"), reverbSize: destination("Reverb decay", "Track FX"),
  ...Object.fromEntries(Object.keys(MODULATION_PARAMS).filter(key=>key.startsWith("modEnv")).map(key=>[key,destination(MODULATION_LABELS[key],"Modulation envelopes",true)])) as Record<keyof typeof MODULATION_PARAMS,ReturnType<typeof destination>>,
  pitch: destination("Pitch", "Global"),
  tune: destination("Transpose", "Global"),
  unison: destination("Unison voices", "Global", true),
  unisonDetune: destination("Unison detune", "Global"),
  unisonWidth: destination("Unison width", "Global"),
  glide: destination("Portamento", "Global", true),
  wave: destination("Oscillator 1 waveform", "Subtractive", true),
  wave2: destination("Oscillator 2 waveform", "Subtractive", true),
  detune: destination("Oscillator detune", "Subtractive"),
  osc2Tune: destination("Oscillator 2 transpose", "Subtractive"),
  mix: destination("Oscillator mix", "Subtractive"),
  pulseWidth: destination("Pulse width", "Subtractive"),
  drift: destination("Analog drift", "Subtractive", true),
  sub: destination("Sub level", "Global"),
  noise: destination("Noise level", "Global"),
  wavetable: destination("Wavetable selection", "Wavetable"),
  shape: destination("Position / Odd-even / AM-Ring", "Engine"),
  wtWarp: destination("Phase warp", "Wavetable"),
  wtFormant: destination("Formant", "Wavetable"),
  brightness: destination("Brightness", "Engine"),
  fmRatio: destination("Ring modulator ratio", "Ring / AM"),
  fmIndex: destination("FM index", "FM"),
  fmFeedback: destination("FM feedback", "FM"),
  fmDecay: destination("Index decay", "FM", true),
  fmEnd: destination("Index end", "FM", true),
  fmRatio2: destination("Operator 3 ratio", "FM"),
  fmIndex2: destination("Operator 3 index", "FM"),
  fmAlgorithm: destination("FM algorithm", "FM", true),
  harmonics: destination("Partials", "Additive"),
  spectralTilt: destination("Spectral tilt", "Additive"),
  spectralPeak: destination("Peak partial", "Additive"),
  spectralResonance: destination("Peak boost", "Additive"),
  inharmonicity: destination("Inharmonicity", "Additive"),
  ringDepth: destination("Ring depth", "Ring / AM"),
  ringDry: destination("Dry carrier", "Ring / AM"),
  ringBias: destination("Ring bias", "Ring / AM"),
  ringOffset: destination("Modulator offset", "Ring / AM"),
  grainSize: destination("Grain size", "Granular"),
  grainDensity: destination("Grain density", "Granular"),
  position: destination("Grain position", "Granular"),
  spread: destination("Position jitter", "Granular"),
  grainScan: destination("Scan speed", "Granular"),
  grainPitch: destination("Pitch scatter", "Granular"),
  grainReverse: destination("Reverse chance", "Granular"),
  grainPan: destination("Stereo scatter", "Granular"),
  grainWindow: destination("Window attack", "Granular"),
  sampleId: destination("Sample selection", "Sampler", true),
  grainSampleId: destination("Texture selection", "Granular", true),
  sampleRoot: destination("Sample root", "Sampler"),
  sampleFine: destination("Sample fine tune", "Sampler"),
  sampleStart: destination("Sample start", "Sampler", true),
  sampleEnd: destination("Sample end", "Sampler", true),
  sampleReverse: destination("Sample reverse", "Sampler", true),
  sampleLoop: destination("Sample loop", "Sampler", true),
  sampleLoopStart: destination("Loop start", "Sampler", true),
  sampleLoopEnd: destination("Loop end", "Sampler", true),
  sampleFade: destination("Edge fade", "Sampler", true),
  damping: destination("String damping", "Physical", true),
  pluckPosition: destination("Pick position", "Physical", true),
  stringDecay: destination("String decay", "Physical", true),
  bodySize: destination("Body", "Physical"),
  dispersion: destination("Dispersion", "Physical", true),
  excitation: destination("Excitation type", "Physical", true),
  filterType: destination("Filter model", "Filter", true),
  multimodeType: destination("Multimode type", "Filter", true),
  combPolarity: destination("Comb polarity", "Filter", true),
  cutoff: destination("Cutoff / Comb frequency", "Filter"),
  resonance: destination("Resonance", "Filter"),
  combFeedback: destination("Comb feedback", "Filter"),
  combDamping: destination("Comb damping", "Filter"),
  combMix: destination("Comb dry / wet", "Filter"),
  drive: destination("Filter drive", "Filter"),
  filterAmount: destination("Filter · Env depth", "Filter"),
  filterAttack: destination("Filter attack", "Filter envelope", true),
  filterDecay: destination("Filter decay", "Filter envelope", true),
  filterSustain: destination("Filter sustain", "Filter envelope", true),
  filterRelease: destination("Filter release", "Filter envelope", true),
  amplitude: destination("Amplitude", "Amplifier"),
  level: destination("Level", "Amplifier"),
  pan: destination("Pan", "Amplifier"),
  attack: destination("Amp attack", "Amp envelope", true),
  decay: destination("Amp decay", "Amp envelope", true),
  sustain: destination("Amp sustain", "Amp envelope", true),
  release: destination("Amp release", "Amp envelope", true),
};
export const MOD_TARGETS = TARGET_SPEC as typeof TARGET_SPEC & Record<DynamicParam,ReturnType<typeof destination>>;
// Event targets are sampled on the note/step timeline; continuous controls are smoothed.
export const LOCK_PARAMS = Object.keys(PARAMS) as Param[];
export const PARAM_LABELS = Object.fromEntries((Object.keys(PARAMS) as Param[]).map((key) => [key,
  key in MOD_TARGETS ? MOD_TARGETS[key as keyof typeof MOD_TARGETS].label : ({
    chorus: "Modulation FX · Mix", delay: "Delay · Mix", delayTime: "Delay · Time",
    feedback: "Delay · Feedback", reverb: "Reverb · Mix", reverbSize: "Reverb · Decay",
    distortion: "Saturation · Drive",
  } as Partial<Record<Param, string>>)[key] ?? key,
])) as Record<Param, string>;
export type Numbers = Record<Param, number>;
export const FX_OPTIONS = {
  saturationMode: [
    { id: "soft", label: "Soft clip", description: "Warme, weiche Sättigung" },
    {
      id: "hard",
      label: "Hard clip",
      description: "Kantiges symmetrisches Clipping",
    },
    {
      id: "fold",
      label: "Wavefolder",
      description: "Zurückgefaltete Obertöne",
    },
    {
      id: "crush",
      label: "Bit crush",
      description: "Quantisierung von 16 bis 3 Bit",
    },
    { id: "diode", label: "Diode", description: "Asymmetrische Sättigung" },
  ],
  modulationMode: [
    {
      id: "chorus",
      label: "Chorus",
      description: "Schwebende Delay-Modulation",
    },
    {
      id: "flanger",
      label: "Flanger",
      description: "Kurzes Delay mit Rückkopplung",
    },
    {
      id: "vibrato",
      label: "Vibrato",
      description: "Periodische Tonhöhenschwankung",
    },
    {
      id: "phaser",
      label: "Phaser",
      description: "Vier modulierte Allpass-Stufen",
    },
    {
      id: "tremolo",
      label: "Tremolo",
      description: "Rhythmische Amplitudenmodulation",
    },
  ],
  delayMode: [
    {
      id: "digital",
      label: "Digital",
      description: "Klare, ungefilterte Wiederholungen",
    },
    { id: "tape", label: "Tape", description: "Dunkle, gesättigte Echos" },
    {
      id: "pingpong",
      label: "Ping-pong",
      description: "Abwechselnde Echos links und rechts",
    },
    {
      id: "multitap",
      label: "Multi-tap",
      description: "Drei versetzte Stereo-Taps",
    },
    { id: "dub", label: "Dub", description: "Resonantes Bandpass-Feedback" },
  ],
  reverbMode: [
    {
      id: "room",
      label: "Room",
      description: "Kurzer Raum mit frühen Reflexionen",
    },
    {
      id: "hall",
      label: "Hall",
      description: "Weites, dichtes Stereo-Hallfeld",
    },
    {
      id: "plate",
      label: "Plate",
      description: "Heller, diffus einsetzender Nachhall",
    },
    {
      id: "spring",
      label: "Spring",
      description: "Dispersive metallische Federresonanzen",
    },
    {
      id: "gated",
      label: "Gated",
      description: "Abrupt abgeschnittene Hallfahne",
    },
  ],
} as const;
export type FxSlot = keyof typeof FX_OPTIONS;
type FxSelection = { [K in FxSlot]: (typeof FX_OPTIONS)[K][number]["id"] };
export type Patch = Record<BaseParam, number> & Partial<Record<DynamicParam,number>> &
  FxSelection & {
    name: string;
    engine: Engine;
    engineVersion: 1 | 2;
    modVersion: 1 | 2;
    lfoVersion: 2;
    fxVersion: 1 | 2;
    wave: Wave;
    wave2: Wave;
    filterType: FilterType;
    filterVersion: 1 | 2;
    legacyPeakModulation: boolean;
    multimodeType: MultimodeFilter;
    combPolarity: "positive" | "negative";
    voiceMode: "mono" | "para" | "poly";
    legato: boolean;
    lfos: [Lfo, Lfo, Lfo];
    fxOrder: FxSlot[];
    fxEnabled: Record<FxSlot, boolean>;
    fxSettings: FxSettings;
    sampleId: string;
    grainSampleId: string;
    fmAlgorithm: FmAlgorithm;
    fmVersion: 2;
    excitation: "noise" | "pick" | "bow";
    mods: Modulation[];
    sample: string | null;
    sampleName: string;
    sampleLoop: boolean;
  };
export type Condition = "always" | "1:2" | "2:2" | "1:4" | "fill" | "!fill";
export type Step = {
  on: boolean;
  note: number;
  chord: "single" | "major" | "minor" | "fifth" | "seventh";
  velocity: number;
  gate: number;
  span: number;
  probability: number;
  micro: number;
  retrig: number;
  condition: Condition;
  locks: Partial<Numbers>;
};
export const CHORDS: Record<Step["chord"], number[]> = {
  single: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  fifth: [0, 7],
  seventh: [0, 3, 7, 10],
};
export const MAX_STEPS = 128;
export const SCALES = {
  major: { label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Natural minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { label: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { label: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  locrian: { label: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
  harmonicMinor: { label: "Harmonic minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor: { label: "Melodic minor", intervals: [0, 2, 3, 5, 7, 9, 11] },
  majorPentatonic: { label: "Major pentatonic", intervals: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: "Minor pentatonic", intervals: [0, 3, 5, 7, 10] },
  blues: { label: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
  chromatic: { label: "Chromatic", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};
export type ScaleConfig = { enabled: boolean; root: number; name: keyof typeof SCALES };
export type EditorMode = "step" | "piano";
export type PianoNote = {
  id: string;
  start: number;
  duration: number;
  note: number;
  velocity: number;
  probability: number;
  condition: Condition;
  micro: number;
  locks: Partial<Numbers>;
  // Converted chords and ratchets share one probability decision per cycle.
  group?: string;
};
export type Pattern = {
  swingMode: "global" | "custom" | "off";
  swing: number;
  swingResolution: 8 | 16;
  length: number;
  division: number;
  direction: "forward" | "reverse" | "pingpong" | "random";
  steps: Step[];
  notes: PianoNote[];
  scale: ScaleConfig;
  pianoPlayback?: { start: number; end: number; loop: boolean };
  pianoBackup?: { notes: PianoNote[]; steps: Step[]; length: number; division: number; direction: Pattern["direction"]; swingMode?:Pattern["swingMode"];swing?:number;swingResolution?:8|16 };
};
export function pianoRange(pattern: Pattern) {
  const start = clamp(Math.round(pattern.pianoPlayback?.start ?? 0), 0, pattern.length - 1);
  return { start, end: clamp(Math.round(pattern.pianoPlayback?.end ?? pattern.length), start + 1, pattern.length), loop: pattern.pianoPlayback?.loop ?? true };
}
export type Track = {
  id: number;
  name: string;
  color: string;
  patch: Patch;
  mute: boolean;
  solo: boolean;
  mode: EditorMode;
  patterns: Pattern[];
};
export const HEAT_MODES = [
  "Clean boost",
  "Saturation",
  "Enhancement",
  "Mid drive",
  "Rough crunch",
  "Classic distortion",
  "Round fuzz",
  "High gain",
];
export type MasterFx = {
  enabled: boolean;
  driveEnabled: boolean;
  driveMode: number;
  drive: number;
  bias: number;
  tone: number;
  lowCut: number;
  mix: number;
  output: number;
  eqEnabled: boolean;
  eqBands: 2 | 3 | 8;
  eq2: number[];
  eq3: number[];
  eq8: number[];
  compressorEnabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  makeup: number;
  width: number;
  delayEnabled: boolean;
  delay: number;
  delayTime: number;
  feedback: number;
  reverbEnabled: boolean;
  reverb: number;
  reverbSize: number;
};
export const makeMasterFx = (): MasterFx => ({
  enabled: true,
  driveEnabled: false,
  driveMode: 1,
  drive: 0.2,
  bias: 0,
  tone: 12000,
  lowCut: 20,
  mix: 1,
  output: 0,
  eqEnabled: true,
  eqBands: 3,
  eq2: [0, 0],
  eq3: [0, 0, 0],
  eq8: Array(8).fill(0),
  compressorEnabled: false,
  threshold: -18,
  ratio: 3,
  attack: 0.015,
  release: 0.2,
  makeup: 0,
  width: 1,
  delayEnabled: false,
  delay: 0.12,
  delayTime: 0.375,
  feedback: 0.3,
  reverbEnabled: false,
  reverb: 0.15,
  reverbSize: 2.5,
});
export const STEP_SPANS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];
export function stepLengthLabel(span: number, division: number) {
  const base = division / span;
  if (Number.isInteger(Math.log2(base))) return `1/${base}`;
  if (Number.isInteger(Math.log2(base * 1.5))) return `1/${base * 1.5}·`;
  return `${span}×`;
}
export type PatternStep = { index: number; span: number; slots: number };
/** Lengths occupy fixed grid positions. Covered steps stay stored but do not trigger. */
export function patternTimeline(pattern: Pattern, includeOutside = false): PatternStep[] {
  const end = includeOutside ? pattern.steps.length : pattern.length;
  const result: PatternStep[] = [];
  for (let index = 0; index < end;) {
    const boundary = index < pattern.length ? Math.min(end, pattern.length) : end;
    const span = Math.min(pattern.steps[index].span, boundary - index);
    const slots = Math.min(Math.max(1, Math.ceil(span)), boundary - index);
    result.push({ index, span, slots });
    index += slots;
  }
  return result;
}
export function stepAtPosition(pattern: Pattern, position: number): PatternStep {
  const timeline = patternTimeline(pattern, true);
  return timeline.find((s) => position >= s.index && position < s.index + s.slots) ?? timeline[0];
}
/** Shared clock-grid traversal for realtime audio, MIDI and offline rendering. */
export function playbackStep(pattern: Pattern, position: number, random = Math.random) {
  const timeline = patternTimeline(pattern);
  const cycleLength = pattern.direction === "pingpong"
    ? Math.max(1, pattern.length * 2 - 2)
    : pattern.length;
  const phase = position % cycleLength;
  const cycle = Math.floor(position / cycleLength);
  if (pattern.direction === "random") {
    const entry = timeline[Math.floor(random() * timeline.length)];
    return {
      index: entry.index,
      span: Math.min(entry.span, cycleLength - phase),
      advance: Math.min(entry.slots, cycleLength - phase),
      cycle,
      trigger: true,
    };
  }
  const owner = (slot: number) => timeline.find((s) => slot >= s.index && slot < s.index + s.slots)!;
  const entry = owner(stepIndex(position, pattern.length, pattern.direction));
  const previous = position > 0
    ? owner(stepIndex(position - 1, pattern.length, pattern.direction))
    : undefined;
  return {
    index: entry.index,
    span: entry.span,
    advance: 1,
    cycle,
    trigger: previous?.index !== entry.index ||
      (phase === 0 && (pattern.direction !== "pingpong" || timeline.length === 1)),
  };
}
export type Project = {
  version: 2;
  name: string;
  tempo: number;
  swing: number;
  master: number;
  swingResolution: 8 | 16;
  masterFx: MasterFx;
  activePattern: number;
  tracks: Track[];
};
export const ENGINES: {
  id: Engine;
  label: string;
  short: string;
  description: string;
}[] = [
  {
    id: "subtractive",
    label: "Subtractive",
    short: "ANALOG",
    description:
      "Zwei Oszillatoren, Sub und Noise. Der klassische Weg zu warmen Bässen und lebendigen Leads.",
  },
  {
    id: "wavetable",
    label: "Wavetable",
    short: "TABLE",
    description:
      "32 Wavetables aus acht Familien mit Morphing, Phase-Warp und Formanten.",
  },
  {
    id: "fm",
    label: "FM",
    short: "FM",
    description:
      "Drei FM-Operatoren mit sechs Algorithmen, eigenen ADSRs, Fixed Hz und Feedback.",
  },
  {
    id: "additive",
    label: "Additive",
    short: "ADDITIVE",
    description: "Bis zu 32 einzeln gewichtete harmonische Teiltöne.",
  },
  {
    id: "ring",
    label: "Ring / AM",
    short: "RING / AM",
    description: "Amplitude- und Ringmodulation für inharmonische Texturen.",
  },
  {
    id: "granular",
    label: "Granular",
    short: "GRAIN",
    description:
      "Überlappende Sample-Grains mit einstellbarer Position, Dichte und Streuung.",
  },
  {
    id: "sampler",
    label: "Sampler",
    short: "SAMPLE",
    description:
      "Chromatisches Sampling mit Start- und Endpunkt, Root Note und Loop.",
  },
  {
    id: "physical",
    label: "Physical",
    short: "PHYSICAL",
    description:
      "Karplus-Strong-Saitenmodell mit einstellbarer Dämpfung und Anregung.",
  },
];
export const NOTES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const noteName = (note: number) =>
  `${NOTES[((Math.round(note) % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
export const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
export const clone = <T>(value: T): T => structuredClone(value);
export const makeStep = (): Step => ({
  on: false,
  note: 48,
  chord: "single",
  velocity: 0.8,
  gate: 0.65,
  span: 1,
  probability: 1,
  micro: 0,
  retrig: 1,
  condition: "always",
  locks: {},
});
export const makePattern = (): Pattern => ({
  swingMode: "global", swing: 0.12, swingResolution: 16,
  length: 16,
  division: 16,
  direction: "forward",
  steps: Array.from({ length: MAX_STEPS }, makeStep),
  notes: [],
  scale: { enabled: false, root: 0, name: "minor" },
});
export function makePatch(overrides: Partial<Patch> = {}): Patch {
  const numbers = Object.fromEntries(
    Object.entries(BASE_PARAMS).map(([key, range]) => [key, range[2]]),
  ) as Record<BaseParam,number>;
  const patch: Patch = {
    ...numbers,
    name: "Velvet circuit",
    engine: "subtractive",
    engineVersion: 2,
    modVersion: 2, fxVersion: 2, lfoVersion: 2,
    wave: "sawtooth",
    wave2: "triangle",
    filterType: "lowpass",
    filterVersion: 2,
    legacyPeakModulation: false,
    multimodeType: "lp4",
    combPolarity: "positive",
    voiceMode: "poly",
    legato: true,
    fxOrder: ["saturationMode", "modulationMode", "delayMode", "reverbMode"],
    fxEnabled: {
      saturationMode: false,
      modulationMode: false,
      delayMode: false,
      reverbMode: false,
    },
    fxSettings: defaultFxSettings(),
    sampleId: "sample-13-0",
    grainSampleId: "grain-2-0",
    fmAlgorithm: "serial",
    fmVersion: 2,
    excitation: "noise",
    saturationMode: "soft",
    modulationMode: "chorus",
    delayMode: "digital",
    reverbMode: "hall",
    lfos: [
      {
        shape: "sine",
        mode: "free",
        rate: 0.6,
        sync: false,
        division: 4,
        depth: 0.35,
      },
      {
        shape: "triangle",
        mode: "trig",
        rate: 2,
        sync: true,
        division: 2,
        depth: 0.25,
      },
      {
        shape: "sine",
        mode: "free",
        rate: 0.15,
        sync: false,
        division: 8,
        depth: 0.3,
      },
    ],
    mods: [{ source: "lfo1", target: "cutoff", amount: 0.2 }],
    sample: null,
    sampleName: "Built-in texture",
    sampleLoop: true,
    ...overrides,
  };
  if (overrides.fmVersion !== 2 && !FM_KEYS.some((key) => key in overrides) && LEGACY_FM_KEYS.some((key) => key in overrides)) migrateFmPatch(patch);
  if (overrides.filterPeakGain === undefined && patch.filterType === "multimode" && patch.multimodeType === "peak") patch.filterPeakGain = patch.resonance;
  if (overrides.pulseWidth2 === undefined && overrides.pulseWidth !== undefined) patch.pulseWidth2 = overrides.pulseWidth;
  return normalizeModulationPatch(Object.assign(patch, sampleSliceSelection(patch.sampleSlices, patch.sampleSlice)));
}
const makeLegacyPatch = (recipe: Partial<Patch> = {}) => makePatch({ ...recipe, engineVersion: 1, modVersion: 1, fxVersion: 1, ringBiasMode: 0, bowMode: 0 });
export const PRESETS: Patch[] = [
  makeLegacyPatch(),
  makeLegacyPatch({
    name: "Deep architecture",
    cutoff: 600,
    resonance: 4,
    sub: 0.45,
    filterAmount: 3.5,
    sustain: 0.25,
    decay: 0.2,
    release: 0.15,
    chorus: 0,
    reverb: 0.08,
  }),
  makeLegacyPatch({
    name: "Soft focus",
    engine: "wavetable",
    shape: 0.64,
    attack: 0.6,
    decay: 1.2,
    sustain: 0.8,
    release: 2.1,
    cutoff: 4200,
    filterAmount: 1,
    chorus: 0.5,
    reverb: 0.5,
    level: 0.45,
  }),
  makeLegacyPatch({
    name: "Glass mathematics",
    engine: "fm",
    wave: "sine",
    wave2: "sine",
    fmRatio: 3.5,
    fmIndex: 5.8,
    attack: 0.003,
    decay: 1.1,
    sustain: 0.05,
    release: 1.5,
    cutoff: 10000,
    delay: 0.28,
    reverb: 0.35,
  }),
  makeLegacyPatch({
    name: "Harmonic garden",
    engine: "additive",
    harmonics: 16,
    brightness: 0.7,
    attack: 0.15,
    release: 1.2,
    cutoff: 7500,
    chorus: 0.35,
    reverb: 0.35,
  }),
  makeLegacyPatch({
    name: "Satellite radio",
    engine: "ring",
    fmRatio: 1.41,
    fmIndex: 7,
    shape: 0.7,
    cutoff: 6200,
    filterAmount: 0.6,
    delay: 0.25,
    reverb: 0.3,
  }),
  makeLegacyPatch({
    name: "Slow particles",
    engine: "granular",
    grainSize: 0.18,
    grainDensity: 20,
    spread: 0.5,
    attack: 0.3,
    sustain: 0.8,
    release: 1.6,
    cutoff: 8500,
    reverb: 0.5,
  }),
  makeLegacyPatch({
    name: "Tape fragments",
    engine: "sampler",
    sampleRoot: 60,
    attack: 0.005,
    cutoff: 7000,
    filterAmount: 0.5,
    chorus: 0.25,
    reverb: 0.2,
  }),
  makeLegacyPatch({
    name: "Copper strings",
    engine: "physical",
    damping: 0.994,
    brightness: 0.75,
    attack: 0.002,
    sustain: 0.2,
    decay: 0.9,
    release: 1,
    cutoff: 9000,
    filterAmount: 0,
    reverb: 0.3,
  }),
  makeLegacyPatch({
    name: "Voltage kick",
    wave: "sine",
    wave2: "sine",
    cutoff: 1400,
    filterAmount: 0,
    sub: 0,
    mix: 0,
    noise: 0.02,
    attack: 0.002,
    decay: 0.14,
    sustain: 0,
    release: 0.08,
    delay: 0,
    reverb: 0.03,
    chorus: 0,
    level: 0.85,
    mods: [{ source: "filterEnv", target: "pitch", amount: 0.5 }],
    filterDecay: 0.045,
    filterSustain: 0,
  }),
  makeLegacyPatch({
    name: "Air / closed hat",
    wave: "sine",
    mix: 0,
    noise: 1,
    filterType: "highpass",
    cutoff: 6500,
    filterAmount: 0,
    sub: 0,
    attack: 0.002,
    decay: 0.035,
    sustain: 0,
    release: 0.02,
    chorus: 0,
    delay: 0.07,
    reverb: 0.08,
    level: 0.25,
  }),
  makeLegacyPatch({
    name: "Acid afterhours",
    wave: "sawtooth",
    cutoff: 500,
    resonance: 12,
    filterAmount: 4.8,
    filterDecay: 0.19,
    filterSustain: 0,
    drive: 0.45,
    distortion: 0.25,
    sub: 0.2,
    attack: 0.002,
    decay: 0.15,
    sustain: 0.15,
    release: 0.08,
    delay: 0.25,
    reverb: 0.1,
    chorus: 0,
  }),
  ...makeSoundBank(makeLegacyPatch),
  // Additional expansion sounds leave every existing preset and index intact.
  makePatch({ name: "Sync / copper teeth", engine: "subtractive", wave: "sawtooth", wave2: "square", syncAmount: .43, pulseWidth: .36, pulseWidth2: .64, mix: .8, subWave: 1, subOctave: -2, noiseColor: -.3, cutoff: 3400, filterAmount: 2, mods: [] }),
  makePatch({ name: "Prismatic folds", engine: "wavetable", wavetable: 8, wtWarpMode: 1, wtWarp: .4, wtSpread: .6, wtMorphSkew: -.25, wtBlur: .2, wtRandomPhase: 1, unison: 3, unisonDetune: 8, attack: .3, release: 1.8, cutoff: 7400, mods: [] }),
  makePatch({ name: "Eight-band glass", engine: "additive", harmonics: 32, addBand2: .5, addBand4: .35, addBand6: .65, addBand8: .3, addSpectralDecay: 1.2, addPartialDetune: 3, addPartialDrift: 2, addBlur: .25, addRandomPhase: 1, decay: 1.4, sustain: .2, release: 1.4, cutoff: 13000, mods: [] }),
  makePatch({ name: "Biased orbit", engine: "ring", wave: "sine", wave2: "sine", fmRatio: 1.5, ringBias: .18, ringPitchDepth: 12, ringPitchDecay: .3, ringEnvEnabled: 1, ringEnvDecay: .7, ringEnvSustain: .4, ringSidebandTilt: -.25, cutoff: 11000, decay: .9, sustain: .25, release: .7, mods: [] }),
  makePatch({ name: "Clocked aurora", engine: "granular", grainSampleId: "grain-2-0", grainWindowShape: 1, grainAttack: .04, grainRelease: .08, grainSync: 1, grainSyncDivision: 1, grainQuantize: 4, grainPitch: 12, grainSize: .2, grainStereoMotion: .65, grainMotionRate: .12, grainDrift: .25, attack: .3, release: 1.8, cutoff: 9000, mods: [] }),
  makePatch({ name: "Stretched tape slice", engine: "sampler", sampleId: "sample-13-0", sampleRoot: 60, samplePlayback: 3, sampleLoop: true, sampleLoopCrossfade: .04, sampleStretchMode: 1, sampleStretch: 1.7, samplePingPong: 1, sampleSlices: 4, sampleSlice: 1, attack: .04, release: .6, cutoff: 9000, mods: [] }),
  makePatch({ name: "Coupled bow chamber", engine: "physical", excitation: "bow", bowPressure: .55, bowSpeed: .35, stringCoupling: .35, stringStiffness: .16, pickupPosition: .28, bodyFrequency: 360, bodyQ: 2.8, pickHardness: .35, damping: .998, attack: .1, sustain: .8, release: 1.1, cutoff: 7200, mods: [] }),
];
export function makeProject(): Project {
  const patches = [
    PRESETS[0],
    PRESETS[9],
    PRESETS[10],
    PRESETS[3],
    PRESETS[1],
    PRESETS[2],
    PRESETS[4],
    PRESETS[5],
    PRESETS[6],
    PRESETS[7],
    PRESETS[8],
    PRESETS[11],
  ];
  const tracks = patches.map(
    (patch, i): Track => ({
      id: i,
      name: [
        "Velvet circuit",
        "Voltage kick",
        "Air / closed hat",
        "Glass mathematics",
        PRESETS[1].name,
        PRESETS[2].name,
        PRESETS[4].name,
        PRESETS[5].name,
        PRESETS[6].name,
        PRESETS[7].name,
        PRESETS[8].name,
        PRESETS[11].name,
      ][i],
      color: [
        "#e5ac86",
        "#aabf9b",
        "#b0a3cf",
        "#8cb8bd",
        "#d4c18a",
        "#d58d9a",
        "#89afd9",
        "#b9c782",
        "#bb9fd5",
        "#83c4b0",
        "#d6a26f",
        "#99a1e0",
      ][i],
      patch: clone(patch),
      mute: false,
      solo: false,
      mode: "step",
      patterns: Array.from({ length: 8 }, makePattern),
    }),
  );
  [
    [0, 3, 6, 8, 10, 14],
    [0, 4, 8, 12],
    [2, 6, 10, 14],
    [0, 7, 12],
  ].forEach((steps, t) =>
    steps.forEach((s, i) => {
      tracks[t].patterns[0].steps[s] = {
        ...makeStep(),
        on: true,
        note:
          t === 0
            ? [48, 55, 58, 60, 55, 51][i]
            : t === 1
              ? 36
              : t === 2
                ? 72
                : [72, 79, 75][i],
        velocity: t === 2 ? 0.55 : 0.8,
        gate: t === 3 ? 1.5 : 0.6,
      };
    }),
  );
  return {
    version: 2,
    name: "Midnight circuit",
    tempo: 118,
    swing: 0.12,
    swingResolution: 16,
    master: 0.7,
    masterFx: makeMasterFx(),
    activePattern: 0,
    tracks,
  };
}
export function shouldTrigger(
  step: Step,
  cycle: number,
  fill: boolean,
  random = Math.random,
): boolean {
  if (!step.on || random() >= step.probability) return false;
  if (step.condition === "fill") return fill;
  if (step.condition === "!fill") return !fill;
  if (step.condition === "always") return true;
  const [a, b] = step.condition.split(":").map(Number);
  return cycle % b === a - 1;
}
export function stepIndex(
  index: number,
  length: number,
  direction: Pattern["direction"],
  random = Math.random,
): number {
  if (direction === "random") return Math.floor(random() * length);
  if (direction === "reverse") return length - 1 - (index % length);
  if (direction === "pingpong") {
    const x = index % Math.max(1, length * 2 - 2);
    return x < length ? x : length * 2 - 2 - x;
  }
  return index % length;
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
const waves: Wave[] = ["sine", "sawtooth", "triangle", "square"];
export function sanitizePatch(value: unknown): Patch {
  if (!isRecord(value)) throw new Error("Ungültiges Preset.");
  value = migrateLfoPatch(value);
  if (!isRecord(value)) throw new Error("Ungültiges Preset.");
  const p = makePatch();
  for (const key of Object.keys(BASE_PARAMS) as BaseParam[])
    p[key] = num(value[key], PARAMS[key][0], PARAMS[key][1], p[key]);
  p.modVersion = value.modVersion === 2 ? 2 : 1;
  p.fxVersion = value.fxVersion === 2 ? 2 : 1;
  p.engineVersion = value.engineVersion === 2 ? 2 : 1;
  if (value.pulseWidth2 === undefined) p.pulseWidth2 = p.pulseWidth;
  if (value.ringBiasMode === undefined) p.ringBiasMode = 0;
  if (value.bowMode === undefined) p.bowMode = 0;
  p.filterVersion = value.filterVersion === 1 ? 1 : value.filterVersion === 2 || FILTER_KEYS.some((key) => key in value) ? 2 : 1;
  p.legacyPeakModulation = value.legacyPeakModulation === true;
  p.name =
    typeof value.name === "string" ? value.name.slice(0, 80) : "Imported patch";
  if (ENGINES.some((e) => e.id === value.engine))
    p.engine = value.engine as Engine;
  if (["mono", "para", "poly"].includes(String(value.voiceMode)))
    p.voiceMode = value.voiceMode as Patch["voiceMode"];
  p.legato = value.legato !== false;
  p.unison = Math.round(p.unison);
  p.wavetable = Math.round(p.wavetable);
  const slots = Object.keys(FX_OPTIONS) as FxSlot[];
  if (
    Array.isArray(value.fxOrder) &&
    value.fxOrder.length === 4 &&
    new Set(value.fxOrder).size === 4 &&
    value.fxOrder.every((k) => slots.includes(k as FxSlot))
  )
    p.fxOrder = [...value.fxOrder] as FxSlot[];
  if (isRecord(value.fxEnabled))
    for (const slot of slots)
      if (typeof value.fxEnabled[slot] === "boolean")
        p.fxEnabled[slot] = value.fxEnabled[slot];
  if (isRecord(value.fxSettings))
    for (const [id, controls] of Object.entries(FX_CONTROLS)) {
      const settings = value.fxSettings[id];
      if (isRecord(settings))
        for (const control of controls)
          if (!control.param)
            p.fxSettings[id][control.key] = num(
              settings[control.key],
              control.min,
              control.max,
              control.default,
            );
    }
  if(value.fxVersion===undefined&&isRecord(value.fxSettings))for(const [id,settings] of Object.entries(value.fxSettings))if(isRecord(settings)&&LEGACY_FX_KEYS[id]&&Object.keys(settings).some(key=>!LEGACY_FX_KEYS[id].has(key)))p.fxVersion=2;
  if(["saturationOutputTrim","reverbLowCut","reverbHighCut","reverbWidth"].some(key=>key in value))p.fxVersion=value.fxVersion===1?1:2;
  for(const [id,controls] of Object.entries(FX_CONTROLS))for(const c of controls)if(c.options&&!c.param){const v=p.fxSettings[id][c.key];p.fxSettings[id][c.key]=c.options.reduce((best,o)=>Math.abs(o.value-v)<Math.abs(best-v)?o.value:best,c.options[0].value);}
  if (
    typeof value.sampleId === "string" &&
    /^sample-(?:[0-9]|1[0-5])-[0-3]$/.test(value.sampleId)
  )
    p.sampleId = value.sampleId;
  if (
    typeof value.grainSampleId === "string" &&
    /^grain-[0-7]-[0-3]$/.test(value.grainSampleId)
  )
    p.grainSampleId = value.grainSampleId;
  if (FM_ALGORITHMS.some((a) => a.id === value.fmAlgorithm))
    p.fmAlgorithm = value.fmAlgorithm as Patch["fmAlgorithm"];
  if (["noise", "pick", "bow"].includes(String(value.excitation)))
    p.excitation = value.excitation as Patch["excitation"];
  for (const slot of Object.keys(FX_OPTIONS) as FxSlot[]) {
    const option = FX_OPTIONS[slot].find((item) => item.id === value[slot]);
    if (option) Object.assign(p, { [slot]: option.id });
  }
  for (const key of ["wave", "wave2"] as const)
    if (waves.includes(value[key] as Wave)) p[key] = value[key] as Wave;
  if (
    ["lowpass", "highpass", "bandpass", "notch", "multimode", "comb"].includes(
      String(value.filterType),
    )
  )
    p.filterType = value.filterType as FilterType;
  if (MULTIMODE_FILTERS.some((mode) => mode.id === value.multimodeType))
    p.multimodeType = value.multimodeType as MultimodeFilter;
  if (["positive", "negative"].includes(String(value.combPolarity)))
    p.combPolarity = value.combPolarity as Patch["combPolarity"];
  p.sample =
    typeof value.sample === "string" &&
    value.sample.startsWith("data:audio/") &&
    value.sample.length < 30_000_000
      ? value.sample
      : null;
  p.sampleName =
    typeof value.sampleName === "string"
      ? value.sampleName.slice(0, 100)
      : p.sampleName;
  p.sampleLoop = value.sampleLoop !== false;
  if (Array.isArray(value.lfos))
    p.lfos = p.lfos.map((l, i) => {
      const x = value.lfos as unknown[];
      const v = x[i];
      if (!isRecord(v)) return l;
      return {
        shape: (LFO_SHAPES as readonly string[]).includes(String(v.shape))
          ? (v.shape as LfoShape)
          : l.shape,
        mode: (LFO_MODES as readonly string[]).includes(String(v.mode))
          ? (v.mode as LfoMode)
          : "free",
        legacyTriggerMod:v.legacyTriggerMod===true,
        randomRepeat:Math.round(num(v.randomRepeat,0,1,0)),
        rate: num(v.rate, 0.02, 30, l.rate),
        sync: v.sync === true,
        division: num(v.division, 1/24, 16, 4),
        depth: num(v.depth, -1, 1, 0.3),
        phase:num(v.phase,0,360,0),delay:num(v.delay,0,8,0),fade:num(v.fade,0,8,0),fadeOut:num(v.fadeOut,0,8,0),skew:num(v.skew,-.95,.95,0),slew:num(v.slew,0,1,0),pulseWidth:num(v.pulseWidth,.01,.99,.5),polarity:Math.round(num(v.polarity,0,1,0)),
      };
    }) as [Lfo, Lfo, Lfo];
  if (Array.isArray(value.mods))
    p.mods = value.mods
      .slice(0, 24)
      .filter(isRecord)
      .filter(
        (m) =>
          Object.keys(MOD_SOURCES).includes(String(m.source)) &&
          typeof m.target === "string" && Object.hasOwn(MOD_TARGETS, m.target),
      )
      .map((m) => ({
        source: m.source as ModSource,
        target: m.target as ModTarget,
        amount: num(m.amount, -1, 1, 0),
        curve: ["exponential","logarithmic"].includes(String(m.curve)) ? m.curve as "exponential"|"logarithmic" : "linear",
      }));
  // Old partial v2 imports also retain the former zero OP-3 indices. New
  // patches get musical defaults; serialized presets always carry their values.
  if (value.fmVersion === 2) {
    if (value.fmIndex32 === undefined) p.fmIndex32 = 0;
    if (value.fmIndex31 === undefined) p.fmIndex31 = 0;
  }
  if (value.fmVersion !== 2 && !FM_KEYS.some((key) => key in value)) migrateFmPatch(p);
  for (const key of Object.keys(FM_PARAMS) as (keyof typeof FM_PARAMS)[]) if (/(?:Wave|Mode)$/.test(key)) p[key] = Math.round(p[key]);
  for (const key of ENGINE_DISCRETE) p[key] = Math.round(p[key]);
  if (p.engineVersion === 1 && ENGINE_KEYS.some((key) => key in value) && value.engineVersion === undefined) p.engineVersion = 2;
  for (const key of FILTER_DISCRETE) p[key] = Math.round(p[key]);
  if (value.filterPeakGain === undefined && p.filterType === "multimode" && p.multimodeType === "peak") {
    p.filterPeakGain = p.resonance;
    p.legacyPeakModulation = true;
    p.mods = p.mods.map((m) => m.target === "resonance" ? { ...m, target: "filterPeakGain", amount: m.amount * 20 / 48 } : m);
  }
  return normalizeModulationPatch(Object.assign(p, sampleSliceSelection(p.sampleSlices, p.sampleSlice),Object.fromEntries(Object.entries(value).filter(([id,v])=>Object.hasOwn(DYNAMIC_META,id)&&typeof v==="number"&&Number.isFinite(v)))));
}
function sanitizeLockNumber(key: Param, value: unknown) {
  const result = num(value, PARAMS[key][0], PARAMS[key][1], PARAMS[key][2]);
  const options=DYNAMIC_META[key as DynamicParam]?.options;
  if(options)return options.reduce((best,o)=>Math.abs(o.value-result)<Math.abs(best-result)?o.value:best,options[0].value);
  return /^fm[123](Wave|Mode)$/.test(key) || (FILTER_DISCRETE as readonly string[]).includes(key) || (ENGINE_DISCRETE as readonly string[]).includes(key) ? Math.round(result) : result;
}
function sanitizeSteps(value: unknown, legacyLfos?:unknown): Step[] {
  if (!Array.isArray(value)) return Array.from({ length: MAX_STEPS }, makeStep);
  return Array.from({ length: MAX_STEPS }, makeStep).map((s, k) => {
    const q = value[k];
    if (!isRecord(q)) return s;
    s.on = q.on === true;
    s.note = Math.round(num(q.note, 0, 127, 48));
    s.velocity = num(q.velocity, 0.01, 1, 0.8);
    s.gate = num(q.gate, 0.05, 4, 0.65);
    s.span = STEP_SPANS.includes(Number(q.span)) ? Number(q.span) : 1;
    s.probability = num(q.probability, 0, 1, 1);
    s.micro = num(q.micro, -0.45, 0.45, 0);
    s.retrig = Math.round(num(q.retrig, 1, 8, 1));
    if (typeof q.chord === "string" && Object.hasOwn(CHORDS, q.chord))
      s.chord = q.chord as Step["chord"];
    if (
      ["always", "1:2", "2:2", "1:4", "fill", "!fill"].includes(
        String(q.condition),
      )
    )
      s.condition = q.condition as Condition;
    const stepLocks = migrateLfoLocks(q.locks,legacyLfos);
    if (isRecord(stepLocks))
      for (const key of Object.keys(stepLocks) as Param[])
        if (LOCK_PARAMS.includes(key))
          s.locks[key] = sanitizeLockNumber(key, stepLocks[key]);
    return s;
  });
}
function sanitizeNotes(value: unknown, legacyLfos?:unknown): PianoNote[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 4096) throw new Error("Maximal 4096 Piano-Roll-Noten pro Pattern.");
  const ids = new Set<string>();
  return value.filter(isRecord).map((n, k) => {
    let id = typeof n.id === "string" ? n.id.slice(0, 100) : `import-${k}`;
    while (ids.has(id)) id += `-${k}`;
    ids.add(id);
    const locks: Partial<Numbers> = {};
    const noteLocks = migrateLfoLocks(n.locks,legacyLfos);
    if (isRecord(noteLocks)) for (const key of LOCK_PARAMS)
      if (key in noteLocks) locks[key] = sanitizeLockNumber(key, noteLocks[key]);
    return {
      id,
      start: num(n.start, 0, MAX_STEPS - .001, 0),
      duration: num(n.duration, 0.001, 256, 1),
      note: Math.round(num(n.note, 0, 127, 60)),
      velocity: num(n.velocity, 0.01, 1, 0.8),
      probability: num(n.probability, 0, 1, 1),
      condition: ["always", "1:2", "2:2", "1:4", "fill", "!fill"].includes(String(n.condition)) ? n.condition as Condition : "always",
      micro: num(n.micro, -3.6, 3.6, 0),
      locks,
      ...(typeof n.group === "string" ? { group: n.group.slice(0, 100) } : {}),
    };
  });
}
export function normalizeTrackSampleLocks(track: Track, previous?: Track): Track {
  const selection = sampleSliceSelection(track.patch.sampleSlices, track.patch.sampleSlice);
  const patch = track.patch.sampleSlices === selection.sampleSlices && track.patch.sampleSlice === selection.sampleSlice
    ? track.patch : { ...track.patch, ...selection };
  const normalize = <T extends { locks: Partial<Numbers> }>(items: T[]): T[] => {
    const next = items.map((item) => {
      const locks = normalizeSampleLocks(item.locks, patch);
      return locks === item.locks ? item : { ...item, locks };
    });
    return next.every((item, i) => item === items[i]) ? items : next;
  };
  const patterns = track.patterns.map((pattern, i) => {
    if (patch.sampleSlices === previous?.patch.sampleSlices && pattern === previous?.patterns[i]) return pattern;
    const steps = normalize(pattern.steps), notes = normalize(pattern.notes);
    const saved = pattern.pianoBackup;
    const savedSteps = saved ? normalize(saved.steps) : undefined, savedNotes = saved ? normalize(saved.notes) : undefined;
    if (steps === pattern.steps && notes === pattern.notes && savedSteps === saved?.steps && savedNotes === saved?.notes) return pattern;
    return { ...pattern, steps, notes, ...(saved ? { pianoBackup: { ...saved, steps: savedSteps!, notes: savedNotes! } } : {}) };
  });
  return patch === track.patch && patterns.every((pattern, i) => pattern === track.patterns[i])
    ? track : { ...track, patch, patterns };
}
export function sanitizeProject(value: unknown): Project {
  if (
    !isRecord(value) ||
    ![1, 2].includes(Number(value.version)) ||
    !Array.isArray(value.tracks) ||
    ![4, 8, TRACK_COUNT].includes(value.tracks.length)
  )
    throw new Error(
      "Keine gültige PHASE-Projektdatei (Version 1/2, vier, acht oder zwölf Tracks).",
    );
  const p = makeProject();
  p.name = typeof value.name === "string" ? value.name.slice(0, 80) : p.name;
  p.tempo = num(value.tempo, 40, 240, 118);
  p.swing = num(value.swing, 0, 1, 0);
  p.swingResolution = value.swingResolution === 8 ? 8 : 16;
  p.master = num(value.master, 0, 1, 0.7);
  if (isRecord(value.masterFx)) {
    const m = value.masterFx;
    for (const key of [
      "enabled",
      "driveEnabled",
      "eqEnabled",
      "compressorEnabled",
      "delayEnabled",
      "reverbEnabled",
    ] as const)
      if (typeof m[key] === "boolean") p.masterFx[key] = m[key];
    const ranges = {
      driveMode: [0, 7],
      drive: [0, 1],
      bias: [-0.5, 0.5],
      tone: [500, 20000],
      lowCut: [20, 1000],
      mix: [0, 1],
      output: [-18, 6],
      threshold: [-60, 0],
      ratio: [1, 12],
      attack: [0.001, 0.1],
      release: [0.02, 1],
      makeup: [-6, 12],
      width: [0, 2],
      delay: [0, 1],
      delayTime: [0.04, 1.5],
      feedback: [0, 0.85],
      reverb: [0, 1],
      reverbSize: [0.2, 5],
    };
    for (const [key, range] of Object.entries(ranges))
      Object.assign(p.masterFx, {
        [key]: num(
          m[key],
          range[0],
          range[1],
          p.masterFx[key as keyof MasterFx] as number,
        ),
      });
    p.masterFx.driveMode = Math.round(p.masterFx.driveMode);
    if ([2, 3, 8].includes(Number(m.eqBands)))
      p.masterFx.eqBands = Number(m.eqBands) as 2 | 3 | 8;
    for (const key of ["eq2", "eq3", "eq8"] as const)
      if (Array.isArray(m[key]))
        p.masterFx[key] = p.masterFx[key].map((v, i) =>
          num((m[key] as unknown[])[i], -18, 18, v),
        );
  }
  p.activePattern = Math.round(num(value.activePattern, 0, 7, 0));
  p.tracks = p.tracks.map((base, i) => {
    const v = (value.tracks as unknown[])[i];
    if (v === undefined && i >= 4) return base;
    if (!isRecord(v)) throw new Error("Ungültiger Track.");
    base.patch = sanitizePatch(v.patch);
    base.name =
      typeof v.name === "string" ? v.name.slice(0, 80) : base.patch.name;
    base.mute = v.mute === true;
    base.solo = v.solo === true;
    base.mode = v.mode === "piano" ? "piano" : "step";
    if (Array.isArray(v.patterns))
      base.patterns = base.patterns.map((pat, j) => {
        const item = (v.patterns as unknown[])[j];
        if (!isRecord(item)) return pat;
        pat.swingMode = item.swingMode === "custom" || item.swingMode === "off" ? item.swingMode : "global";
        pat.swing = num(item.swing, 0, 1, p.swing);
        pat.swingResolution = item.swingResolution === 8 ? 8 : 16;
        pat.length = Math.round(num(item.length, 1, MAX_STEPS, 16));
        pat.division = [8, 16, 32].includes(Number(item.division))
          ? Number(item.division)
          : 16;
        if (
          ["forward", "reverse", "pingpong", "random"].includes(
            String(item.direction),
          )
        )
          pat.direction = item.direction as Pattern["direction"];
        const legacyLfos=isRecord(v.patch)&&v.patch.lfoVersion!==2?v.patch.lfos:undefined;
        pat.steps = sanitizeSteps(item.steps,legacyLfos);
        pat.notes = sanitizeNotes(item.notes,legacyLfos);
        if (isRecord(item.scale)) pat.scale = {
          enabled: item.scale.enabled === true,
          root: Math.round(num(item.scale.root, 0, 11, 0)),
          name: typeof item.scale.name === "string" && Object.hasOwn(SCALES, item.scale.name) ? item.scale.name as ScaleConfig["name"] : "minor",
        };
        if (isRecord(item.pianoPlayback)) {
          const start = Math.round(num(item.pianoPlayback.start, 0, pat.length - 1, 0));
          pat.pianoPlayback = { start, end: Math.round(num(item.pianoPlayback.end, start + 1, pat.length, pat.length)), loop: item.pianoPlayback.loop !== false };
        }
        if (isRecord(item.pianoBackup)) {
          const saved = item.pianoBackup;
          pat.pianoBackup = {
            swingMode:saved.swingMode === "custom" || saved.swingMode === "off" || saved.swingMode === "global"?saved.swingMode:pat.swingMode,
            swing:num(saved.swing,0,1,pat.swing),swingResolution:saved.swingResolution === 8?8:saved.swingResolution === 16?16:pat.swingResolution,
            notes: sanitizeNotes(saved.notes,legacyLfos), steps: sanitizeSteps(saved.steps,legacyLfos),
            length: Math.round(num(saved.length, 1, MAX_STEPS, pat.length)),
            division: [8, 16, 32].includes(Number(saved.division)) ? Number(saved.division) : pat.division,
            direction: ["forward", "reverse", "pingpong", "random"].includes(String(saved.direction)) ? saved.direction as Pattern["direction"] : pat.direction,
          };
        }
        if (base.patch.engine === "fm") {
          const migrateSteps = (steps: Step[]) => steps.map((s) => ({ ...s, locks: migrateFmLocks(s.locks, base.patch) }));
          const migrateNotes = (notes: PianoNote[]) => notes.map((n) => ({ ...n, locks: migrateFmLocks(n.locks, base.patch) }));
          pat.steps = migrateSteps(pat.steps); pat.notes = migrateNotes(pat.notes);
          if (pat.pianoBackup) { pat.pianoBackup.steps = migrateSteps(pat.pianoBackup.steps); pat.pianoBackup.notes = migrateNotes(pat.pianoBackup.notes); }
        }
        if (isRecord(v.patch) && v.patch.filterPeakGain === undefined && base.patch.filterType === "multimode" && base.patch.multimodeType === "peak") {
          const migrate = <T extends { locks: Partial<Numbers> }>(items: T[]) => items.map((item) => {
            const locks = { ...item.locks };
            if (locks.resonance !== undefined) { locks.filterPeakGain = locks.resonance; delete locks.resonance; }
            return { ...item, locks };
          });
          pat.steps = migrate(pat.steps); pat.notes = migrate(pat.notes);
          if (pat.pianoBackup) { pat.pianoBackup.steps = migrate(pat.pianoBackup.steps); pat.pianoBackup.notes = migrate(pat.pianoBackup.notes); }
        }
        return pat;
      });
    return normalizeTrackSampleLocks(base);
  });
  return p;
}
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels,
    length = buffer.length * channels * 2,
    array = new ArrayBuffer(44 + length),
    view = new DataView(array);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length, true);
  const data = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c),
  );
  let offset = 44;
  for (let i = 0; i < buffer.length; i++)
    for (let c = 0; c < channels; c++) {
      const v = clamp(data[c][i], -1, 1);
      view.setInt16(offset, v < 0 ? v * 32768 : v * 32767, true);
      offset += 2;
    }
  return new Blob([array], { type: "audio/wav" });
}
