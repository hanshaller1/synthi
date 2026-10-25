import type { Patch } from "./model";
type Event = { at: number; rates?: number[]; reset?: boolean };
/** The control-side clock for note/grain snapshots. Audio-rate destinations use
 * the common worklet phase bus; tempo/base-rate events have the same timestamps. */
export class LfoClockTimeline {
  private events: Event[] = [];
  private cached?: { time: number; phases: number[]; origin: number };
  constructor(p: Patch, tempo: number) {
    this.update(p, tempo, 0);
  }
  update(p: Patch, tempo: number, at: number) {
    const rates = p.lfos.map((l) =>
      l.sync ? tempo / 60 / l.division : l.rate,
    );
    const previous = this.events
      .filter((e) => e.rates && e.at <= at)
      .at(-1)?.rates;
    if (previous?.every((rate, i) => rate === rates[i])) return;
    this.events.push({ at, rates });
    this.events.sort((a, b) => a.at - b.at);
    this.cached = undefined;
  }
  reset(at: number) {
    this.events.push({ at, reset: true });
    this.events.sort((a, b) => a.at - b.at);
    this.cached = undefined;
  }
  cancel(at: number) {
    this.events = this.events.filter((e) => e.at < at);
    this.cached = undefined;
  }
  at(time: number) {
    if (this.cached?.time === time) return this.cached;
    let cursor = 0,
      origin = 0,
      rates = [0, 0, 0],
      phases = [0, 0, 0];
    for (const event of this.events) {
      if (event.at > time) break;
      phases = phases.map((v, i) => v + (event.at - cursor) * rates[i]);
      cursor = event.at;
      if (event.reset) {
        origin = event.at;
        phases = [0, 0, 0];
      }
      if (event.rates) rates = event.rates;
    }
    phases = phases.map((v, i) => v + Math.max(0, time - cursor) * rates[i]);
    return (this.cached = { time, phases, origin });
  }
}
