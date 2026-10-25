import type { Lfo, LfoShape } from "./model";
export function lfoNoise(cycle: number, seed = 1) {
  const value = Math.sin((cycle + seed * 17.17) * 127.1) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
export function lfoValue(
  shape: LfoShape,
  phase: number,
  seed = 1,
  pulseWidth = 0.5,
  skew = 0,
  slew = 0,
  noise: typeof lfoNoise = lfoNoise,
) {
  let x = ((phase % 1) + 1) % 1;
  const pivot = 0.5 + skew * 0.49;
  x = x < pivot ? (x / pivot) * 0.5 : 0.5 + ((x - pivot) / (1 - pivot)) * 0.5;
  if (shape === "sine") return Math.sin(x * Math.PI * 2);
  if (shape === "triangle") return 1 - 4 * Math.abs(x - 0.5);
  if (shape === "square") return x < pulseWidth ? 1 : -1;
  if (shape === "sawtooth") return 1 - x * 2;
  if (shape === "ramp") return x * 2 - 1;
  if (shape === "exp") return (2 * Math.expm1(x * 5)) / Math.expm1(5) - 1;
  const cycle = Math.floor(phase),
    current = noise(cycle, seed);
  if (shape === "smooth") {
    // Always interpolate over the whole cycle. Slew adds zero-acceleration
    // easing at the endpoints instead of turning this into sample & hold.
    const cubic = x * x * (3 - 2 * x),
      quintic = x * x * x * (10 + x * (-15 + 6 * x));
    const t = cubic + (quintic - cubic) * Math.max(0, Math.min(1, slew));
    const previous = noise(cycle - 1, seed);
    return previous + (current - previous) * t;
  }
  if (slew > 0) {
    const t = Math.min(1, x / Math.max(0.001, slew)),
      previous = noise(cycle - 1, seed);
    return previous + (current - previous) * t * t * (3 - 2 * t);
  }
  return current;
}
/** Shared gain law for preview, trigger sampling and the audio worklet. */
export function lfoFadeGain(
  elapsed: number,
  fadeIn: number,
  fadeOut: number,
  releaseElapsed: number,
  remaining = Infinity,
  cycleDuration = Infinity,
) {
  const smooth = (x: number) => {
    const t = Math.max(0, Math.min(1, x));
    return t * t * (3 - 2 * t);
  };
  let gain = fadeIn > 0 ? smooth(elapsed / fadeIn) : 1;
  if (fadeOut > 0 && releaseElapsed >= 0)
    gain *= 1 - smooth(releaseElapsed / fadeOut);
  if (Number.isFinite(remaining))
    gain *= smooth(
      remaining / Math.max(0.005, Math.min(fadeOut, cycleDuration)),
    );
  return gain;
}
/** Static editor preview at constant tempo/rate. Audio snapshots use ControlPlanner. */
export function lfoPreviewValue(
  lfo: Lfo,
  tempo: number,
  start: number,
  time: number,
  identity = 0,
  releaseAt = Infinity,
  sharedPhase?: number,
  clockStart = 0,
) {
  const rate = lfo.sync ? tempo / 60 / lfo.division : lfo.rate,
    free = lfo.mode === "free";
  const elapsed = time - (free ? clockStart : start) - (lfo.delay ?? 0);
  if (elapsed < 0) return 0;
  const localPhase = elapsed * rate,
    length = lfo.mode === "one" ? 1 : lfo.mode === "half" ? 0.5 : Infinity;
  if (localPhase >= length) return 0;
  const phase =
    lfo.mode === "hold"
      ? (sharedPhase ?? (start - clockStart) * rate)
      : free
        ? (sharedPhase ?? (time - clockStart) * rate)
        : localPhase;
  const bipolar = lfoValue(
    lfo.shape,
    phase + ((lfo.phase ?? 0) % 360) / 360,
    identity + 1,
    lfo.pulseWidth ?? 0.5,
    lfo.skew ?? 0,
    lfo.slew ?? 0,
  );
  const gain = lfoFadeGain(
    elapsed,
    lfo.fade ?? 0,
    lfo.fadeOut ?? 0,
    time - releaseAt,
    Number.isFinite(length) ? (length - localPhase) / rate : Infinity,
    length / rate,
  );
  return (lfo.polarity ? (bipolar + 1) / 2 : bipolar) * gain;
}
