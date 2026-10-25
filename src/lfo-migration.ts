const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function lfoParameterId(id: string) {
  return id.replace(/^(lfo\.[1-3])\.retrigger$/, "$1.mode");
}
function oldLfo(
  lfos: unknown,
  index: number,
): Record<string, unknown> | undefined {
  const item = Array.isArray(lfos) ? lfos[index] : undefined;
  return record(item) ? item : undefined;
}
export function migrateLfoLocks(value: unknown, legacyLfos?: unknown) {
  if (!record(value)) return value;
  const result = { ...value };
  for (let index = 0; index < 3; index++) {
    const base = oldLfo(legacyLfos, index),
      id = `lfo.${index + 1}.mode`;
    if (base?.mode === "free" && base.retrigger === true && result[id] === 0)
      result[id] = 1;
  }
  for (const [id, v] of Object.entries(value))
    if (/^lfo\.[1-3]\.retrigger$/.test(id)) {
      const mode = lfoParameterId(id),
        base = oldLfo(legacyLfos, +id.split(".")[1] - 1);
      const lockedMode = value[mode],
        canSwitch =
          lockedMode === 0 ||
          (lockedMode === undefined && (!base || base.mode === "free"));
      if (canSwitch) result[mode] = Number(v) >= 0.5 ? 1 : 0;
      delete result[id];
    }
  return result;
}
export function migrateLfoPatch(value: Record<string, unknown>) {
  const legacy = value.lfoVersion !== 2;
  const mods = Array.isArray(value.mods) ? value.mods : [];
  const result: Record<string, unknown> = {
    ...value,
    ...(migrateLfoLocks(value, legacy ? value.lfos : undefined) as Record<
      string,
      unknown
    >),
    lfoVersion: 2,
  };
  const hasOldRoutes = mods.some(
    (r) =>
      record(r) &&
      typeof r.target === "string" &&
      /^lfo\.[1-3]\.retrigger$/.test(r.target),
  );
  const lfos = Array.isArray(value.lfos)
    ? value.lfos
    : hasOldRoutes
      ? [{ mode: "free" }, { mode: "free", retrigger: true }, { mode: "free" }]
      : undefined;
  if (lfos)
    result.lfos = lfos.map((l, index) => {
      if (!record(l)) return l;
      const { retrigger, ...rest } = l;
      const switched = mods.some(
        (r) => record(r) && r.target === `lfo.${index + 1}.retrigger`,
      );
      return {
        ...rest,
        mode:
          l.mode === "retrigger" ||
          l.mode === "trig" ||
          (l.mode === "free" && retrigger === true)
            ? "trig"
            : l.mode,
        legacyTriggerMod:
          rest.legacyTriggerMod === true ||
          (legacy && l.mode === "free" && switched),
      };
    });
  if (Array.isArray(value.mods))
    result.mods = mods.flatMap((r) => {
      if (!record(r) || typeof r.target !== "string") return [r];
      const retrigger = /^lfo\.[1-3]\.retrigger$/.test(r.target),
        depth = /^lfo\.[1-3]\.depth$/.test(r.target);
      const base = oldLfo(lfos, +r.target.split(".")[1] - 1);
      // The old extra bit never changed ONE/HALF or an explicit TRIG mode.
      if (retrigger && base && base.mode !== "free") return [];
      return [
        {
          ...r,
          target: lfoParameterId(r.target),
          amount:
            typeof r.amount === "number"
              ? r.amount * (retrigger ? 0.25 : legacy && depth ? 0.5 : 1)
              : r.amount,
        },
      ];
    });
  return result;
}
