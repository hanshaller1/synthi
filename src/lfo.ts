import type { Lfo, LfoShape } from "./model";
type Context = AudioContext | OfflineAudioContext;
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
export function lfoSnapshot(
  lfo: Lfo,
  tempo: number,
  start: number,
  time: number,
  identity = 0,
) {
  const rate = lfo.sync ? tempo / 60 / lfo.division : lfo.rate,
    elapsed = Math.max(0, time - start - (lfo.delay ?? 0));
  if (time < start + (lfo.delay ?? 0)) return 0;
  const retrigger =
      lfo.retrigger || ["retrigger", "one", "half"].includes(lfo.mode),
    initial = (lfo.phase ?? 0) / 360 + (retrigger ? 0 : start * rate);
  if (
    (lfo.mode === "one" && elapsed * rate >= 1) ||
    (lfo.mode === "half" && elapsed * rate >= 0.5)
  )
    return 0;
  const bipolar = lfoValue(
    lfo.mode === "hold" ? "random" : lfo.shape,
    initial + (retrigger ? elapsed : Math.max(0, time - start)) * rate,
    identity + 1,
    lfo.pulseWidth ?? 0.5,
    lfo.skew ?? 0,
    lfo.slew ?? 0,
  );
  return (
    (lfo.polarity ? (bipolar + 1) / 2 : bipolar) *
    Math.min(1, lfo.fade ? elapsed / lfo.fade : 1)
  );
}
const buffers = new WeakMap<Context, Map<string, AudioBuffer>>();
/** Legacy route sources keep the former buffer scheduling contract. */
export function makeLfoSource(
  ctx: Context,
  lfo: Lfo,
  tempo: number,
  start: number,
  identity = 0,
) {
  const rate = lfo.sync ? tempo / 60 / lfo.division : lfo.rate;
  if (lfo.mode === "hold") {
    const source = ctx.createConstantSource();
    source.offset.value = lfoValue(
      lfo.shape,
      lfo.retrigger ? 0 : start * rate,
      lfo.shape === "random" ? start + identity + 1 : identity + 1,
    );
    source.start(start);
    return source;
  }
  const random = lfo.shape === "random",
    cycles = random ? 32 : 1,
    resolution = 8192;
  const cache = buffers.get(ctx) ?? new Map<string, AudioBuffer>();
  buffers.set(ctx, cache);
  const key = `${lfo.shape}:${identity}`;
  let buffer = cache.get(key);
  if (!buffer) {
    buffer = ctx.createBuffer(1, resolution * cycles, resolution);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = lfoValue(lfo.shape, i / resolution, identity + 1);
    cache.set(key, buffer);
  }
  const source = ctx.createBufferSource();
  source.loop = lfo.mode === "free" || lfo.mode === "retrigger";
  if (!source.loop) {
    const length = lfo.mode === "half" ? resolution / 2 : resolution,
      shot = ctx.createBuffer(1, length, resolution);
    const hash = Math.sin((start + identity * 17.17) * 127.1) * 43758.5453,
      offset = random
        ? Math.floor((hash - Math.floor(hash)) * 32) * resolution
        : 0;
    shot.copyToChannel(
      buffer.getChannelData(0).slice(offset, offset + length),
      0,
    );
    source.buffer = shot;
  } else source.buffer = buffer;
  source.playbackRate.value = rate;
  source.start(
    start,
    source.loop && !(lfo.retrigger || lfo.mode === "retrigger")
      ? (start * rate) % cycles
      : 0,
  );
  return source;
}
