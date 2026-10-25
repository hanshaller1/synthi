import type { Pattern, Project } from "./model";
export type Swing = { amount: number; resolution: 8 | 16 };
export function effectiveSwing(
  pattern: Pattern,
  project: Pick<Project, "swing" | "swingResolution">,
): Swing {
  return {
    amount:
      pattern.swingMode === "off"
        ? 0
        : pattern.swingMode === "custom"
          ? pattern.swing
          : project.swing,
    resolution:
      pattern.swingMode === "custom"
        ? pattern.swingResolution
        : project.swingResolution,
  };
}
/** Warp trigger positions within a fixed pair; the pair boundary/clock never moves.
 * Pass the complete nominal trigger position, including microtiming/ratchets.
 * The warped position has slopes 1+amount / 1-amount, so it cannot run backward. */
export function swingOffset(position: number, division: number, swing: Swing) {
  const unit = division / swing.resolution;
  const phase = ((position % (unit * 2)) + unit * 2) % (unit * 2);
  const amount=Math.max(0,Math.min(1,swing.amount));
  return amount * Math.min(phase, unit * 2 - phase);
}
/** At full swing several nominal positions can share one audio sample. */
export function triggerEventOrder(a:{at:number;nominalAt?:number;note?:unknown},b:{at:number;nominalAt?:number;note?:unknown},sampleRate:number){
  return Math.ceil(a.at*sampleRate-1e-7)-Math.ceil(b.at*sampleRate-1e-7)
    || Number(!!a.note)-Number(!!b.note)
    || (a.nominalAt??a.at)-(b.nominalAt??b.at);
}
