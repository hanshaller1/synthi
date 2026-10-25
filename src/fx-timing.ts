/** A deliberate bound, shared by DSP, UI and export; no silent buffer clipping. */
export const FX_DELAY_LIMIT_SECONDS = 16;

export function delayTiming(
  mode: string,
  v: Record<string, number>,
  tempo: number,
) {
  const sync = v.sync >= 0.5;
  const left = sync ? (60 / tempo) * Math.max(1 / 24, v.division) : v.time;
  const right =
    mode === "pingpong"
      ? sync
        ? v.rightDivision > 0
          ? (60 / tempo) * v.rightDivision
          : left
        : v.rightTime > 0
          ? v.rightTime
          : left
      : left + (mode === "digital" ? v.stereoOffset : 0);
  const requested =
    mode === "multitap"
      ? [left, left * v.spacing, left * v.spacing * 2]
      : [left, right];
  const actual = requested.map((t) =>
    Math.max(0.001, Math.min(FX_DELAY_LIMIT_SECONDS, t)),
  );
  return {
    requested,
    actual,
    limited: requested.some((t, i) => Math.abs(t - actual[i]) > 1e-6),
  };
}

/** Disable unsupported choices while retaining imported/tempo-modulated base values. */
export function delayDivisionSupported(
  mode: string,
  values: Record<string, number>,
  tempo: number,
  key: string,
  division: number,
) {
  const timing = delayTiming(
    mode,
    { ...values, [key]: division, sync: 1 },
    tempo,
  );
  // Independent ping-pong channels must remain repairable when both stored
  // divisions exceed the limit; an invalid opposite channel cannot lock the menu.
  const indices =
    mode === "pingpong"
      ? key === "rightDivision"
        ? [1]
        : values.rightDivision > 0
          ? [0]
          : [0, 1]
      : timing.requested.map((_, i) => i);
  return indices.every(
    (i) => Math.abs(timing.requested[i] - timing.actual[i]) <= 1e-6,
  );
}
