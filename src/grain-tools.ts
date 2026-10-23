// Grain divisions in quarter-note beats. The scheduler uses the project clock.
export const GRAIN_BEATS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
export function quantizeGrain(note: number, mode: number, root: number) {
  if (mode < .5) return note;
  const scale = mode < 1.5 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : mode < 2.5 ? [0, 2, 4, 5, 7, 9, 11] : mode < 3.5 ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 7, 9];
  let closest = Math.round(note), distance = Infinity;
  for (let n = Math.floor(note) - 12; n <= Math.ceil(note) + 12; n++) {
    if (scale.includes(((n - Math.round(root)) % 12 + 12) % 12) && Math.abs(n - note) < distance) { closest = n; distance = Math.abs(n - note); }
  }
  return closest;
}
export function grainEnvelope(shape: number, length: number, attack: number, release: number, legacyAttack: number, amplitude: number) {
  let a = attack > 0 ? attack / length : legacyAttack, r = release > 0 ? release / length : 1 - legacyAttack;
  if (a + r > 1) { const sum = a + r; a /= sum; r /= sum; }
  const curve = new Float32Array(129);
  for (let i = 1; i < curve.length - 1; i++) {
    const t = i / (curve.length - 1), edge = t < a ? t / Math.max(.0001, a) : t > 1 - r ? (1 - t) / Math.max(.0001, r) : 1;
    let value = edge;
    if (shape === 1) value = .5 - .5 * Math.cos(Math.PI * edge);
    else if (shape === 3) value = (Math.exp(-4.5 * (1 - edge) ** 2) - Math.exp(-4.5)) / (1 - Math.exp(-4.5));
    else if (shape === 4) value = edge >= .5 ? 1 : .5 - .5 * Math.cos(Math.PI * edge * 2);
    curve[i] = amplitude * value;
  }
  return curve;
}
