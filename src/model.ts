export const TRACK_COUNT = 8;
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
export type Envelope = {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
};
export type Lfo = {
  shape: Wave;
  rate: number;
  sync: boolean;
  division: number;
  depth: number;
  retrigger: boolean;
};
export type ModSource =
  | "lfo1"
  | "lfo2"
  | "lfo3"
  | "velocity"
  | "keytrack"
  | "modwheel"
  | "filterEnv";
export type ModTarget = "cutoff" | "pitch" | "amplitude" | "pan" | "fmIndex";
export type Modulation = {
  source: ModSource;
  target: ModTarget;
  amount: number;
};
export const PARAMS = {
  tune: [-24, 24, 0],
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
} as const;
export type Param = keyof typeof PARAMS;
// These values are AudioNode topology/buffer changes rather than schedulable AudioParams.
export const LOCK_PARAMS: Param[] = (Object.keys(PARAMS) as Param[]).filter(
  (key) => key !== "distortion" && key !== "reverbSize",
);
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
export type Patch = Numbers &
  FxSelection & {
    name: string;
    engine: Engine;
    wave: Wave;
    wave2: Wave;
    filterType: BiquadFilterType;
    voiceMode: "mono" | "para" | "poly";
    legato: boolean;
    lfos: [Lfo, Lfo, Lfo];
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
export type Pattern = {
  length: number;
  division: number;
  direction: "forward" | "reverse" | "pingpong" | "random";
  steps: Step[];
};
export type Track = {
  id: number;
  name: string;
  color: string;
  patch: Patch;
  mute: boolean;
  solo: boolean;
  patterns: Pattern[];
};
export type Project = {
  version: 1;
  name: string;
  tempo: number;
  swing: number;
  master: number;
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
    description: "Stufenloses spektrales Morphing zwischen vier Wellenformen.",
  },
  {
    id: "fm",
    label: "FM",
    short: "FM",
    description:
      "Frequenzmodulation mit zwei Operatoren. Von glockig bis metallisch.",
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
  probability: 1,
  micro: 0,
  retrig: 1,
  condition: "always",
  locks: {},
});
export const makePattern = (): Pattern => ({
  length: 16,
  division: 16,
  direction: "forward",
  steps: Array.from({ length: 64 }, makeStep),
});
export function makePatch(overrides: Partial<Patch> = {}): Patch {
  const numbers = Object.fromEntries(
    Object.entries(PARAMS).map(([key, range]) => [key, range[2]]),
  ) as Numbers;
  return {
    ...numbers,
    name: "Velvet circuit",
    engine: "subtractive",
    wave: "sawtooth",
    wave2: "triangle",
    filterType: "lowpass",
    voiceMode: "poly",
    legato: true,
    saturationMode: "soft",
    modulationMode: "chorus",
    delayMode: "digital",
    reverbMode: "hall",
    lfos: [
      {
        shape: "sine",
        rate: 0.6,
        sync: false,
        division: 4,
        depth: 0.35,
        retrigger: false,
      },
      {
        shape: "triangle",
        rate: 2,
        sync: true,
        division: 2,
        depth: 0.25,
        retrigger: true,
      },
      {
        shape: "sine",
        rate: 0.15,
        sync: false,
        division: 8,
        depth: 0.3,
        retrigger: false,
      },
    ],
    mods: [{ source: "lfo1", target: "cutoff", amount: 0.2 }],
    sample: null,
    sampleName: "Built-in texture",
    sampleLoop: true,
    ...overrides,
  };
}
export const PRESETS: Patch[] = [
  makePatch(),
  makePatch({
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
  makePatch({
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
  makePatch({
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
  makePatch({
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
  makePatch({
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
  makePatch({
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
  makePatch({
    name: "Tape fragments",
    engine: "sampler",
    sampleRoot: 60,
    attack: 0.005,
    cutoff: 7000,
    filterAmount: 0.5,
    chorus: 0.25,
    reverb: 0.2,
  }),
  makePatch({
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
  makePatch({
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
  makePatch({
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
  makePatch({
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
      ][i],
      patch: clone(patch),
      mute: false,
      solo: false,
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
    version: 1,
    name: "Midnight circuit",
    tempo: 118,
    swing: 0.12,
    master: 0.7,
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
  const p = makePatch();
  for (const key of Object.keys(PARAMS) as Param[])
    p[key] = num(value[key], PARAMS[key][0], PARAMS[key][1], p[key]);
  p.name =
    typeof value.name === "string" ? value.name.slice(0, 80) : "Imported patch";
  if (ENGINES.some((e) => e.id === value.engine))
    p.engine = value.engine as Engine;
  if (["mono", "para", "poly"].includes(String(value.voiceMode)))
    p.voiceMode = value.voiceMode as Patch["voiceMode"];
  p.legato = value.legato !== false;
  for (const slot of Object.keys(FX_OPTIONS) as FxSlot[]) {
    const option = FX_OPTIONS[slot].find((item) => item.id === value[slot]);
    if (option) Object.assign(p, { [slot]: option.id });
  }
  for (const key of ["wave", "wave2"] as const)
    if (waves.includes(value[key] as Wave)) p[key] = value[key] as Wave;
  if (
    ["lowpass", "highpass", "bandpass", "notch"].includes(
      String(value.filterType),
    )
  )
    p.filterType = value.filterType as BiquadFilterType;
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
        shape: waves.includes(v.shape as Wave) ? (v.shape as Wave) : l.shape,
        rate: num(v.rate, 0.02, 30, l.rate),
        sync: v.sync === true,
        division: num(v.division, 0.25, 16, 4),
        depth: num(v.depth, 0, 1, 0.3),
        retrigger: v.retrigger === true,
      };
    }) as [Lfo, Lfo, Lfo];
  if (Array.isArray(value.mods))
    p.mods = value.mods
      .slice(0, 8)
      .filter(isRecord)
      .filter(
        (m) =>
          [
            "lfo1",
            "lfo2",
            "lfo3",
            "velocity",
            "keytrack",
            "modwheel",
            "filterEnv",
          ].includes(String(m.source)) &&
          ["cutoff", "pitch", "amplitude", "pan", "fmIndex"].includes(
            String(m.target),
          ),
      )
      .map((m) => ({
        source: m.source as ModSource,
        target: m.target as ModTarget,
        amount: num(m.amount, -1, 1, 0),
      }));
  return p;
}
export function sanitizeProject(value: unknown): Project {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.tracks) ||
    ![4, TRACK_COUNT].includes(value.tracks.length)
  )
    throw new Error(
      "Keine gültige PHASE-Projektdatei (Version 1, vier oder acht Tracks).",
    );
  const p = makeProject();
  p.name = typeof value.name === "string" ? value.name.slice(0, 80) : p.name;
  p.tempo = num(value.tempo, 40, 240, 118);
  p.swing = num(value.swing, 0, 0.6, 0);
  p.master = num(value.master, 0, 1, 0.7);
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
    if (Array.isArray(v.patterns))
      base.patterns = base.patterns.map((pat, j) => {
        const item = (v.patterns as unknown[])[j];
        if (!isRecord(item)) return pat;
        pat.length = Math.round(num(item.length, 1, 64, 16));
        pat.division = [8, 16, 32].includes(Number(item.division))
          ? Number(item.division)
          : 16;
        if (
          ["forward", "reverse", "pingpong", "random"].includes(
            String(item.direction),
          )
        )
          pat.direction = item.direction as Pattern["direction"];
        if (Array.isArray(item.steps))
          pat.steps = pat.steps.map((s, k) => {
            const q = (item.steps as unknown[])[k];
            if (!isRecord(q)) return s;
            s.on = q.on === true;
            s.note = Math.round(num(q.note, 24, 96, 48));
            s.velocity = num(q.velocity, 0.01, 1, 0.8);
            s.gate = num(q.gate, 0.05, 4, 0.65);
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
            if (isRecord(q.locks))
              for (const key of Object.keys(q.locks) as Param[])
                if (LOCK_PARAMS.includes(key))
                  s.locks[key] = num(
                    q.locks[key],
                    PARAMS[key][0],
                    PARAMS[key][1],
                    PARAMS[key][2],
                  );
            return s;
          });
        return pat;
      });
    return base;
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
