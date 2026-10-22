import type { Param, Patch } from "./model";
export type FxControl = {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  param?: Param;
  unit?: "hz" | "time" | "percent" | "cents" | "bits";
  log?: boolean;
  step?: number;
};
const control = (
  key: string,
  label: string,
  min: number,
  max: number,
  fallback: number,
  unit?: FxControl["unit"],
  param?: Param,
  log = false,
): FxControl => ({ key, label, min, max, default: fallback, unit, param, log });
const drive = () =>
  control("drive", "Drive", 0, 1, 0.05, "percent", "distortion");
const wet = (param: Param) =>
  control("mix", "Mix", 0, 1, 0.2, "percent", param);
const tone = () =>
  control("tone", "Tone", 200, 20000, 12000, "hz", undefined, true);
const time = () =>
  control("time", "Time", 0.04, 1.5, 0.375, "time", "delayTime", true);
const feedback = () =>
  control("feedback", "Feedback", 0, 0.85, 0.32, "percent", "feedback");
const size = () =>
  control("decay", "Decay", 0.2, 5, 2.6, "time", "reverbSize", true);
const rate = () =>
  control("rate", "Rate", 0.02, 12, 0.65, "hz", undefined, true);
const depth = () => control("depth", "Depth", 0, 1, 0.5, "percent");
const width = () => control("width", "Width", 0, 1, 1, "percent");
const predelay = () => control("predelay", "Pre-delay", 0, 0.1, 0.02, "time");
const damping = () =>
  control("damping", "Damping", 500, 18000, 9000, "hz", undefined, true);
const satMix = () => control("mix", "Mix", 0, 1, 1, "percent");
export const FX_CONTROLS: Record<string, FxControl[]> = {
  soft: [
    drive(),
    control("warmth", "Warmth", 0, 1, 0.3, "percent"),
    tone(),
    satMix(),
  ],
  hard: [
    drive(),
    control("threshold", "Threshold", 0.1, 1, 0.7, "percent"),
    tone(),
    satMix(),
  ],
  fold: [
    drive(),
    control("folds", "Folds", 1, 8, 2),
    control("bias", "Bias", -1, 1, 0),
    satMix(),
  ],
  crush: [
    control("bits", "Bit depth", 3, 16, 8, "bits"),
    drive(),
    tone(),
    satMix(),
  ],
  diode: [
    drive(),
    control("bias", "Bias", -0.5, 0.5, 0.1),
    control("asymmetry", "Asymmetry", 0, 1, 0.6, "percent"),
    tone(),
    satMix(),
  ],
  chorus: [wet("chorus"), rate(), depth(), width()],
  flanger: [
    wet("chorus"),
    rate(),
    depth(),
    control("regen", "Feedback", -0.85, 0.85, 0.45, "percent"),
  ],
  vibrato: [
    wet("chorus"),
    rate(),
    control("cents", "Pitch depth", 0, 100, 25, "cents"),
  ],
  phaser: [
    wet("chorus"),
    rate(),
    control("frequency", "Center", 100, 3000, 700, "hz", undefined, true),
    control("resonance", "Resonance", 0.1, 4, 0.7),
  ],
  tremolo: [
    wet("chorus"),
    rate(),
    depth(),
    { ...control("shape", "Sine / Pulse", 0, 1, 0, "percent"), step: 1 },
  ],
  digital: [time(), feedback(), wet("delay"), tone()],
  tape: [
    time(),
    feedback(),
    wet("delay"),
    control("age", "Tape age", 0, 1, 0.4, "percent"),
    control("wow", "Wow / flutter", 0, 1, 0.2, "percent"),
  ],
  pingpong: [time(), feedback(), wet("delay"), width()],
  multitap: [
    time(),
    feedback(),
    wet("delay"),
    control("spacing", "Tap spacing", 0.15, 0.8, 0.333),
    width(),
  ],
  dub: [
    time(),
    feedback(),
    wet("delay"),
    control("frequency", "Dub filter", 200, 4000, 1100, "hz", undefined, true),
    control("resonance", "Resonance", 0.2, 3, 1.4),
  ],
  room: [
    size(),
    wet("reverb"),
    control("early", "Reflections", 0, 1, 0.5, "percent"),
    damping(),
  ],
  hall: [size(), wet("reverb"), predelay(), damping()],
  plate: [
    size(),
    wet("reverb"),
    control("brightness", "Brightness", 0, 1, 0.7, "percent"),
    predelay(),
  ],
  spring: [
    size(),
    wet("reverb"),
    control("tension", "Tension", 0.1, 1, 0.5, "percent"),
    damping(),
  ],
  gated: [
    size(),
    wet("reverb"),
    control("gate", "Gate length", 0.1, 1, 0.65, "percent"),
    predelay(),
  ],
};
export type FxSettings = Record<string, Record<string, number>>;
export function defaultFxSettings(): FxSettings {
  return Object.fromEntries(
    Object.entries(FX_CONTROLS).map(([id, controls]) => [
      id,
      Object.fromEntries(
        controls.filter((c) => !c.param).map((c) => [c.key, c.default]),
      ),
    ]),
  );
}
export function fxValues(patch: Patch, id: string) {
  return Object.fromEntries(
    FX_CONTROLS[id].map((c) => [
      c.key,
      c.param ? patch[c.param] : (patch.fxSettings[id]?.[c.key] ?? c.default),
    ]),
  );
}
