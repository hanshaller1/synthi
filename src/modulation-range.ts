import type { Param, Patch } from "./model";
import { MOD_SOURCES } from "./modulation-spec";
import type { ModSourceMeta } from "./modulation-spec";
import { DYNAMIC_META } from "./parameter-spec";
import {
  getParameter,
  modulationValue,
  PARAMETER_REGISTRY,
  routeCurve,
} from "./parameters";

type Interval = { min: number; max: number; routed: boolean };
/** Conservative intervals, not a prediction of phase-correlated trajectories. */
export function createModulationRanges(p: Patch) {
  const canonical = (id: string) =>
    DYNAMIC_META[id as keyof typeof DYNAMIC_META]?.canonical ?? id;
  const groups = new Map<string, Patch["mods"]>();
  for (const route of p.mods) {
    if (!route.amount) continue;
    const id = canonical(route.target);
    const list = groups.get(id) ?? [];
    list.push(route);
    groups.set(id, list);
  }
  const cache = new Map<string, Interval>(),
    visiting = new Set<string>();
  const sourceRange = (source: string): [number, number] => {
    const meta=(MOD_SOURCES as Record<string,ModSourceMeta>)[source];
    if(meta?.depth){
      const depth=range(meta.depth as Param),polarity=meta.polarity?range(meta.polarity as Param):{min:0};
      return [Math.min(0,depth.min,polarity.min<.5?-depth.max:0),Math.max(0,depth.max,polarity.min<.5?-depth.min:0)];
    }
    if(meta?.parameter){const v=range(meta.parameter as Param);return [v.min,v.max];}
    // Missing future source metadata gives a full conservative parameter span.
    // Actual markers always come from the audio/control processors.
    return meta?.range?[...meta.range]:[-Infinity,Infinity];
  };
  function range(id: Param, base = getParameter(p, id)): Interval {
    const key = canonical(id) as Param,
      meta = PARAMETER_REGISTRY[key];
    const cacheKey = `${key}:${base}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    if (!meta) return { min: base, max: base, routed: false };
    if (visiting.has(key))
      return { min: meta.min, max: meta.max, routed: true };
    visiting.add(key);
    let low = 0,
      high = 0,
      routed = false;
    for (const route of groups.get(key) ?? []) {
      const condition = DYNAMIC_META[route.target as keyof typeof DYNAMIC_META];
      const conditional = !!condition?.canonical && !!condition.variant;
      const [min, max] = sourceRange(route.source);
      const a = routeCurve(min, route.curve) * route.amount,
        b = routeCurve(max, route.curve) * route.amount;
      // Variant conditions may change through routes or sequencer locks. Include
      // both activation and zero contribution; simultaneous extrema are theoretical.
      low += Math.min(a, b, conditional ? 0 : Infinity);
      high += Math.max(a, b, conditional ? 0 : -Infinity);
      routed = true;
    }
    visiting.delete(key);
    const scale = meta.trigger && meta.options ? 2 : 1;
    const effectiveMeta = p.modVersion===1
      ? {...meta,scale:"linear" as const,...(key==="cutoff"?{amountScale:Math.min(6000,base*2)}:{})}
      : meta;
    let min = modulationValue(base, low * scale, effectiveMeta),
      max = modulationValue(base, high * scale, effectiveMeta);
    if (meta.options && routed) {
      const nearest = (v: number) =>
        meta.options!.reduce(
          (best, o) =>
            Math.abs(o.value - v) < Math.abs(best - v) ? o.value : best,
          meta.options![0].value,
        );
      const a = nearest(min),
        b = nearest(max);
      min = Math.min(a, b);
      max = Math.max(a, b);
    }
    // Include the baseline traversed during smoothed activation/deactivation.
    min = Math.min(base, min);
    max = Math.max(base, max);
    const result = { min, max, routed };
    cache.set(cacheKey, result);
    return result;
  }
  return range;
}
