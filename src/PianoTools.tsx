import { useEffect, useState } from "react";
import { Dices } from "lucide-react";
import { IconButton, Modal, Select } from "./components";
import { SCALES, clamp } from "./model";
import type { Pattern, PianoNote } from "./model";
import { generateNotes, humanizeNotes, transformNotes } from "./piano-tools";
import type { GenerateOptions, Transform } from "./piano-tools";

type Page = "generate" | "transform" | "humanize";
export default function PianoTools({ pattern, selection, page, onClose, onApply }: {
  pattern: Pattern; selection: Set<string>; page: Page; onClose: () => void; onApply: (notes: PianoNote[]) => void;
}) {
  const selectedNotes = pattern.notes.filter((n) => selection.has(n.id));
  const selectionRange = { from: Math.min(pattern.length - .001, ...selectedNotes.map((n) => n.start)), to: Math.min(pattern.length, Math.max(0, ...selectedNotes.map((n) => n.start + n.duration))) };
  const [tab, setTab] = useState(page), [scope, setScope] = useState(selectedNotes.length ? "selection" : "all");
  const [replace, setReplace] = useState(true), [preview, setPreview] = useState<PianoNote[] | null>(null), [error, setError] = useState("");
  const [options, setOptions] = useState<GenerateOptions>({ kind: "melody", from: selectedNotes.length ? selectionRange.from : 0, to: selectedNotes.length ? selectionRange.to : pattern.length, grid: 1, density: .6, pulses: 5, cycle: 16, octave: 3, octaves: 2, gate: .8, velocity: .8, order: "up" });
  const [transform, setTransform] = useState<Transform>("reverse");
  const [timing, setTiming] = useState(.08), [velocity, setVelocity] = useState(.12), [length, setLength] = useState(.08);
  useEffect(() => { setPreview(null); setError(""); }, [pattern.notes, pattern.scale, pattern.length]);
  const source = pattern.notes.filter((n) => scope === "all" || selection.has(n.id));
  const invalidate = () => { setPreview(null); setError(""); };
  const configure = (value: Partial<GenerateOptions>) => { setOptions({ ...options, ...value }); invalidate(); };
  const calculate = () => {
    try {
      let result: PianoNote[];
      if (tab === "generate") {
        if (options.to <= options.from) throw new Error("Das Ende muss hinter dem Start liegen.");
        const generated = generateNotes(options, pattern.scale, source);
        // Replace only the requested range, keeping notes beyond the loop intact.
        result = [...pattern.notes.filter((n) => !replace || n.start < options.from || n.start >= options.to || (scope === "selection" && !selection.has(n.id))), ...generated];
      } else {
        if (!source.length) throw new Error("Keine Noten im gewählten Bereich.");
        const changed = tab === "transform" ? transformNotes(source, transform, pattern.scale, options.grid) : humanizeNotes(source, timing, velocity, length);
        const byId = new Map(changed.map((n) => [n.id, n]));
        result = pattern.notes.map((n) => byId.get(n.id) ?? n);
      }
      if (result.length > 4096) throw new Error("Maximal 4096 Noten pro Pattern. Bereich oder Dichte reduzieren.");
      setPreview(result); setError(""); return result;
    } catch (e) { setError((e as Error).message); setPreview(null); return null; }
  };
  const number = (label: string, key: "from" | "to" | "grid" | "pulses" | "cycle" | "octave" | "octaves", min: number, max: number, step = 1) => <label>{label}<input type="number" min={min} max={max} step={step} value={options[key]} onChange={(e) => configure({ [key]: clamp(Math.round(+e.target.value / step) * step, min, max) })} /></label>;
  const slider = (label: string, value: number, change: (value: number) => void, max = 1) => <label>{label}<input type="range" min="0" max={max} step=".01" value={value} onChange={(e) => { change(+e.target.value); invalidate(); }} /><output>{Math.round(value * 100)}%</output></label>;
  return <Modal title="Piano-Roll-Werkzeuge" subtitle="Eine Anwendung = ein Undo-Schritt. Die Vorschau verändert dein Pattern erst nach Übernehmen." onClose={onClose} wide>
    <div className="piano-tools-dialog">
      <div className="tabs" role="tablist" aria-label="Notenwerkzeuge">{([['generate','Generieren'],['transform','Transformieren'],['humanize','Humanize']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); invalidate(); }}>{label}</button>)}</div>
      <div className="tool-settings">
        <label>Bereich<Select label="Werkzeugbereich" value={scope} onChange={(v) => { setScope(v); configure(v === "selection" ? selectionRange : { from: 0, to: pattern.length }); }}><option value="all">Gesamtes Pattern</option><option value="selection" disabled={!selectedNotes.length}>Auswahl ({selectedNotes.length})</option></Select></label>
        <span className="tool-scale">{pattern.scale.enabled ? `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][pattern.scale.root]} · ${SCALES[pattern.scale.name].label}` : "Chromatisch · Skala im Editor aktivieren"}</span>
        {tab === "generate" && <>
          <label>Generator<Select label="Generator" value={options.kind} onChange={(v) => configure({ kind: v as GenerateOptions["kind"] })}><option value="melody">Melodie</option><option value="euclidean">Euclid-Rhythmus</option><option value="arpeggio">Arpeggio aus Noten</option></Select></label>
          {number("Start (ab 0)", "from", 0, 127, .25)}{number("Ende", "to", .25, pattern.length, .25)}
          <label>Raster<Select label="Generator-Raster" value={options.grid} onChange={(v) => configure({ grid: +v })}>{[.125,.25,.5,1,2,4].map((v) => <option key={v} value={v}>{v} Steps</option>)}</Select></label>
          {(options.kind !== "arpeggio" || !source.length) && number("Oktave", "octave", -1, 8)}{options.kind !== "euclidean" && number("Oktavumfang", "octaves", 1, 3)}
          {options.kind === "melody" && slider("Dichte", options.density, (density) => configure({ density }))}
          {options.kind === "euclidean" && <>{number("Pulse", "pulses", 0, options.cycle)}<label>Zyklus<input type="number" min="1" max="32" value={options.cycle} onChange={(e) => { const cycle = clamp(Math.round(+e.target.value), 1, 32); configure({ cycle, pulses: Math.min(cycle, options.pulses) }); }} /></label></>}
          {options.kind === "arpeggio" && <label>Richtung<Select label="Arpeggio-Richtung" value={options.order} onChange={(v) => configure({ order: v as GenerateOptions["order"] })}><option value="up">Aufwärts</option><option value="down">Abwärts</option><option value="updown">Auf / Ab</option><option value="random">Zufall</option></Select></label>}
          {slider("Gate", options.gate, (gate) => configure({ gate }))}{slider("Velocity", options.velocity, (velocity) => configure({ velocity: Math.max(.01, velocity) }))}
          <label>Einfügen<Select label="Generierte Noten einfügen" value={replace ? "replace" : "add"} onChange={(v) => { setReplace(v === "replace"); invalidate(); }}><option value="replace">Noten im Bereich ersetzen</option><option value="add">Zu Noten hinzufügen</option></Select></label>
        </>}
        {tab === "transform" && <>
          <label>Transformation<Select label="Transformation" value={transform} onChange={(v) => { setTransform(v as Transform); invalidate(); }}>{([['reverse','Zeit spiegeln'],['invert','Tonhöhen spiegeln'],['legato','Legato'],['double','Zeit ×2'],['half','Zeit ÷2'],['rotateLeft','Nach links rotieren'],['rotateRight','Nach rechts rotieren'],['quantize','Zeit / Länge quantisieren'],['scale','In Skala verschieben']] as const).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
          <label>Raster / Versatz<Select label="Transformationsraster" value={options.grid} onChange={(v) => configure({ grid: +v })}>{[.125,.25,.5,1,2,4].map((v) => <option key={v} value={v}>{v} Steps</option>)}</Select></label>
        </>}
        {tab === "humanize" && <>{slider("Timing (± eines Steps)", timing, setTiming, .45)}{slider("Velocity (±)", velocity, setVelocity, .5)}{slider("Länge (±)", length, setLength, .5)}</>}
      </div>
      <div className="tool-preview" aria-label="Notenvorschau">
        {preview ? <svg viewBox="0 0 720 130" role="img" aria-label={`${preview.length} Noten nach Anwendung`} preserveAspectRatio="none">{preview.map((n) => <rect key={n.id} x={n.start / 128 * 720} y={123 - n.note / 127 * 118} width={Math.max(1, Math.min(n.duration, 128 - n.start) / 128 * 720)} height="3" opacity={.4 + n.velocity * .6} />)}</svg> : <p>Vorschau erzeugen, um das Ergebnis vor dem Übernehmen zu sehen.</p>}
      </div>
      <div className="tool-result" role="status">{error || (preview ? `${pattern.notes.length} → ${preview.length} Noten · Vorschau über 128 Steps` : `${source.length} vorhandene Noten im gewählten Bereich`)}</div>
      <div className="migration-actions"><button className="small-button" onClick={onClose}>Abbrechen</button><IconButton label="Neue Vorschau erzeugen" onClick={calculate}><Dices size={16} /></IconButton><button className="small-button" onClick={calculate}>Vorschau</button><button className="primary-button" onClick={() => { const result = preview ?? calculate(); if (result) { onApply(result); onClose(); } }}>Übernehmen</button></div>
    </div>
  </Modal>;
}
