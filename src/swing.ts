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
 * Interpolate finer subdivisions to preserve their order even at maximum swing. */
export function swingOffset(position: number, division: number, swing: Swing) {
  const unit = division / swing.resolution;
  const phase = ((position % (unit * 2)) + unit * 2) % (unit * 2);
  return swing.amount * Math.min(phase, unit * 2 - phase);
}
