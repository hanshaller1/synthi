import { lfoSnapshot } from "./lfo";
import { MOD_TARGETS, PARAMS, MULTIMODE_FILTERS, clamp } from "./model";
import type { ModSource, ModTarget, Param, Patch } from "./model";
import { GRANULAR_SAMPLES, SAMPLER_SAMPLES } from "./catalog";

const choices = {
  wave: ["sine", "triangle", "sawtooth", "square"],
  wave2: ["sine", "triangle", "sawtooth", "square"],
  fmAlgorithm: ["serial", "parallel"],
  excitation: ["noise", "pick", "bow"],
  filterType: ["lowpass", "highpass", "bandpass", "notch", "multimode", "comb"],
  multimodeType: MULTIMODE_FILTERS.map((m) => m.id),
  combPolarity: ["positive", "negative"],
  sampleId: SAMPLER_SAMPLES.map((s) => s.id),
  grainSampleId: GRANULAR_SAMPLES.map((s) => s.id),
  sampleLoop: [false, true],
};
export function sourceValue(
  p: Patch, source: ModSource, time: number, start: number,
  note: number, velocity: number, wheel: number, tempo: number,
  releaseAt = Infinity,
) {
  if (source === "velocity") return velocity;
  if (source === "keytrack") return (note - 60) / 36;
  if (source === "modwheel") return wheel;
  const elapsed = Math.max(0, Math.min(time, releaseAt) - start);
  if (source === "filterEnv") {
    const value = elapsed < p.filterAttack ? elapsed / p.filterAttack
      : elapsed < p.filterAttack + p.filterDecay
        ? 1 + (p.filterSustain - 1) * (elapsed - p.filterAttack) / p.filterDecay : p.filterSustain;
    return time > releaseAt ? value * Math.max(0, 1 - (time - releaseAt) / p.filterRelease) : value;
  }
  const index = Number(source.slice(-1)) - 1, lfo = p.lfos[index];
  return lfo.depth * lfoSnapshot(lfo, tempo, start, time, index);
}
export function modulatedNumber(
  p: Patch, key: Param, time: number, start: number,
  note: number, velocity: number, wheel: number, tempo: number,
  releaseAt = Infinity,
) {
  const [min, max] = PARAMS[key];
  let value = p[key];
  for (const route of p.mods)
    if (route.target === key)
      value += sourceValue(p, route.source, time, start, note, velocity, wheel, tempo, releaseAt) * route.amount * (max - min) / 2;
  return clamp(value, min, max);
}
/** Topology, trim and articulation are sampled on the note's own audio timeline. */
export function triggerPatch(
  patch: Patch, start: number, note: number, velocity: number, wheel: number,
  tempo: number, combAvailable: boolean,
): Patch {
  const p = { ...patch };
  const targets = new Set(patch.mods.map((route) => route.target));
  for (const target of targets) {
    if (!MOD_TARGETS[target].trigger) continue;
    if (Object.hasOwn(PARAMS, target)) {
      const key = target as Param;
      p[key] = modulatedNumber(patch, key, start, start, note, velocity, wheel, tempo);
      if (key === "unison") p[key] = Math.round(p[key]);
    } else {
      const key = target as keyof typeof choices;
      const options: readonly (string | boolean)[] = key === "filterType" && !combAvailable
        ? choices.filterType.filter((type) => type !== "comb") : choices[key];
      let index = options.indexOf(patch[key]);
      for (const route of patch.mods)
        if (route.target === target)
          index += sourceValue(patch, route.source, start, start, note, velocity, wheel, tempo) * route.amount * Math.max(1, (options.length - 1) / 2);
      Object.assign(p, { [target]: options[Math.round(clamp(index, 0, options.length - 1))] });
    }
  }
  if (!p.sample && p.sampleId !== patch.sampleId)
    p.sampleRoot = SAMPLER_SAMPLES.find((sample) => sample.id === p.sampleId)?.root ?? p.sampleRoot;
  return p;
}
export function requiresModulationWorklet(p: Patch) {
  return p.mods.some((route) => route.amount !== 0 && (
    route.target === "drive" ||
    (p.engine === "subtractive" && route.target === "pulseWidth" && (p.wave === "square" || p.wave2 === "square")) ||
    (p.engine === "wavetable" && ["wavetable", "shape", "wtWarp", "wtFormant", "brightness"].includes(route.target)) ||
    (p.engine === "additive" && ["shape", "brightness", "harmonics", "spectralTilt", "spectralPeak", "spectralResonance", "inharmonicity"].includes(route.target))
  ));
}
export const modulationScale = (target: ModTarget) =>
  Object.hasOwn(PARAMS, target)
    ? (PARAMS[target as Param][1] - PARAMS[target as Param][0]) / 2 : 1;
