import { ModulationPatchScope } from "./modulation-ui";
import { getParameter, PARAMETER_REGISTRY } from "./parameters";
import { ENGINE_DISCRETE, sampleSliceSelection } from "./engine-config";
import { FILTER_DISCRETE } from "./filter-config";
import { FM_KEYS, visibleFmTarget } from "./fm-config";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { IconButton, Select, Slider } from "./components";
import { LOCK_PARAMS, PARAMS, PARAM_LABELS, clamp } from "./model";
import type { Numbers, Param, Patch } from "./model";

const integral = new Set<Param>(["tune", "osc2Tune", "sampleRoot", "unison", "harmonics", "wavetable", "sampleReverse", ...FILTER_DISCRETE, ...ENGINE_DISCRETE, ...FM_KEYS.filter((key) => /(?:Wave|Mode)$/.test(key))]);
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
  const group = (key: Param) => PARAMETER_REGISTRY[key].group;
  return <ModulationPatchScope patch={patch} locks={locks}>
    <span className="lock-heading"><LockKeyhole size={13} /> PARAMETER LOCKS</span>
    {Object.entries(locks).map(([name, value]) => {
      const key = name as Param, min = PARAMS[key][0], max = key === "sampleSlice" ? sampleSliceSelection(locks.sampleSlices ?? patch.sampleSlices, 0).sampleSlices - 1 : PARAMS[key][1];
      const log = min > 0 && max / min >= 100 && !integral.has(key);
      const set = (v:number) => {const options=PARAMETER_REGISTRY[key].options;let next=clamp(integral.has(key)?Math.round(v):+v.toFixed(4),min,max);if(options)next=options.reduce((best,o)=>Math.abs(o.value-next)<Math.abs(best-next)?o.value:best,options[0].value);onSet(key,next);};
      return <div className="lock-chip" key={key}>
        <label>{PARAM_LABELS[key]}<Slider aria-label={`${PARAM_LABELS[key]} per Maus ändern`} parameterId={key} min={min} max={max} log={log} step={integral.has(key)?1:0} value={value!} format={v=>String(+v.toFixed(4))} onChange={set} /></label>
        {PARAMETER_REGISTRY[key].options ? <Select label={`${PARAM_LABELS[key]} Lock-Wert`} value={value!} onChange={(v) => set(+v)}>{PARAMETER_REGISTRY[key].options!.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select> : <LockValue label={PARAM_LABELS[key]} value={value!} min={min} max={max} integral={integral.has(key)} onChange={set} />}
        <IconButton label={`${PARAM_LABELS[key]} Lock entfernen`} onClick={() => onSet(key, null)}><X size={12} /></IconButton>
      </div>;
    })}
    <div className="lock-add">
      <Select label="Parameter-Lock hinzufügen" value={addLock} onChange={(v) => setAddLock(v as Param)}>
        {[...new Set(available.map(group))].map((g) => <optgroup key={g} label={g}>{available.filter((key) => group(key) === g).map((key) => <option key={key} value={key}>{PARAM_LABELS[key]}</option>)}</optgroup>)}
      </Select>
      <button className="small-button" onClick={() => onSet(addLock, getParameter(patch,addLock))}>+ Lock</button>
    </div>
  </ModulationPatchScope>;
}
