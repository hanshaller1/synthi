import { MAX_STEPS, SCALES, clamp, clone } from "./model";
import type { PianoNote, ScaleConfig } from "./model";
import { makeNote } from "./sequence";

export const inScale = (pitch: number, scale: ScaleConfig) => SCALES[scale.name].intervals.includes((pitch - scale.root + 120) % 12);
export function scalePitch(pitch: number, scale: ScaleConfig) {
  const value = clamp(Math.round(pitch), 0, 127);
  if (!scale.enabled) return value;
  for (let d = 0; d < 12; d++) {
    if (value - d >= 0 && inScale(value - d, scale)) return value - d;
    if (value + d <= 127 && inScale(value + d, scale)) return value + d;
  }
  return value;
}
export type Generator = "melody" | "euclidean" | "arpeggio";
export type GenerateOptions = { kind: Generator; from: number; to: number; grid: number; density: number; pulses: number; cycle: number; octave: number; octaves: number; gate: number; velocity: number; order: "up" | "down" | "updown" | "random" };
export function generateNotes(o: GenerateOptions, scale: ScaleConfig, source: PianoNote[], random = Math.random): PianoNote[] {
  const pitches = Array.from({ length: 128 }, (_, n) => n).filter((n) => n >= (o.octave + 1) * 12 && n < (o.octave + 1 + o.octaves) * 12 && (!scale.enabled || inScale(n, scale)));
  const chord = [...new Set(source.map((n) => n.note))].sort((a, b) => a - b);
  const arpBase = (chord.length ? chord : [pitches[0], pitches[2] ?? pitches[0], pitches[4] ?? pitches[0]]).filter((n) => n !== undefined);
  const arp = [...new Set(Array.from({ length: o.octaves }, (_, octave) => arpBase.map((n) => n + octave * 12)).flat().filter((n) => n <= 127))].sort((a, b) => a - b);
  const result: PianoNote[] = [];
  let index = 0;
  const count = Math.min(1024, Math.ceil((o.to - o.from) / o.grid));
  for (let i = 0; i < count && pitches.length; i++) {
    if (o.kind === "euclidean" ? (i % o.cycle) * o.pulses % o.cycle >= o.pulses : o.kind === "melody" && random() >= o.density) continue;
    let pitch = pitches[Math.floor(random() * pitches.length)];
    if (o.kind === "euclidean") pitch = pitches[0];
    if (o.kind === "arpeggio") {
      const period = Math.max(1, arp.length * 2 - 2), pos = index % period;
      const at = o.order === "random" ? Math.floor(random() * arp.length) : o.order === "down" ? arp.length - 1 - index % arp.length : o.order === "updown" ? Math.min(pos, period - pos) : index % arp.length;
      pitch = scalePitch(arp[at], scale); index++;
    }
    const start = o.from + i * o.grid;
    result.push({ ...makeNote(start, pitch, Math.max(.001, Math.min(o.grid * o.gate, o.to - start))), velocity: o.velocity });
  }
  return result;
}
export type Transform = "reverse" | "invert" | "legato" | "double" | "half" | "rotateLeft" | "rotateRight" | "quantize" | "scale";
export function transformNotes(source: PianoNote[], kind: Transform, scale: ScaleConfig, grid: number): PianoNote[] {
  if (!source.length) return [];
  const start = Math.min(...source.map((n) => n.start)), end = Math.max(...source.map((n) => n.start + n.duration));
  const low = Math.min(...source.map((n) => n.note)), high = Math.max(...source.map((n) => n.note));
  const pivot = low + high;
  const factor = kind === "double" ? 2 : .5;
  const starts = [...new Set(source.map((n) => n.start))].sort((a, b) => a - b);
  const changed = source.map((n): PianoNote => {
    const copy = clone(n);
    switch (kind) {
      case "reverse": return { ...copy, start: start + end - n.start - n.duration, micro: -n.micro };
      case "invert": return { ...copy, note: scalePitch(pivot - n.note, scale) };
      case "legato": return { ...copy, duration: (starts.find((v) => v > n.start) ?? end) - n.start };
      case "double": case "half": return { ...copy, start: start + (n.start - start) * factor, duration: n.duration * factor, micro: n.micro * factor };
      case "rotateLeft": case "rotateRight": {
        const length = end - start, offset = kind === "rotateLeft" ? -grid : grid;
        return { ...copy, start: start + ((n.start - start + offset) % length + length) % length };
      }
      case "quantize": return { ...copy, start: Math.round((n.start + n.micro) / grid) * grid, duration: Math.max(grid, Math.round(n.duration / grid) * grid), micro: 0 };
      case "scale": return { ...copy, note: scalePitch(n.note, { ...scale, enabled: true }) };
    }
  });
  if (changed.some((n) => n.start >= MAX_STEPS || n.start < 0 || n.duration > 256 || Math.abs(n.micro) > 3.6)) throw new Error("Diese Transformation überschreitet den Bereich von 128 Steps oder die maximale Notenlänge. Auswahl verkleinern oder komprimieren.");
  return changed.map((n) => ({ ...n, duration: Math.max(.001, n.duration) }));
}
export function humanizeNotes(source: PianoNote[], timing: number, velocity: number, length: number, random = Math.random): PianoNote[] {
  const drift = (amount: number) => (random() * 2 - 1) * amount;
  return source.map((n) => {
    const start = timing ? clamp(n.start + n.micro + drift(timing), 0, MAX_STEPS - .001) : n.start;
    return { ...clone(n), start, micro: timing ? 0 : n.micro, velocity: clamp(n.velocity + drift(velocity), .01, 1), duration: clamp(n.duration * (1 + drift(length)), .001, 256) };
  });
}
