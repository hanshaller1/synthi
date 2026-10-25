import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Param, Patch } from "./model";
import type { ModulationReading } from "./modulation-worklet";
import { fxValues, FX_SLOT_MODES } from "./fx-spec";
import type { FxSlot } from "./model";
import { DYNAMIC_META } from "./parameter-spec";
import { PARAMETER_REGISTRY } from "./parameters";
import { createModulationRanges } from "./modulation-range";
type Readings = { voice?: ModulationReading; fx?: ModulationReading };
const Context = createContext<{
  patch: Patch;
  reading: Readings;
  range: ReturnType<typeof createModulationRanges>;
} | null>(null);
export function ModulationProvider({
  patch,
  read,
  children,
}: {
  patch: Patch;
  read: () => Readings | undefined;
  children: ReactNode;
}) {
  const [reading, setReading] = useState<Readings>({});
  const range = useMemo(() => createModulationRanges(patch), [patch]);
  useEffect(() => {
    let frame = 0,
      last = 0;
    const tick = (at: number) => {
      if (at - last > 40) {
        last = at;
        setReading(read() ?? {});
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [read]);
  return (
    <Context.Provider value={{ patch, reading, range }}>
      {children}
    </Context.Provider>
  );
}
export function useKnobModulation(id: Param | undefined, base: number) {
  const context = useContext(Context);
  if (!context || !id) return null;
  const { reading } = context,
    meta = PARAMETER_REGISTRY[id];
  if (!meta) return null;
  const own = DYNAMIC_META[id as keyof typeof DYNAMIC_META],
    canonical = own?.canonical ?? id;
  const bounds = context.range(id, base);
  if (!bounds.routed) return null;
  const effective =
    meta.scope === "fx"
      ? reading.fx
      : reading.voice?.values[canonical] !== undefined
        ? reading.voice
        : reading.fx;
  return {
    ...bounds,
    current: effective?.values[canonical] ?? base,
    live: effective?.values[canonical] !== undefined,
  };
}
export function useEffectiveFxValues(
  values: Record<string, number>,
  slot: FxSlot,
  mode: string,
) {
  const context = useContext(Context),
    reading = context?.reading.fx?.values;
  const live = Number.isFinite(reading?.[`fx.${slot}.sampleRate`]);
  const actualMode = live
    ? (FX_SLOT_MODES[slot][Math.round(reading?.[`fx.${slot}.mode`] ?? -1)] ??
      mode)
    : mode;
  const result = context
    ? { ...values, ...fxValues(context.patch, actualMode) }
    : { ...values };
  if (live && reading) {
    for (const [key, base] of Object.entries(result)) {
      const id = `fx.${slot}.${actualMode}.${key}`,
        meta = DYNAMIC_META[id as keyof typeof DYNAMIC_META];
      result[key] = reading[id] ?? reading[meta?.canonical ?? id] ?? base;
    }
    for (const key of [
      "phase",
      "age",
      "gate",
      "bypass",
      "tempo",
      "sampleRate",
      "previousMode",
      "transition",
    ])
      result[`__${key}`] =
        reading[`fx.${slot}.${key}`] ?? result[`__${key}`] ?? 0;
  }
  return { mode: actualMode, values: result, live };
}
