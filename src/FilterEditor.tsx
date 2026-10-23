import { useState } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Select, formatHz, formatTime, percent } from "./components";
import { MULTIMODE_FILTERS } from "./model";
import type { FilterType, MultimodeFilter, Param, Patch } from "./model";
import { FILTER_CHARACTERS, filterFrequencyAt, filterReleaseFrequencyAt, filterLevels } from "./filter-config";
import FilterResponse from "./FilterResponse";

type Props = {
  patch: Patch; locks: Partial<Record<Param, number>>; sampleRate: number;
  onPatch: (patch: Partial<Patch>) => void; onParam: (key: Param, value: number) => void;
  onCheckpoint: () => void; onLearn: (key: Param) => void;
  knob: (key: Param, label: string, format?: (v: number) => string, log?: boolean, step?: number) => ReactNode;
};
const signed = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`;
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
function FilterEnvelope({ patch: p, velocity }: { patch: Patch; velocity: number }) {
  const { base, peak, sustain } = filterLevels(p, velocity);
  const hold = Math.max(.15, (p.filterAttack + p.filterDecay + p.filterRelease) * .25);
  const releaseAt = p.filterAttack + p.filterDecay + hold, total = releaseAt + p.filterRelease;
  const y = (hz: number) => 48 - Math.log(hz / 20) / Math.log(1000) * 40;
  const path = Array.from({ length: 241 }, (_, i) => {
    const t = total * i / 240;
    const hz = t <= releaseAt ? filterFrequencyAt(p, t, velocity) : filterReleaseFrequencyAt(p, sustain, t - releaseAt);
    return `${i ? "L" : "M"}${(i / 240 * 250).toFixed(2)},${y(hz).toFixed(2)}`;
  }).join(" ");
  return <div className="envelope-graph filter-envelope-graph">
    <svg viewBox="0 0 250 60" preserveAspectRatio="none" role="img" aria-label={`Filter-Hüllkurve: Basis ${formatHz(base)}, Peak ${formatHz(peak)}, Sustain ${formatHz(sustain)}`}>
      <line x1="0" x2="250" y1={y(base)} y2={y(base)} stroke="currentColor" opacity=".2" strokeDasharray="2 3" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <text x="0" y="59">A</text><text x={250 * p.filterAttack / total} y="59">D</text><text x={250 * (p.filterAttack + p.filterDecay) / total} y="59">S</text><text x={250 * releaseAt / total} y="59">R</text>
    </svg>
    <div className="filter-envelope-values"><span>BASE {formatHz(base)}</span><span>PEAK {formatHz(peak)}</span><span>SUSTAIN {formatHz(sustain)}</span></div>
  </div>;
}
export default function FilterEditor({ patch, locks, sampleRate, onPatch, onParam, onCheckpoint, onLearn, knob }: Props) {
  const p = { ...patch, ...locks }, comb = p.filterType === "comb", peak = p.filterType === "multimode" && p.multimodeType === "peak";
  const [previewNote, setPreviewNote] = useState(60), [previewVelocity, setPreviewVelocity] = useState(1);
  const discrete = (key: Param, label: string, options: readonly string[]) => <Select label={label} value={p[key]} onChange={(v) => { onCheckpoint(); onParam(key, +v); }} onLearn={() => onLearn(key)}>{options.map((text, i) => <option key={i} value={i}>{text}</option>)}</Select>;
  return <section className="module filter-module" data-filter={p.filterType}>
    <div className="module-title"><h3><SlidersHorizontal size={14} /> Filter</h3><span className="module-index">03</span></div>
    <details className="filter-section base-width-section">
      <summary onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") e.stopPropagation(); }}>BASE-WIDTH <span>{p.baseWidthEnabled >= .5 ? "ON" : "BYPASS"}</span></summary>
      <button type="button" className={`small-button ${p.baseWidthEnabled >= .5 ? "on" : ""}`} aria-pressed={p.baseWidthEnabled >= .5} onClick={() => { onCheckpoint(); onParam("baseWidthEnabled", p.baseWidthEnabled >= .5 ? 0 : 1); }} onContextMenu={(e) => { e.preventDefault(); onLearn("baseWidthEnabled"); }} title="Sanfter 6-dB-Hochpass und Tiefpass vor dem Main Filter · Rechtsklick: MIDI Learn">Base-Width {p.baseWidthEnabled >= .5 ? "On" : "Bypass"}</button>
      <div className="filter-knob-grid">{knob("baseWidthBase", "Base", (v) => v <= 10 ? "Open" : formatHz(v), true)}{knob("baseWidthWidth", "Width", (v) => v >= 12 ? "Open" : `${v.toFixed(2)} oct`)}</div>
      <p className="filter-hint">Base = untere Grenze · obere Grenze = Base × 2^Width. Beide auf Open: klangneutral.</p>
    </details>
    <div className="filter-select-grid">
      <Select label="Main Filter-Typ" value={p.filterType} onChange={(v) => { onCheckpoint(); onPatch({ filterType: v as FilterType }); }}>
        <option value="lowpass">LP 12 dB</option><option value="highpass">HP 12 dB</option><option value="bandpass">Bandpass</option><option value="notch">Notch</option><option value="multimode">Multimode</option><option value="comb" disabled={typeof AudioWorkletNode === "undefined"}>Comb</option>
      </Select>
      {comb ? discrete("combMode", "Comb-Betriebsart", ["Feedback", "Feedforward"]) : discrete("filterCharacter", "Filter-Charakteristik", FILTER_CHARACTERS)}
      {p.filterType === "multimode" && <Select label="Multimode-Filter" value={p.multimodeType} onChange={(v) => { onCheckpoint(); onPatch({ multimodeType: v as MultimodeFilter, filterVersion: 2 }); }}>{MULTIMODE_FILTERS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}
      {comb && <Select label="Comb-Polarität" value={p.combPolarity} onChange={(v) => { onCheckpoint(); onPatch({ combPolarity: v as Patch["combPolarity"] }); }}><option value="positive">Positive +</option><option value="negative">Negative −</option></Select>}
    </div>
    <FilterResponse patch={p} sampleRate={sampleRate} note={previewNote} velocity={previewVelocity} />
    <div className="filter-preview-controls" title="Statische Vorschau ohne LFOs oder Modulationsmatrix; Keytracking und Velocity werden berücksichtigt.">
      <Select label="Vorschau-Note" value={previewNote} onChange={(v) => setPreviewNote(+v)}>{[36, 48, 60, 72, 84].map((note) => <option key={note} value={note}>C{note / 12 - 1}</option>)}</Select>
      <Select label="Vorschau-Velocity" value={previewVelocity} onChange={(v) => setPreviewVelocity(+v)}>{[32, 64, 96, 127].map((vel) => <option key={vel} value={vel / 127}>Vel {vel}</option>)}</Select>
    </div>
    <div className="filter-knob-grid">
      {knob("cutoff", comb ? "Frequency" : "Cutoff", formatHz, true)}
      {comb ? knob("combFeedback", p.combMode >= .5 ? "Feedforward" : "Feedback") : peak ? knob("filterPeakGain", "Peak gain", db) : knob("resonance", "Resonance", (v) => percent(v / 20))}
      {peak && p.filterCharacter > 0 && knob("resonance", "Resonance", (v) => percent(v / 20))}
      {!comb && p.multimodeType === "morph" && p.filterType === "multimode" && knob("filterMorph", "Morph", (v) => v < .5 ? `LP → BP ${Math.round(v * 200)}%` : `BP → HP ${Math.round((v - .5) * 200)}%`)}
    </div>
    <details className="filter-section">
      <summary onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") e.stopPropagation(); }}>{comb ? "COMB CHARACTER" : "MAIN CHARACTER"}</summary>
      <div className="filter-knob-grid">
        {comb ? <>
          {knob("combDamping", "Damping", formatHz, true)}{knob("combMix", "Comb mix")}
          {knob("combGain", "Resonance gain", db)}{knob("combKeytrack", "Keytrack")}
          {knob("combFine", "Fine tune", (v) => `${signed(v)} ct`)}{knob("combSpread", "Stereo spread", (v) => `${v.toFixed(1)} ct`)}
          {knob("combHighpass", "Feedback HP", (v) => v < 1 ? "Off" : formatHz(v))}{knob("combSaturation", "Feedback sat.")}
        </> : <>{knob("filterKeytrack", "Keytrack")}{knob("filterCompensation", "Res. comp.")}</>}
        {knob("filterMix", "Filter mix")}{knob("drive", "Drive")}
      </div>
      <div className="filter-select-grid">{comb && discrete("combInterpolation", "Comb-Interpolation", ["Legacy · Linear", "HD · Lagrange"])}{discrete("drivePosition", "Drive-Position", ["Drive · Pre", "Drive · Post"])}</div>
      <p className="filter-hint">Keytrack: 100 % = eine Oktave je 12 Halbtöne, Referenz C4.{comb ? " Feedback HP und Saturation wirken nur im Feedback-Modus. Resonance gain verstärkt den Wet-Pfad; Schutzbegrenzung aktiv." : " Classic erhält die bisherige Abstimmung. Ladder / Acid färben pegelabhängig; Notch / Peak verwenden resonante Biquads."}</p>
    </details>
    <div className="filter-envelope-title"><label onContextMenu={(e) => { e.preventDefault(); onLearn("filterAmount"); }} title="Filter-Hüllkurventiefe in Oktaven · Rechtsklick: MIDI Learn">ENV DEPTH<input aria-label="Filter Env depth" type="range" min="-6" max="6" step=".01" value={p.filterAmount} onPointerDown={onCheckpoint} onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) onCheckpoint(); }} onChange={(e) => onParam("filterAmount", +e.target.value)} /><output>{p.filterAmount > 0 ? "+" : ""}{p.filterAmount.toFixed(2)} oct</output></label></div>
    <FilterEnvelope patch={p} velocity={previewVelocity} />
    <div className="filter-knob-grid filter-adsr-grid">{(["filterAttack", "filterDecay", "filterSustain", "filterRelease"] as const).map((key, i) => knob(key, ["Attack", "Decay", "Sustain", "Release"][i], i === 2 ? percent : formatTime, i !== 2))}</div>
    <details className="filter-section"><summary onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") e.stopPropagation(); }}>ENVELOPE CHARACTER</summary><div className="filter-knob-grid">{knob("filterAttackCurve", "Attack curve", signed)}{knob("filterDecayCurve", "Decay curve", signed)}{knob("filterReleaseCurve", "Release curve", signed)}{knob("filterVelocity", "Velocity → depth")}</div><p className="filter-hint">Curves 0: bisheriger Verlauf. Negative Werte: schneller Anfang; positive: langsamer Anfang. Velocity 0: konstante Tiefe, 100 %: anschlagsabhängig. Peak und Sustain zeigen die Cutoff-Hüllkurve vor Keytracking.</p></details>
  </section>;
}
