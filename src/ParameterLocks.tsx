import { FILTER_DISCRETE } from "./filter-config";
import { FM_KEYS, visibleFmTarget } from "./fm-config";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { IconButton, Select } from "./components";
import { LOCK_PARAMS, PARAMS, PARAM_LABELS, MOD_TARGETS, clamp } from "./model";
import type { Numbers, Param, Patch } from "./model";

const integral = new Set<Param>(["tune", "osc2Tune", "sampleRoot", "unison", "harmonics", "wavetable", "sampleReverse", ...FILTER_DISCRETE, ...FM_KEYS.filter((key) => /(?:Wave|Mode)$/.test(key))]);
function LockValue({ label, value, min, max, integral, onChange }: {
  label: string; value: number; min: number; max: number; integral: boolean; onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(+value.toFixed(4)));
  const editing = useRef(false), cancelled = useRef(false);
  useEffect(() => { if (!editing.current) setText(String(+value.toFixed(4))); }, [value]);
  return <input aria-label={`${label} Wert`} type="number" min={min} max={max} step={integral ? 1 : "any"} value={text}
    onFocus={(e) => { editing.current = true; e.currentTarget.select(); }}
    onChange={(e) => setText(e.currentTarget.value)}
    onBlur={() => {
      const parsed = Number(text);
      const next = !cancelled.current && text.trim() && Number.isFinite(parsed) ? clamp(parsed, min, max) : value;
      editing.current = false; cancelled.current = false;
      const result = integral ? Math.round(next) : +next.toFixed(4);
      setText(String(result)); if (result !== value) onChange(result);
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; e.currentTarget.blur(); }
    }} />;
}

export function LockControls({ locks, patch, onSet }: {
  locks: Partial<Numbers>; patch: Patch; onSet: (key: Param, value: number | null) => void;
}) {
  const [addLock, setAddLock] = useState<Param>("cutoff");
  const available = LOCK_PARAMS.filter(visibleFmTarget);
  const group = (key: Param) => key in MOD_TARGETS ? MOD_TARGETS[key as keyof typeof MOD_TARGETS].group : "Track effects";
  return <>
    <span className="lock-heading"><LockKeyhole size={13} /> PARAMETER LOCKS</span>
    {Object.entries(locks).map(([name, value]) => {
      const key = name as Param, [min, max] = PARAMS[key];
      const log = min > 0 && max / min >= 100 && !integral.has(key);
      const normalized = log ? Math.log(value! / min) / Math.log(max / min) : (value! - min) / (max - min);
      const set = (v: number) => onSet(key, clamp(integral.has(key) ? Math.round(v) : +v.toFixed(4), min, max));
      return <div className="lock-chip" key={key}>
        <label>{PARAM_LABELS[key]}<input aria-label={`${PARAM_LABELS[key]} per Maus ändern`} type="range" min="0" max="1" step=".001" value={normalized} onChange={(e) => set(log ? min * (max / min) ** +e.target.value : min + +e.target.value * (max - min))} /></label>
        <LockValue label={PARAM_LABELS[key]} value={value!} min={min} max={max} integral={integral.has(key)} onChange={set} />
        <IconButton label={`${PARAM_LABELS[key]} Lock entfernen`} onClick={() => onSet(key, null)}><X size={12} /></IconButton>
      </div>;
    })}
    <div className="lock-add">
      <Select label="Parameter-Lock hinzufügen" value={addLock} onChange={(v) => setAddLock(v as Param)}>
        {[...new Set(available.map(group))].map((g) => <optgroup key={g} label={g}>{available.filter((key) => group(key) === g).map((key) => <option key={key} value={key}>{PARAM_LABELS[key]}</option>)}</optgroup>)}
      </Select>
      <button className="small-button" onClick={() => onSet(addLock, patch[addLock])}>+ Lock</button>
    </div>
  </>;
}
