import { CHORDS, STEP_SPANS, clamp, clone, makeStep, patternTimeline, playbackStep, shouldTrigger, stepIndex } from "./model";
import type { Numbers, Pattern, PianoNote, Step, Track } from "./model";

export const newNoteId = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4)), (v) => v.toString(16)).join("-");
export const makeNote = (start = 0, note = 60, duration = 1): PianoNote => ({
  id: newNoteId(), start, note, duration, velocity: 0.8,
  probability: 1, condition: "always", micro: 0, locks: {},
});

/** Keep the original steps intact, including disabled and covered steps. */
export function stepsToNotes(pattern: Pattern): PianoNote[] {
  return patternTimeline(pattern, true).flatMap(({ index, span }) => {
    const s = pattern.steps[index];
    if (!s.on) return [];
    return Array.from({ length: s.retrig }, (_, r) => CHORDS[s.chord].map((offset, c): PianoNote => ({
      id: `step-${index}-${r}-${c}`, group: `step-${index}`,
      start: index + r * span / s.retrig,
      duration: span * s.gate / s.retrig,
      note: clamp(s.note + offset, 0, 127), velocity: s.velocity,
      probability: s.probability, condition: s.condition,
      micro: s.micro * span, locks: clone(s.locks),
    }))).flat();
  });
}
const rounded = (n: number) => Math.round(n * 1e8) / 1e8;
const lockKey = (locks: Partial<Numbers>) => JSON.stringify(Object.entries(locks).sort());
function musicalKey(n: PianoNote) {
  return JSON.stringify([rounded(n.start), rounded(n.duration), n.note, rounded(n.velocity),
    rounded(n.probability), n.condition, rounded(n.micro), lockKey(n.locks), n.group ?? ""]);
}
const equivalence = new WeakMap<Pattern, boolean>();
export function matchesSteps(pattern: Pattern) {
  const cached = equivalence.get(pattern);
  if (cached !== undefined) return cached;
  const a = stepsToNotes(pattern).map(musicalKey).sort(), b = pattern.notes.map(musicalKey).sort();
  const same = a.length === b.length && a.every((n, i) => n === b[i]);
  equivalence.set(pattern, same);
  return same;
}

/** Refuse any conversion that would quantize, drop or change a musical event. */
export function notesToSteps(pattern: Pattern): { steps?: Step[]; reason?: string } {
  if (matchesSteps(pattern)) return { steps: clone(pattern.steps) };
  if (pattern.direction !== "forward") return { reason: "Bearbeitete Piano-Roll-Noten mit dieser Abspielrichtung lassen sich nicht verlustfrei zurückwandeln." };
  const steps = pattern.steps.map((s) => ({ ...clone(s), on: false, span: 1 }));
  const groups = new Map<number, PianoNote[]>();
  for (const n of pattern.notes) {
    if (Math.abs(n.start - Math.round(n.start)) > 1e-8)
      return { reason: "Mindestens eine Note beginnt zwischen zwei Steps. Eine Rückwandlung würde ihren Zeitpunkt verändern." };
    if (n.duration < 0.05 || n.duration > 4 || Math.abs(n.micro) > 0.45)
      return { reason: "Notenlänge oder Microtiming überschreiten den darstellbaren Step-Bereich." };
    const bucket = groups.get(n.start) ?? [];
    bucket.push(n); groups.set(n.start, bucket);
  }
  for (const [index, notes] of groups) {
    notes.sort((a, b) => a.note - b.note);
    const root = notes[0];
    if (notes.some((n) => n.duration !== root.duration || n.velocity !== root.velocity ||
      n.probability !== root.probability || n.condition !== root.condition ||
      n.micro !== root.micro || lockKey(n.locks) !== lockKey(root.locks)))
      return { reason: "Gleichzeitige Noten besitzen unterschiedliche Längen, Velocity oder Trigger-Einstellungen." };
    if (notes.length > 1 && root.probability < 1 && notes.some((n) => !n.group || n.group !== root.group))
      return { reason: "Unabhängige Noten-Wahrscheinlichkeiten würden zu einer gemeinsamen Akkord-Wahrscheinlichkeit zusammengefasst." };
    if (root.group && pattern.notes.some((n) => n.group === root.group && n.start !== index) && root.probability < 1)
      return { reason: "Verknüpfte Zufalls-Trigger lassen sich nicht in unabhängige Steps aufteilen." };
    const chord = (Object.keys(CHORDS) as Step["chord"][]).find((key) =>
      CHORDS[key].length === notes.length && CHORDS[key].every((off, i) => notes[i].note === root.note + off));
    if (!chord) return { reason: "Dieser Akkord ist als Single, Major, Minor, Fifth oder Seventh nicht darstellbar." };
    steps[index] = { ...makeStep(), on: true, note: root.note, chord, gate: root.duration,
      velocity: root.velocity, probability: root.probability, condition: root.condition,
      micro: root.micro, locks: clone(root.locks) };
  }
  return { steps };
}

export type SequenceNote = {
  note: number; velocity: number; offset: number; duration: number;
  locks: Partial<Numbers>;
};
export type SequenceFrame = { index: number; cycle: number; advance: number; offset: number; notes: SequenceNote[]; trigger: boolean };
export type ChanceState = Map<string, { cycle: number; trigger: boolean }>;
/** Offsets and durations use the track's grid unit; both playback paths use this. */
export function sequenceFrame(track: Track, pattern: Pattern, position: number, swing: number, fill: boolean, chance: ChanceState): SequenceFrame {
  const swingUnits = Math.min(1, pattern.division / 16);
  if (track.mode === "step" || matchesSteps(pattern)) {
    const { index, span, advance, cycle, trigger } = playbackStep(pattern, position);
    const s = pattern.steps[index], offset = (position % 2 ? swing * Math.min(span, swingUnits) : 0) + s.micro * span;
    const notes: SequenceNote[] = [];
    if (trigger && shouldTrigger(s, cycle, fill))
      for (let r = 0; r < s.retrig; r++) for (const off of CHORDS[s.chord])
        notes.push({ note: clamp(s.note + off, 0, 127), velocity: s.velocity,
          offset: offset + r * span / s.retrig, duration: span * s.gate / s.retrig, locks: s.locks });
    return { index, cycle, advance, offset, notes, trigger };
  }
  const cycleLength = pattern.direction === "pingpong" ? Math.max(1, pattern.length * 2 - 2) : pattern.length;
  const cycle = Math.floor(position / cycleLength);
  const index = stepIndex(position, pattern.length, pattern.direction);
  const offset = position % 2 ? swing * swingUnits : 0;
  const notes: SequenceNote[] = [];
  for (const n of pattern.notes) {
    if (n.start < index || n.start >= index + 1 || n.start >= pattern.length) continue;
    const key = n.group ?? n.id, previous = n.group ? chance.get(key) : undefined;
    let trigger = previous?.cycle === cycle ? previous.trigger : undefined;
    if (trigger === undefined) {
      trigger = shouldTrigger({ ...makeStep(), on: true, probability: n.probability, condition: n.condition }, cycle, fill);
      if (n.group) chance.set(key, { cycle, trigger });
    }
    if (trigger) notes.push({ note: n.note, velocity: n.velocity,
      offset: offset + n.start - index + n.micro, duration: n.duration, locks: n.locks });
  }
  return { index, cycle, advance: 1, offset, notes, trigger: true };
}

export type MigrationReport = { dropped: number; timing: number; lengths: number; expression: number };
export function migrateToSteps(pattern: Pattern, swing = 0): { steps: Step[]; report: MigrationReport } {
  const exact = notesToSteps(pattern), report: MigrationReport = { dropped: 0, timing: 0, lengths: 0, expression: 0 };
  if (exact.steps) return { steps: exact.steps, report };
  const steps = pattern.steps.map((s) => ({ ...clone(s), on: false, span: 1 }));
  const buckets = new Map<number, PianoNote[]>();
  for (const n of pattern.notes) {
    const slot = clamp(Math.round(n.start + n.micro), 0, 63);
    const group = buckets.get(slot) ?? []; group.push(n); buckets.set(slot, group);
  }
  const occupied = [...buckets.keys()].sort((a, b) => a - b);
  const swingUnits = Math.min(1, pattern.division / 16);
  const heardStart = (n: PianoNote) => n.start + n.micro + (Math.floor(n.start) % 2 ? swing * swingUnits : 0);
  for (const [slot, notes] of buckets) {
    // Choose a supported subset, never invent missing chord tones. Prefer more
    // retained notes, then stronger notes. Duplicated unisons remain one trigger.
    let chosen: PianoNote[] = [], root = notes[0].note, chord: Step["chord"] = "single", score = -1;
    for (const candidate of notes) for (const key of Object.keys(CHORDS) as Step["chord"][]) {
      const selected = CHORDS[key].map((off) => notes.filter((n) => n.note === candidate.note + off).sort((a, b) => b.velocity - a.velocity)[0]);
      if (selected.some((n) => !n)) continue;
      const value = selected.length * 100 + selected.reduce((sum, n) => sum + n.velocity, 0);
      if (value > score) { score = value; chosen = selected; root = candidate.note; chord = key; }
    }
    const lead = [...chosen].sort((a, b) => b.velocity - a.velocity)[0];
    const next = occupied.find((value) => value > slot) ?? 64;
    const boundary = slot < pattern.length ? pattern.length : 64;
    const available = Math.min(next - slot, boundary - slot);
    const options = STEP_SPANS.filter((span) => Math.ceil(span) <= available).map((span) => {
      const offset = slot % 2 ? swing * Math.min(span, swingUnits) : 0;
      const micro = clamp((heardStart(lead) - slot - offset) / span, -.45, .45);
      const gate = clamp(lead.duration / span, .05, 4);
      const error = Math.abs(slot + offset + micro * span - heardStart(lead)) * 4 + Math.abs(gate * span - lead.duration);
      return { span, gate, micro, offset, error };
    }).sort((a, b) => a.error - b.error || Math.abs(a.span - 1) - Math.abs(b.span - 1));
    const { span, gate, micro, offset } = options[0];
    report.dropped += notes.length - chosen.length;
    for (const n of chosen) {
      if (Math.abs(slot + offset + micro * span - heardStart(n)) > 1e-8) report.timing++;
      if (Math.abs(gate * span - n.duration) > 1e-8) report.lengths++;
      if (n.velocity !== lead.velocity || n.probability !== lead.probability || n.condition !== lead.condition || lockKey(n.locks) !== lockKey(lead.locks) || (lead.probability < 1 && (chosen.length > 1 || pattern.notes.some((m) => m.id !== n.id && m.group && m.group === n.group)))) report.expression++;
    }
    steps[slot] = { ...makeStep(), on: true, note: root, chord, span, gate, micro,
      velocity: lead.velocity, probability: lead.probability, condition: lead.condition, locks: clone(lead.locks) };
  }
  // Reverse/ping-pong traversal of a newly flattened grid can differ at span boundaries.
  if (pattern.direction !== "forward") report.timing += pattern.notes.length;
  return { steps, report };
}
