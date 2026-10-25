import { SynthEngine, lockedPatch } from "./audio";
import { clamp, makeStep, pianoRange, shouldTrigger } from "./model";
import type { Pattern, PianoNote, Project } from "./model";
import { effectiveSwing, swingOffset, triggerEventOrder } from "./swing";
import type { Swing } from "./swing";

const LOOKAHEAD = .12;
export type TrackPlaybackState = { track: number; state: "stopped" | "playing" | "paused" };
type Segment = {
  at: number; from: number; end: number; unit: number; cycle: number; absolute: number;
  emitted: Set<string>; chances: Map<string, boolean>;
};
type Event = { at: number; nominalAt?:number; gate: number; note?: PianoNote; segment: Segment; key: string };

/** Independent forward timeline playback. Project mute/solo values stay untouched. */
export class TrackPlayback {
  track = -1;
  state: TrackPlaybackState["state"] = "stopped";
  fill = false;
  private timer: number | undefined;
  private segments: Segment[] = [];
  private pending: Event[] = [];
  private paused = { step: 0, absolute: 0, cycle: 0 };
  private patternIndex = -1;
  private snapshot: Pattern | null = null;
  private tempo = 0;
  private swing: Swing = { amount: 0, resolution: 16 };
  private swingChanges: { from: number; swing: Swing }[] = [];
  onState: (state: TrackPlaybackState) => void = () => {};
  onPosition: (track: number, step: number) => void = () => {};
  onSilence: () => void = () => {};
  onNote: (track: number, note: number, velocity: number, at: number, gate: number) => void = () => {};

  constructor(private engine: SynthEngine, private getProject: () => Project) {}

  private currentSegment() {
    const now = this.engine.context.currentTime;
    return [...this.segments].reverse().find((s) => s.at <= now) ?? this.segments[0];
  }
  position(track: number) {
    if (track !== this.track || this.state === "stopped") return null;
    if (this.state === "paused") return this.paused;
    const s = this.currentSegment();
    if (!s) return null;
    const progress = clamp((this.engine.context.currentTime - s.at) / s.unit, 0, s.end - s.from);
    return { step: s.from + progress, absolute: s.absolute + progress };
  }
  start(track: number) {
    const p = this.getProject();
    if (!p.tracks[track] || p.tracks[track].mode !== "piano") return;
    if (this.state === "playing" && this.track === track && this.patternIndex === p.activePattern) return;
    const resume = this.state === "paused" && this.track === track && this.patternIndex === p.activePattern;
    if (!resume) {
      this.stop(false);
      this.paused = { step: pianoRange(p.tracks[track].patterns[p.activePattern]).start, absolute: 0, cycle: 0 };
    }
    this.track = track;
    this.patternIndex = p.activePattern;
    this.state = "playing";
    this.engine.previewTrack = track;
    this.engine.update(p);
    this.rebase(this.paused.step, this.paused.absolute, this.paused.cycle);
    if(!resume)this.engine.resetLfoClocks(this.engine.context.currentTime+.04,track);
    this.timer = window.setInterval(() => this.schedule(), 20);
    this.onState({ track, state: this.state });
    this.schedule();
  }
  private segment(from: number, at: number, cycle: number, absolute: number) {
    const p = this.getProject(), pattern = p.tracks[this.track].patterns[this.patternIndex];
    const s: Segment = { at, from, end: pianoRange(pattern).end, unit: 240 / p.tempo / pattern.division, cycle, absolute, emitted: new Set(), chances: new Map() };
    this.segments.push(s);
    this.events(s, pattern);
    return s;
  }
  private events(s: Segment, pattern: Pattern, skipBefore = -Infinity) {
    // Return shared bus locks to the patch at grid boundaries, as in the main transport.
    for (let step = Math.ceil(s.from); step < s.end; step++) {
      const key = `step:${step}`;
      if (!s.emitted.has(key)) this.pending.push({ key, segment: s, at: s.at + (step - s.from) * s.unit, gate: 0 });
    }
    for (const n of pattern.notes) {
      const key = `note:${n.id}`;
      if (s.emitted.has(key) || n.start >= s.end || n.start >= pattern.length) continue;
      const group = n.group ?? n.id;
      if (!s.chances.has(group)) s.chances.set(group, Math.random() < n.probability);
      if (!s.chances.get(group)) continue;
      const absolute = s.absolute + n.start - s.from + n.micro;
      const start = n.start + n.micro + swingOffset(absolute, pattern.division, this.swingAt(absolute));
      const end = Math.min(s.end, start + n.duration), clipped = Math.max(s.from, start);
      if (end <= clipped) continue;
      const at = s.at + (clipped - s.from) * s.unit;
      // A newly recorded note is already sounding live; do not echo it on this pass.
      if (at <= skipBefore) { s.emitted.add(key); continue; }
      this.pending.push({ key, segment: s, at, nominalAt:s.at+(n.start+n.micro-s.from)*s.unit, gate: (end - clipped) * s.unit, note: n });
    }
  }
  private sortEvents() {
    this.pending.sort((a,b)=>triggerEventOrder(a,b,this.engine.context.sampleRate));
  }
  private swingAt(position: number): Swing {
    for (let i = this.swingChanges.length - 1; i >= 0; i--)
      if (this.swingChanges[i].from <= position) return this.swingChanges[i].swing;
    return this.swingChanges[0]?.swing ?? this.swing;
  }
  private changeSwing(swing: Swing, pattern: Pattern, current: Segment, now: number) {
    // Audio/MIDI events inside the lookahead have already been handed off.
    // Both resolutions meet at this pair boundary, so the new warp cannot
    // cross the old one, including the coincident triggers at 100% swing.
    const committed = current.absolute + (now + LOOKAHEAD + 1 / this.engine.context.sampleRate - current.at) / current.unit;
    const previous = this.swingAt(committed);
    const pair = pattern.division * 2 / Math.min(previous.resolution, swing.resolution);
    const from = Math.ceil(committed / pair) * pair;
    this.swingChanges = this.swingChanges.filter(change => change.from < from);
    this.swingChanges.push({ from, swing });
    this.swing = swing;
  }
  private refreshEvents(pattern: Pattern, skipBefore: number) {
    // Keep emitted keys and probability decisions; rebuild only our own queue.
    this.pending = [];
    for (const s of this.segments) this.events(s, pattern, skipBefore);
  }
  private trimSwingChanges(pattern: Pattern) {
    // Keep the preceding setting for notes that overlap a range start.
    const earliest = Math.min(...this.segments.map(s => s.absolute - s.from)) +
      Math.min(0, ...pattern.notes.map(n => n.start + n.micro));
    while (this.swingChanges.length > 1 && this.swingChanges[1].from <= earliest)
      this.swingChanges.shift();
  }
  private rebase(step: number, absolute: number, cycle: number) {
    const p = this.getProject(), pattern = p.tracks[this.track].patterns[this.patternIndex], range = pianoRange(pattern);
    this.snapshot = pattern;
    this.tempo = p.tempo;
    this.swing = effectiveSwing(pattern, p);
    this.swingChanges = [{ from: -Infinity, swing: this.swing }];
    this.pending = [];
    this.segments = [];
    this.engine.restore(p);
    this.segment(step >= range.end || step < range.start ? range.start : step, this.engine.context.currentTime + .04, cycle, absolute);
  }
  private schedule() {
    if (this.state !== "playing") return;
    const p = this.getProject(), track = p.tracks[this.track], pattern = track.patterns[this.patternIndex];
    if (p.activePattern !== this.patternIndex || track.mode !== "piano") { this.stop(); return; }
    const range = pianoRange(pattern), previousRange = pianoRange(this.snapshot!);
    const now = this.engine.context.currentTime, position = this.position(this.track)!, current = this.currentSegment();
    const swing = effectiveSwing(pattern, p);
    if (pattern.length !== this.snapshot!.length || pattern.division !== this.snapshot!.division ||
        range.start !== previousRange.start || range.end !== previousRange.end || range.loop !== previousRange.loop ||
        p.tempo !== this.tempo) {
      this.onSilence();
      this.engine.panic(this.track);
      this.rebase(position.step, position.absolute, current.cycle);
    } else {
      const swingChanged = swing.amount !== this.swing.amount || swing.resolution !== this.swing.resolution;
      if (swingChanged) this.changeSwing(swing, pattern, current, now);
      if (swingChanged || pattern.notes !== this.snapshot!.notes)
        this.refreshEvents(pattern, now);
      this.snapshot = pattern;
    }
    let last = this.segments[this.segments.length - 1];
    const endTime = (s: Segment) => s.at + (s.end - s.from) * s.unit;
    if (endTime(last) < now - .15 && range.loop) {
      this.onSilence();
      this.engine.panic(this.track);
      this.rebase(range.start, last.absolute + last.end - last.from, last.cycle + 1);
      last = this.segments[this.segments.length - 1];
    }
    while (range.loop && endTime(last) < now + LOOKAHEAD + 1/this.engine.context.sampleRate) {
      last = this.segment(range.start, endTime(last), last.cycle + 1, last.absolute + last.end - last.from);
    }
    this.sortEvents();
    while (this.pending.length && this.pending[0].at <= now + LOOKAHEAD) {
      const event = this.pending.shift()!;
      event.segment.emitted.add(event.key);
      if (event.at < now - .1) continue;
      const at = Math.max(now, event.at);
      if (!event.note) { this.engine.scheduleTrack(this.track, track.patch, at); continue; }
      const n = event.note;
      if (track.mute || !shouldTrigger({ ...makeStep(), on: true, probability: 1, condition: n.condition }, event.segment.cycle, this.fill, () => 0)) continue;
      const patch = lockedPatch(track.patch, n.locks);
      const gate = Math.max(1 / this.engine.context.sampleRate, event.gate - Math.max(0, now - event.at));
      this.engine.scheduleTrack(this.track, patch, at);
      this.engine.noteOn(this.track, n.note, n.velocity, patch, at, gate);
      this.onNote(this.track, n.note, n.velocity, at, gate);
    }
    this.onPosition(this.track, Math.floor(this.position(this.track)!.step));
    while (this.segments.length > 1 && this.segments[1].at <= now) this.segments.shift();
    this.trimSwingChanges(pattern);
    if (!range.loop && now >= endTime(last)) this.stop();
  }
  pause() {
    if (this.state !== "playing") return;
    const position = this.position(this.track)!;
    this.paused = { ...position, cycle: this.currentSegment().cycle };
    this.onSilence();
    this.clear();
    this.state = "paused";
    this.engine.restore(this.getProject());
    this.onState({ track: this.track, state: this.state });
  }
  private clear() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.pending = [];
    this.segments = [];
    this.swingChanges = [];
    if (this.track >= 0) this.engine.panic(this.track);
  }
  stop(notify = true) {
    if (this.state !== "stopped") this.onSilence();
    this.clear();
    this.state = "stopped";
    this.engine.previewTrack = null;
    this.engine.restore(this.getProject());
    if (notify) this.onState({ track: this.track, state: this.state });
  }
}
