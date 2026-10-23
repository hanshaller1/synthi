import { useId } from "react";
import type { ReactNode } from "react";
import { Select, Waveform, formatHz, formatTime, percent } from "./components";
import { FM_ALGORITHMS, FM_OPERATORS, FM_OP_KEYS, FM_WAVES, fmCurve } from "./fm-config";
import type { FmOperator } from "./fm-config";
import type { Param, Patch } from "./model";

type Controls = {
  patch: Patch; op: FmOperator; setOp: (op: FmOperator) => void;
  onParam: (key: Param, value: number) => void; onCheckpoint: () => void; onLearn: (key: Param) => void;
  knob: (key: Param, label: string, format?: (v: number) => string, log?: boolean, step?: number) => ReactNode;
};
function OperatorTabs({ value, onChange, label }: { value: FmOperator; onChange: (op: FmOperator) => void; label: string }) {
  return <div className="fm-operator-tabs" role="tablist" aria-label={label}>
    {FM_OPERATORS.map((op) => <button type="button" key={op} role="tab" aria-selected={value === op} className={value === op ? "active" : ""} onClick={() => onChange(op)}>OP {op}</button>)}
  </div>;
}
export function FmOscillator({ patch: p, op, setOp, onParam, onCheckpoint, onLearn, knob }: Controls) {
  const k = FM_OP_KEYS[op], algorithm = FM_ALGORITHMS.find((a) => a.id === p.fmAlgorithm)!;
  const edges = algorithm.edges.filter((edge) => edge[0] === op);
  const wave = FM_WAVES[Math.round(p[k.wave])];
  const role = [...(edges.length ? ["MODULATOR"] : []), ...((algorithm.out as readonly number[]).includes(op) ? ["OUT"] : [])].join(" · ");
  return <div className="fm-oscillator">
    <OperatorTabs value={op} onChange={setOp} label="FM-Oszillator auswählen" />
    <div className="source-slot">
      <div className="source-display"><span className="source-caption">OP {op} · {role || "NICHT VERBUNDEN"}</span><Waveform patch={{ ...p, engine: "subtractive", wave }} /></div>
      <Select label={`OP ${op} Waveform`} onLearn={() => onLearn(k.wave)} value={p[k.wave]} onChange={(v) => { onCheckpoint(); onParam(k.wave, +v); }}>{FM_WAVES.map((name, i) => <option key={name} value={i}>{name}</option>)}</Select>
    </div>
    <Select label={`OP ${op} Frequenzmodus`} onLearn={() => onLearn(k.mode)} value={p[k.mode]} onChange={(v) => { onCheckpoint(); onParam(k.mode, +v); }}><option value="0">Ratio · folgt der Note</option><option value="1">Fixed Hz · feste Frequenz</option></Select>
    <div className="fm-knob-grid">
      {p[k.mode] >= .5 ? knob(k.hz, `OP ${op} Fixed Hz`, formatHz, true) : knob(k.ratio, `OP ${op} Ratio`, (v) => `${v.toFixed(3)}×`, true)}
      {knob(k.fine, `OP ${op} Fine`, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} ct`)}
      {knob(k.level, `OP ${op} Level`, percent)}
      {knob(k.feedback, `OP ${op} Feedback`, percent)}
    </div>
    {edges.length > 0 && <div className="fm-index-section"><span className="synthesis-subheading">MODULATIONSTIEFE</span><div className="fm-index-controls">
      {edges.map(([source, destination, key]) => knob(key, `OP ${source} → OP ${destination}`, (v) => v.toFixed(2)))}
    </div></div>}
  </div>;
}
function Routing({ patch: p }: { patch: Patch }) {
  const id = useId().replaceAll(":", ""), a = FM_ALGORITHMS.find((v) => v.id === p.fmAlgorithm)!;
  const positions = { 1: [145, 108], 2: [145, 28], 3: [35, 28] } as const;
  const modulationPath = (source: number, destination: number) => source === 3 && destination === 2 ? "M70 28H110" : source === 3 ? "M35 48V108H110" : "M145 48V88";
  const outPaths: Record<number, string> = { 1: "M180 108H248", 2: "M180 28H230V97H248", 3: "M35 48V152H285V128" };
  return <figure className="fm-routing">
    <svg viewBox="-4 -5 334 170" role="img" aria-label={`${a.label}: ${a.description}`}>
      <defs><marker id={`${id}-mod`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="currentColor" /></marker><marker id={`${id}-out`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="currentColor" /></marker></defs>
      {a.edges.map(([source, destination, key]) => <path className="fm-route-mod" key={key} d={modulationPath(source, destination)} markerEnd={`url(#${id}-mod)`} />)}
      {a.out.map((op) => <path className="fm-route-out" key={op} d={outPaths[op]} markerEnd={`url(#${id}-out)`} />)}
      {FM_OPERATORS.map((op) => { const [x, y] = positions[op]; return <g key={op} className={(a.out as readonly number[]).includes(op) ? "carrier" : "modulator"}><rect x={x - 35} y={y - 20} width="70" height="40" rx="5" /><text x={x} y={y + 5}>OP {op}</text></g>; })}
      <g className="fm-output"><rect x="248" y="88" width="75" height="40" rx="5" /><text x="285" y="113">OUT</text></g>
    </svg><figcaption>{a.description}</figcaption>
  </figure>;
}
function OperatorEnvelope({ patch: p, op }: { patch: Patch; op: FmOperator }) {
  const k = FM_OP_KEYS[op], a = p[k.attack], d = p[k.decay], s = p[k.sustain], r = p[k.release];
  const durations = [a, d, .5, r].map((v) => v === 0 ? 0 : Math.max(.12, v)), total = durations.reduce((sum, v) => sum + v, 0);
  let x = 5;
  const points = ["5,85"];
  for (let stage = 0; stage < 4; stage++) {
    const width = durations[stage] / total * 290;
    for (let i = 1; i <= 40; i++) {
      const t = i / 40;
      const y = stage === 0 ? fmCurve(t, p[k.attackCurve]) : stage === 1 ? 1 + (s - 1) * fmCurve(t, p[k.decayCurve]) : stage === 2 ? s : s * (1 - fmCurve(t, p[k.releaseCurve]));
      points.push(`${x + width * t},${85 - y * 78}`);
    }
    x += width;
  }
  return <svg className="fm-envelope-graph" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label={`OP ${op} ADSR · Attack ${formatTime(a)}, Decay ${formatTime(d)}, Sustain ${percent(s)}, Release ${formatTime(r)}`}><path className="fm-envelope-baseline" d="M5 85H295" /><polyline points={points.join(" ")} /></svg>;
}
export function FmCharacter({ patch: p, op, setOp, knob, onAlgorithm }: Controls & { onAlgorithm: (id: Patch["fmAlgorithm"]) => void }) {
  const k = FM_OP_KEYS[op];
  return <div className="fm-character">
    <Select label="FM-Algorithmus" value={p.fmAlgorithm} onChange={(id) => onAlgorithm(id as Patch["fmAlgorithm"])}>{FM_ALGORITHMS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select>
    <Routing patch={p} />
    <div className="fm-envelope-section">
      <span className="synthesis-subheading">OPERATOR ENVELOPE</span>
      <OperatorTabs value={op} onChange={setOp} label="FM-Operator-Hüllkurve auswählen" />
      <OperatorEnvelope patch={p} op={op} />
      <div className="fm-adsr-controls">
        {knob(k.attack, "Attack", formatTime)}{knob(k.decay, "Decay", formatTime, true)}{knob(k.sustain, "Sustain", percent)}{knob(k.release, "Release", formatTime, true)}
      </div>
      <div className="fm-curve-controls">
        {(["attackCurve", "decayCurve", "releaseCurve"] as const).map((key, i) => knob(k[key], ["Attack curve", "Decay curve", "Release curve"][i], (v) => Math.abs(v) < .01 ? "Linear" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`))}
      </div>
    </div>
    <p className="fm-articulation-note">Routing, Waveform, Frequenzmodus und ADSR gelten ab dem nächsten Anschlag.</p>
  </div>;
}
