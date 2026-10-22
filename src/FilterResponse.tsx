import { useId, useMemo } from "react";
import { filterMagnitude } from "./filters";
import { clamp, MULTIMODE_FILTERS } from "./model";
import type { Param, Patch } from "./model";

export default function FilterResponse({
  patch,
  locks,
}: {
  patch: Patch;
  locks: Partial<Record<Param, number>>;
}) {
  const gradient = useId();
  const path = useMemo(() => {
    const p = { ...patch, ...locks };
    return Array.from({ length: 801 }, (_, i) => {
      const hz = 20 * 1000 ** (i / 800);
      const db = 20 * Math.log10(Math.max(0.00001, filterMagnitude(p, hz)));
      return `${i ? "L" : "M"}${((i / 800) * 250).toFixed(2)},${(clamp((24 - db) / 72, 0, 1) * 60).toFixed(2)}`;
    }).join(" ");
  }, [patch, locks]);
  const mode =
    patch.filterType === "comb"
      ? `COMB ${patch.combPolarity === "negative" ? "−" : "+"}`
      : patch.filterType === "multimode"
        ? MULTIMODE_FILTERS.find((m) => m.id === patch.multimodeType)!.label
        : "2-POLE";
  return (
    <div className="filter-response">
      <div className="display-meta">
        <span>FREQUENCY RESPONSE</span>
        <span>{mode}</span>
      </div>
      <svg
        viewBox="0 0 250 60"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${mode} Frequenzgang, Grundstellung ohne Modulation`}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".2" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 75, 125, 175, 225].map((x) => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1="0"
            y2="60"
            stroke="currentColor"
            opacity=".08"
          />
        ))}
        <line
          x1="0"
          x2="250"
          y1="20"
          y2="20"
          stroke="currentColor"
          opacity=".18"
          strokeDasharray="2 3"
        />
        <path d={`${path} L250 60 L0 60 Z`} fill={`url(#${gradient})`} />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="display-meta">
        <span>20 Hz</span>
        <span>0 dB ···</span>
        <span>20 kHz</span>
      </div>
    </div>
  );
}
