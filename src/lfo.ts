import type { Lfo, LfoShape } from "./model";
type Context = AudioContext | OfflineAudioContext;
export function lfoValue(shape: LfoShape, phase: number, seed = 1) {
  const x = ((phase % 1) + 1) % 1;
  if (shape === "sine") return Math.sin(x * Math.PI * 2);
  if (shape === "triangle") return 1 - 4 * Math.abs(x - 0.5);
  if (shape === "square") return x < 0.5 ? 1 : -1;
  if (shape === "sawtooth") return 1 - x * 2;
  if (shape === "ramp") return x * 2 - 1;
  if (shape === "exp")
    return (2 * (Math.exp(x * 5) - 1)) / (Math.exp(5) - 1) - 1;
  const r = Math.sin((Math.floor(phase) + seed * 17.17) * 127.1) * 43758.5453;
  return (r - Math.floor(r)) * 2 - 1;
}
const buffers = new WeakMap<Context, Map<string, AudioBuffer>>();
export function makeLfoSource(
  ctx: Context,
  lfo: Lfo,
  tempo: number,
  start: number,
  identity = 0,
) {
  const rate = lfo.sync ? tempo / 60 / lfo.division : lfo.rate;
  const phase =
    lfo.retrigger || lfo.mode === "one" || lfo.mode === "half"
      ? 0
      : start * rate;
  if (lfo.mode === "hold") {
    const source = ctx.createConstantSource();
    source.offset.value = lfoValue(lfo.shape, phase, start + Math.random());
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
  source.loop = lfo.mode === "free";
  if (!source.loop) {
    const length = lfo.mode === "half" ? resolution / 2 : resolution;
    const shot = ctx.createBuffer(1, length, resolution);
    const offset = random ? Math.floor(Math.random() * cycles) * resolution : 0;
    shot.copyToChannel(
      buffer.getChannelData(0).slice(offset, offset + length),
      0,
    );
    source.buffer = shot;
  } else source.buffer = buffer;
  source.playbackRate.value = rate;
  source.start(start, source.loop ? phase % cycles : 0);
  return source;
}
