import type { ModTarget, Numbers, Param, Patch } from "./model";

export const FM_WAVES = ["sine", "triangle", "sawtooth", "square"] as const;
export const FM_OPERATORS = [1, 2, 3] as const;
export type FmOperator = typeof FM_OPERATORS[number];
export const FM_PARAMS = {
  fm1Wave: [0, 3, 0],
  fm1Mode: [0, 1, 0],
  fm1Ratio: [0.125, 32, 1],
  fm1Hz: [0.1, 16000, 440],
  fm1Fine: [-100, 100, 0],
  fm1Level: [0, 1, 1],
  fm1Feedback: [0, 1, 0],
  fm1Attack: [0, 8, 0.002],
  fm1Decay: [0.001, 8, 0.4],
  fm1Sustain: [0, 1, 1],
  fm1Release: [0.001, 8, 0.5],
  fm1AttackCurve: [-12, 12, 0],
  fm1DecayCurve: [-12, 12, 0],
  fm1ReleaseCurve: [-12, 12, 0],
  fm2Wave: [0, 3, 0],
  fm2Mode: [0, 1, 0],
  fm2Ratio: [0.125, 32, 2],
  fm2Hz: [0.1, 16000, 440],
  fm2Fine: [-100, 100, 0],
  fm2Level: [0, 1, 1],
  fm2Feedback: [0, 1, 0],
  fm2Attack: [0, 8, 0.002],
  fm2Decay: [0.001, 8, 0.4],
  fm2Sustain: [0, 1, 0.4],
  fm2Release: [0.001, 8, 0.5],
  fm2AttackCurve: [-12, 12, 0],
  fm2DecayCurve: [-12, 12, 0],
  fm2ReleaseCurve: [-12, 12, 0],
  fm3Wave: [0, 3, 0],
  fm3Mode: [0, 1, 0],
  fm3Ratio: [0.125, 32, 3],
  fm3Hz: [0.1, 16000, 440],
  fm3Fine: [-100, 100, 0],
  fm3Level: [0, 1, 1],
  fm3Feedback: [0, 1, 0],
  fm3Attack: [0, 8, 0.002],
  fm3Decay: [0.001, 8, 0.4],
  fm3Sustain: [0, 1, 1],
  fm3Release: [0.001, 8, 0.5],
  fm3AttackCurve: [-12, 12, 0],
  fm3DecayCurve: [-12, 12, 0],
  fm3ReleaseCurve: [-12, 12, 0],
  fmIndex21: [0, 80, 1.5],
  fmIndex32: [0, 80, 0],
  fmIndex31: [0, 80, 0],
} as const;
export type FmParam = keyof typeof FM_PARAMS;
export const FM_KEYS = Object.keys(FM_PARAMS) as FmParam[];
export const FM_OP_KEYS = {
  1: {wave: "fm1Wave", mode: "fm1Mode", ratio: "fm1Ratio", hz: "fm1Hz", fine: "fm1Fine", level: "fm1Level", feedback: "fm1Feedback", attack: "fm1Attack", decay: "fm1Decay", sustain: "fm1Sustain", release: "fm1Release", attackCurve: "fm1AttackCurve", decayCurve: "fm1DecayCurve", releaseCurve: "fm1ReleaseCurve"},
  2: {wave: "fm2Wave", mode: "fm2Mode", ratio: "fm2Ratio", hz: "fm2Hz", fine: "fm2Fine", level: "fm2Level", feedback: "fm2Feedback", attack: "fm2Attack", decay: "fm2Decay", sustain: "fm2Sustain", release: "fm2Release", attackCurve: "fm2AttackCurve", decayCurve: "fm2DecayCurve", releaseCurve: "fm2ReleaseCurve"},
  3: {wave: "fm3Wave", mode: "fm3Mode", ratio: "fm3Ratio", hz: "fm3Hz", fine: "fm3Fine", level: "fm3Level", feedback: "fm3Feedback", attack: "fm3Attack", decay: "fm3Decay", sustain: "fm3Sustain", release: "fm3Release", attackCurve: "fm3AttackCurve", decayCurve: "fm3DecayCurve", releaseCurve: "fm3ReleaseCurve"},
} as const;
export const FM_ALGORITHMS = [
  { id: "serial", label: "01 · Serial", edges: [[3, 2, "fmIndex32"], [2, 1, "fmIndex21"]], out: [1], description: "OP 3 → OP 2 → OP 1 → OUT" },
  { id: "parallel", label: "02 · Parallel", edges: [[2, 1, "fmIndex21"], [3, 1, "fmIndex31"]], out: [1], description: "OP 2 + OP 3 → OP 1 → OUT" },
  { id: "branched", label: "03 · Branched", edges: [[3, 2, "fmIndex32"], [2, 1, "fmIndex21"], [3, 1, "fmIndex31"]], out: [1], description: "OP 3 → OP 2 → OP 1, zusätzlich OP 3 → OP 1" },
  { id: "dual", label: "04 · Dual Carrier", edges: [[3, 2, "fmIndex32"]], out: [1, 2], description: "OP 3 → OP 2 → OUT, OP 1 → OUT" },
  { id: "hybrid", label: "05 · Hybrid", edges: [[3, 2, "fmIndex32"], [2, 1, "fmIndex21"]], out: [1, 2], description: "OP 3 → OP 2 → OP 1 → OUT, zusätzlich OP 2 → OUT" },
  { id: "triple", label: "06 · Triple Carrier", edges: [], out: [1, 2, 3], description: "OP 1 + OP 2 + OP 3 → OUT" },
] as const;
export type FmAlgorithm = typeof FM_ALGORITHMS[number]["id"];
export const FM_TARGETS = Object.fromEntries(FM_KEYS.map((key) => {
  const edge = key.match(/^fmIndex(\d)(\d)$/);
  const op = key[2];
  const field = key.slice(3);
  const labels: Record<string, string> = {"Wave": "Waveform", "Mode": "Ratio / fixed Hz", "Ratio": "Ratio", "Hz": "Fixed frequency", "Fine": "Fine tune", "Level": "Level", "Feedback": "Feedback", "Attack": "Attack", "Decay": "Decay", "Sustain": "Sustain", "Release": "Release", "AttackCurve": "Attack curve", "DecayCurve": "Decay curve", "ReleaseCurve": "Release curve"};
  return [key, { label: edge ? `FM · OP ${edge[1]} → OP ${edge[2]} index` : `OP ${op} · ${labels[field]}`,
    group: edge ? "FM routing" : `FM · Operator ${op}`, trigger: ["Wave", "Mode", "Attack", "Decay", "Sustain", "Release", "AttackCurve", "DecayCurve", "ReleaseCurve"].includes(field) }];
})) as Record<FmParam, { label: string; group: string; trigger: boolean }>;

export const LEGACY_FM_KEYS = ["fmRatio", "fmIndex", "fmFeedback", "fmDecay", "fmEnd", "fmRatio2", "fmIndex2"] as const;
const bound = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** Only legacy imports/factory recipes pass here; modern FM parameters never get overwritten. */
export function migrateFmPatch(p: Patch): Patch {
  p.fmVersion = 2;
  for (const op of FM_OPERATORS) {
    const k = FM_OP_KEYS[op];
    p[k.attack] = 0; p[k.sustain] = 1;
    // The old oscillators stayed open throughout the global amp release.
    p[k.release] = 8; p[k.releaseCurve] = 12;
  }
  p.fm1Wave = FM_WAVES.indexOf(p.wave); p.fm2Wave = FM_WAVES.indexOf(p.wave2); p.fm3Wave = 0;
  p.fm2Ratio = p.fmRatio; p.fm3Ratio = p.fmRatio2;
  p.fmIndex21 = bound(p.fmIndex / p.fm2Ratio, 0, 80);
  p.fmIndex32 = p.fmAlgorithm === "parallel" ? 0 : bound(p.fmIndex2 / p.fm3Ratio, 0, 80);
  p.fmIndex31 = p.fmAlgorithm === "parallel" ? bound(p.fmIndex2 / p.fm3Ratio, 0, 80) : 0;
  p.fm2Feedback = p.fmFeedback;
  p.fm2Decay = p.fmDecay; p.fm2Sustain = p.fmEnd;
  p.fm2DecayCurve = Math.log(Math.max(.00001, p.fmEnd));
  if (p.engine === "fm") p.mods = p.mods.map((m) => {
    const scale = m.target === "fmIndex" ? 1 / (4 * p.fm2Ratio)
      : m.target === "fmIndex2" ? 1 / (4 * p.fm3Ratio)
      : m.target === "fmRatio" || m.target === "fmRatio2" ? 15.75 / 31.875
      : m.target === "fmDecay" ? 4.99 / 7.999 : m.target === "fmAlgorithm" ? .4 : 1;
    return { ...m, target: legacyFmTarget(m.target, p), amount: bound(m.amount * scale, -1, 1) };
  });
  return p;
}
export function legacyFmTarget(key: ModTarget, p: Patch): ModTarget {
  return ({ wave: "fm1Wave", wave2: "fm2Wave", fmRatio: "fm2Ratio", fmRatio2: "fm3Ratio", fmIndex: "fmIndex21",
    fmIndex2: p.fmAlgorithm === "parallel" ? "fmIndex31" : "fmIndex32", fmFeedback: "fm2Feedback",
    fmDecay: "fm2Decay", fmEnd: "fm2Sustain" } as Partial<Record<ModTarget, ModTarget>>)[key] ?? key;
}
export function migrateFmLocks(locks: Partial<Numbers>, p: Patch): Partial<Numbers> {
  if (p.engine !== "fm" || !LEGACY_FM_KEYS.some((key) => key in locks)) return locks;
  const result = { ...locks };
  for (const key of LEGACY_FM_KEYS) if (key in locks) {
    const target = legacyFmTarget(key, p) as Param;
    let value = locks[key]!;
    if (key === "fmIndex") value /= locks.fmRatio ?? p.fm2Ratio;
    if (key === "fmIndex2") value /= locks.fmRatio2 ?? p.fm3Ratio;
    result[target] = value;
    delete result[key];
  }
  // Legacy ratio locks changed pitch without changing absolute FM deviation.
  if (locks.fmRatio !== undefined && locks.fmIndex === undefined)
    result.fmIndex21 = p.fmIndex21 * p.fm2Ratio / locks.fmRatio;
  if (locks.fmRatio2 !== undefined && locks.fmIndex2 === undefined) {
    const key = p.fmAlgorithm === "parallel" ? "fmIndex31" : "fmIndex32";
    result[key] = p[key] * p.fm3Ratio / locks.fmRatio2;
  }
  if (locks.fmEnd !== undefined) result.fm2DecayCurve = Math.log(Math.max(.00001, locks.fmEnd));
  return result;
}

/** Exponential/linear curve shared by DSP and editor. Zero is exactly linear. */
export function fmCurve(x: number, curve: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.abs(curve) < .0001 ? x : Math.expm1(curve * x) / Math.expm1(curve);
}

/** Retained in serialized data/import only; new UI exposes the migrated controls. */
export const visibleFmTarget = (key: string) => key === "fmRatio" || !(LEGACY_FM_KEYS as readonly string[]).includes(key);

/** Keep MIDI-controlled discrete selectors aligned with their rendered options. */
export function fmPatchEdits(p: Patch, values: Partial<Patch>): Partial<Patch> {
  const result = { ...values, ...migrateFmLocks(values, p) };
  for (const key of FM_KEYS) if (/(?:Wave|Mode)$/.test(key) && result[key] !== undefined)
    result[key] = Math.round(result[key]!);
  return result;
}
