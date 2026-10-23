import type { Patch } from "./model";

export const FILTER_PARAMS = {
  baseWidthEnabled: [0, 1, 0],
  baseWidthBase: [10, 20000, 10],
  baseWidthWidth: [0, 12, 12],
  filterCharacter: [0, 4, 0],
  filterPeakGain: [-24, 24, 0],
  filterMorph: [0, 1, 0],
  filterCompensation: [0, 1, 0],
  filterMix: [0, 1, 1],
  drivePosition: [0, 1, 0],
  combMode: [0, 1, 0],
  combGain: [0, 18, 0],
  combKeytrack: [0, 1, 0],
  combFine: [-100, 100, 0],
  combSpread: [0, 100, 0],
  combHighpass: [0, 4000, 0],
  combSaturation: [0, 1, 0],
  combInterpolation: [0, 1, 0],
  filterAttackCurve: [-100, 100, 0],
  filterDecayCurve: [-100, 100, 0],
  filterReleaseCurve: [-100, 100, 0],
  filterVelocity: [0, 1, 0],
  filterKeytrack: [0, 1, 0],
} as const;
export type FilterParam = keyof typeof FILTER_PARAMS;
export const FILTER_KEYS = Object.keys(FILTER_PARAMS) as FilterParam[];
export const FILTER_CHARACTERS = ["Classic", "Butterworth", "Ladder", "State Variable", "Acid"] as const;
export const FILTER_LABELS = {
  baseWidthEnabled: "Base-Width · Enable", baseWidthBase: "Base-Width · Base", baseWidthWidth: "Base-Width · Width (octaves)",
  filterCharacter: "Main filter · Character", filterPeakGain: "Main filter · Peak gain (dB)", filterMorph: "Main filter · LP/BP/HP morph",
  filterCompensation: "Main filter · Resonance compensation", filterMix: "Main filter · Dry/Wet", drivePosition: "Main filter · Drive position",
  combMode: "Comb · Feedback/Feedforward", combGain: "Comb · Resonance gain (dB)", combKeytrack: "Comb · Keytracking",
  combFine: "Comb · Fine tune (cents)", combSpread: "Comb · Stereo spread (cents)", combHighpass: "Comb · Feedback highpass",
  combSaturation: "Comb · Feedback saturation", combInterpolation: "Comb · Interpolation",
  filterAttackCurve: "Filter envelope · Attack curve", filterDecayCurve: "Filter envelope · Decay curve", filterReleaseCurve: "Filter envelope · Release curve",
  filterVelocity: "Filter envelope · Velocity depth", filterKeytrack: "Main filter · Keytracking",
} satisfies Record<FilterParam, string>;
export const FILTER_DISCRETE = ["baseWidthEnabled", "filterCharacter", "drivePosition", "combMode", "combInterpolation"] as const;
export const FILTER_TARGETS = Object.fromEntries(FILTER_KEYS.map((key) => [key, {
  label: FILTER_LABELS[key], group: key.startsWith("baseWidth") ? "Base-Width filter" : key.startsWith("comb") ? "Comb filter" : key.includes("Curve") || key === "filterVelocity" ? "Filter envelope" : "Main filter",
  trigger: (key !== "baseWidthEnabled" && (FILTER_DISCRETE as readonly string[]).includes(key)) || key.includes("Curve") || key === "filterVelocity",
}])) as Record<FilterParam, { label: string; group: string; trigger: boolean }>;

export function needsAdvancedFilter(p: Patch): boolean {
  return (p.filterType !== "comb" && (p.filterCharacter > 0 || (p.filterType === "multimode" && p.multimodeType === "morph"))) ||
    (p.baseWidthEnabled > 0 && (p.baseWidthBase > 10 || p.baseWidthWidth < 12)) ||
    p.filterMix !== 1 || p.filterCompensation !== 0 || p.drivePosition >= .5 ||
    (p.filterType === "comb" ? p.combMode >= .5 || p.combGain !== 0 || p.combKeytrack !== 0 || p.combFine !== 0 || p.combSpread !== 0 || p.combHighpass !== 0 || p.combSaturation !== 0 || p.combInterpolation >= .5 : p.filterKeytrack !== 0) ||
    p.mods.some((m) => FILTER_KEYS.includes(m.target as FilterParam) && !FILTER_TARGETS[m.target as FilterParam].trigger && m.amount !== 0 && !m.target.includes("Curve") && m.target !== "filterPeakGain");
}

export function filterCurve(x: number, curve: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const k = curve * .06;
  return Math.abs(k) < .00001 ? x : Math.expm1(k * x) / Math.expm1(k);
}
export function filterLevels(p: Patch, velocity = 1) {
  const depth = p.filterAmount * (1 - p.filterVelocity * (1 - velocity));
  return { base: p.cutoff, peak: Math.max(20, Math.min(20000, p.cutoff * 2 ** depth)), sustain: Math.max(20, Math.min(20000, p.cutoff * 2 ** (depth * p.filterSustain))) };
}
export function filterAdsrAt(p: Patch, elapsed: number) {
  if (elapsed < p.filterAttack) return filterCurve(elapsed / p.filterAttack, p.filterAttackCurve);
  if (elapsed < p.filterAttack + p.filterDecay) return 1 + (p.filterSustain - 1) * filterCurve((elapsed - p.filterAttack) / p.filterDecay, p.filterDecayCurve);
  return p.filterSustain;
}
export function filterFrequencyAt(p: Patch, elapsed: number, velocity = 1) {
  const { base, peak, sustain } = filterLevels(p, velocity);
  if (elapsed < p.filterAttack) return base * (peak / base) ** filterCurve(elapsed / p.filterAttack, p.filterAttackCurve);
  if (elapsed < p.filterAttack + p.filterDecay) return peak * (sustain / peak) ** filterCurve((elapsed - p.filterAttack) / p.filterDecay, p.filterDecayCurve);
  return sustain;
}

export function filterReleaseFrequencyAt(p: Patch, held: number, elapsed: number) {
  const tau = Math.max(.005, p.filterRelease / 4), t = Math.max(0, elapsed);
  const curved = p.filterRelease * filterCurve(t / p.filterRelease, p.filterReleaseCurve);
  return p.cutoff + (held - p.cutoff) * Math.exp(-(curved + Math.max(0, t - p.filterRelease)) / tau);
}

// Keep the pre-extension algorithm mapping for old automated presets.
export const LEGACY_MULTIMODE_TYPES = ["lp2", "lp4", "hp2", "hp4", "bp", "notch", "peak"] as const;
export function filterPatchEdits(partial: Partial<Patch>): Partial<Patch> {
  return { ...partial, ...(partial.filterPeakGain !== undefined ? { legacyPeakModulation: false } : {}), ...Object.fromEntries(FILTER_DISCRETE.filter((key) => partial[key] !== undefined).map((key) => [key, Math.round(partial[key]!)])) };
}
