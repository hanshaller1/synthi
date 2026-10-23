import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { Copy, ClipboardPaste, Trash2, Undo2, Redo2, Minus, Plus, Filter, Wand2, FlipHorizontal2, Shuffle, Pencil, MousePointer2, Eraser, Hand, CopyPlus, Grid2X2, LocateFixed, Play, Pause, Square, Repeat2 } from "lucide-react";
import { IconButton, Select } from "./components";
import { MAX_STEPS, SCALES, pianoRange, clamp, clone, noteName } from "./model";
import type { ScaleConfig, Condition, Patch, Pattern, PianoNote } from "./model";
import { makeNote, newNoteId } from "./sequence";
import { inScale, scalePitch } from "./piano-tools";
import PianoTools from "./PianoTools";
import { LockControls } from "./ParameterLocks";

type Props = {
  pattern: Pattern; patch: Patch; color: string; playing: boolean; playhead: number;
  playbackState: "stopped" | "playing" | "paused";
  onPlay: () => void; onPause: () => void; onStop: () => void;
  onPlayback: (range: NonNullable<Pattern["pianoPlayback"]>) => void;
  onScale: (scale: ScaleConfig) => void;
  onChange: (notes: PianoNote[]) => void;
  onAudition: (note: number, velocity: number) => void;
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
  clipboard: PianoNote[]; onClipboard: (notes: PianoNote[]) => void;
  getPosition: () => number | null;
};
type Gesture = {
  kind: "draw" | "move" | "left" | "right" | "select" | "velocity" | "pan";
  x: number; y: number; base: PianoNote[]; ids: Set<string>; changed: boolean;
  originals: PianoNote[]; pointer: number; scrollLeft?: number; scrollTop?: number; preview?: string;
};
const KEY = 58, TOP = 42;
const black = (note: number) => [1, 3, 6, 8, 10].includes(note % 12);
export default function PianoRoll(p: Props) {
  const [selected, setSelected] = useState(new Set<string>());
  const [rowHeight, setRowHeight] = useState(20), [fold, setFold] = useState(false);
  const [toolDialog, setToolDialog] = useState<"generate" | "transform" | "humanize" | null>(null);
  const closeTools = useCallback(() => setToolDialog(null), []);
  const [snap, setSnap] = useState(0.25), [zoom, setZoom] = useState(48);
  const [tool, setTool] = useState<"draw" | "select" | "erase" | "pan">("draw");
  const [defaultLength, setDefaultLength] = useState(1), [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState<PianoNote[] | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [follow, setFollow] = useState(true), [message, setMessage] = useState("");
  const [rangeDraft, setRangeDraft] = useState<Pattern["pianoPlayback"]>();
  const range = rangeDraft ?? pianoRange(p.pattern);
  const rangeRef = useRef(range); rangeRef.current = range;
  const marker = useRef<"start" | "end" | null>(null);
  const viewport = useRef<HTMLDivElement>(null), grid = useRef<HTMLDivElement>(null);
  const playline = useRef<HTMLDivElement>(null), velocityViewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null), draftRef = useRef<PianoNote[] | null>(null);
  const latest = useRef(p); latest.current = p;
  const notes = draft ?? p.pattern.notes;
  const scale = p.pattern.scale;
  const rows = useMemo(() => {
    const used = new Set(p.pattern.notes.map((n) => n.note));
    if (!used.size) used.add(scalePitch(60, scale));
    return Array.from({ length: 128 }, (_, i) => 127 - i).filter((n) => !fold || used.has(n) || (scale.enabled && inScale(n, scale)));
  }, [fold, p.pattern.notes, scale]);
  const rowIndex = (note: number) => rows.indexOf(note);
  const pitchAt = (y: number) => scalePitch(rows[clamp(Math.floor(y / rowHeight), 0, rows.length - 1)], scale);
  const zoomAnchor = useRef<{ unit?: number; x?: number; row?: number; y?: number } | null>(null);
  const rulerDrag = useRef<{ x: number; y: number; zoom: number; unit: number; changed: boolean } | null>(null);
  const audition = (value: PianoNote[]) => { for (const n of value.slice(0, 8)) p.onAudition(n.note, n.velocity); };
  const zoomAt = (next: number, x?: number, nextHeight?: number, y?: number) => {
    const v = viewport.current; if (!v) return;
    const ax = x ?? (v.clientWidth - KEY) / 2, ay = y ?? (v.clientHeight - TOP) / 2;
    zoomAnchor.current = { unit: (v.scrollLeft + ax) / zoom, x: ax, row: (v.scrollTop + ay) / rowHeight, y: ay };
    setZoom(clamp(next, 4, 240));
    if (nextHeight !== undefined) setRowHeight(clamp(nextHeight, 10, 48));
  };
  useLayoutEffect(() => {
    const v = viewport.current, anchor = zoomAnchor.current;
    if (!v || !anchor) return;
    if (anchor.unit !== undefined) v.scrollLeft = anchor.unit * zoom - anchor.x!;
    if (anchor.row !== undefined) v.scrollTop = anchor.row * rowHeight - anchor.y!;
    zoomAnchor.current = null;
  }, [zoom, rowHeight]);
  const fit = () => {
    const v = viewport.current; if (!v) return;
    zoomAnchor.current = { unit: 0, x: 0 };
    const next = clamp((v.clientWidth - KEY - 18) / p.pattern.length, 4, 240);
    setZoom(next); v.scrollLeft = 0;
  };
  useEffect(() => {
    const v = viewport.current; if (!v) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) return;
      e.preventDefault();
      const rect = v.getBoundingClientRect(), factor = Math.exp(-e.deltaY * .008);
      zoomAt(e.altKey ? zoom : zoom * factor, e.clientX - rect.left - KEY, e.altKey ? rowHeight * factor : undefined, e.clientY - rect.top - TOP);
    };
    v.addEventListener("wheel", wheel, { passive: false });
    return () => v.removeEventListener("wheel", wheel);
  }, [zoom, rowHeight]);
  const selection = notes.filter((n) => selected.has(n.id)), first = selection[0];
  const units = Math.max(p.pattern.length, Math.ceil(Math.max(0, ...notes.map((n) => n.start + Math.min(n.duration, MAX_STEPS - n.start)))));
  const width = units * zoom;
  const quantize = (value: number) => snap ? Math.round(value / snap) * snap : Math.round(value * 1000) / 1000;
  const minimum = snap || 0.01;
  const previewDraft = (value: PianoNote[] | null) => { draftRef.current = value; setDraft(value); };
  const commit = (value: PianoNote[]) => {
    if (value.length > 4096) { setMessage("Maximal 4096 Noten pro Pattern."); return; }
    p.onChange(value); setMessage("");
  };
  const editSelected = (partial: Partial<PianoNote>) => {
    const value = notes.map((n) => selected.has(n.id) ? { ...n, ...partial } : n);
    if (partial.note !== undefined || partial.start !== undefined) audition(value.filter((n) => selected.has(n.id)));
    commit(value);
  };
  const remove = () => { commit(notes.filter((n) => !selected.has(n.id))); setSelected(new Set()); };
  const copy = () => { p.onClipboard(clone(selection)); setMessage(`${selection.length} Noten kopiert.`); };
  const insert = (source: PianoNote[], at: number) => {
    if (!source.length) return;
    const origin = Math.min(...source.map((n) => n.start));
    const maxStart = Math.max(...source.map((n) => n.start));
    const offset = clamp(at - origin, -origin, (MAX_STEPS - .001) - maxStart);
    const groups = new Map<string, string>();
    const added = source.map((n) => {
      if (n.group && !groups.has(n.group)) groups.set(n.group, newNoteId());
      return { ...clone(n), id: newNoteId(), start: n.start + offset, group: n.group ? groups.get(n.group) : undefined };
    });
    commit([...notes, ...added]); setSelected(new Set(added.map((n) => n.id)));
  };
  const duplicate = () => insert(selection, Math.max(0, ...selection.map((n) => n.start + n.duration)));
  const transpose = (semitones: number) => {
    if (!selection.length) return;
    const delta = clamp(semitones, -Math.min(...selection.map((n) => n.note)), 127 - Math.max(...selection.map((n) => n.note)));
    const nextPitch = (pitch: number) => {
      if (!scale.enabled || Math.abs(delta) !== 1) return scalePitch(pitch + delta, scale);
      // Arrow keys advance to the next degree instead of getting stuck between tones.
      for (let next = pitch + delta; next >= 0 && next <= 127; next += delta) if (inScale(next, scale)) return next;
      return pitch;
    };
    const value = notes.map((n) => selected.has(n.id) ? { ...n, note: nextPitch(n.note) } : n);
    audition(value.filter((n) => selected.has(n.id))); commit(value);
  };
  const point = (e: PointerEvent<HTMLElement>) => {
    const rect = grid.current!.getBoundingClientRect();
    return { x: clamp(e.clientX - rect.left, 0, width), y: clamp(e.clientY - rect.top, 0, rows.length * rowHeight - 1) };
  };
  const startGesture = (e: PointerEvent<HTMLElement>, kind: Gesture["kind"], ids: Set<string>, base = notes) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = point(e);
    gesture.current = { kind, x, y, ids, base: clone(base), originals: clone(base.filter((n) => ids.has(n.id))), pointer: e.pointerId, changed: kind === "draw" };
    if (kind === "pan") Object.assign(gesture.current!, { x: e.clientX, y: e.clientY, scrollLeft: viewport.current?.scrollLeft ?? 0, scrollTop: viewport.current?.scrollTop ?? 0 });
    if (kind === "draw") previewDraft(base);
  };
  const backgroundDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".roll-note")) return;
    grid.current?.focus({ preventScroll: true });
    const { x, y } = point(e), start = clamp(quantize(x / zoom), 0, p.pattern.length - 0.001);
    setCursor(start);
    if (tool === "pan") { startGesture(e, "pan", new Set()); return; }
    if (tool === "erase") return;
    if (tool === "select" || e.shiftKey) {
      if (!e.shiftKey) setSelected(new Set());
      startGesture(e, "select", e.shiftKey ? new Set(selected) : new Set());
      setBox({ x, y, w: 0, h: 0 }); return;
    }
    if (x / zoom >= p.pattern.length) { setMessage("Dieser Bereich liegt außerhalb der Pattern-Länge. Länge oben erweitern, um hier Noten zu zeichnen."); return; }
    const n = makeNote(start, pitchAt(y), defaultLength);
    const ids = new Set([n.id]); setSelected(ids);
    p.onAudition(n.note, n.velocity);
    startGesture(e, "draw", ids, [...notes, n]);
  };
  const noteDown = (e: PointerEvent<HTMLElement>, n: PianoNote, edge?: "left" | "right") => {
    if (e.button !== 0) return;
    e.stopPropagation(); grid.current?.focus({ preventScroll: true });
    if (tool === "pan") { startGesture(e, "pan", new Set()); return; }
    if (tool === "erase") { commit(notes.filter((x) => x.id !== n.id)); return; }
    const ids = new Set(selected);
    if (e.shiftKey && !edge) {
      if (ids.has(n.id)) ids.delete(n.id); else ids.add(n.id);
      setSelected(ids); return;
    }
    if (!ids.has(n.id)) { ids.clear(); ids.add(n.id); }
    setSelected(ids); setCursor(n.start); p.onAudition(n.note, n.velocity);
    if (e.altKey && !edge) {
      const copies = notes.filter((x) => ids.has(x.id)).map((x) => ({ ...clone(x), id: newNoteId(), group: undefined }));
      const addedIds = new Set(copies.map((x) => x.id)); setSelected(addedIds);
      startGesture(e, "move", addedIds, [...notes, ...copies]);
      gesture.current!.changed = true; previewDraft([...notes, ...copies]);
    } else startGesture(e, edge ?? "move", ids);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current; if (!g || g.pointer !== e.pointerId) return;
    const v = viewport.current;
    if (v && g.kind === "pan") { v.scrollLeft = g.scrollLeft! + g.x - e.clientX; v.scrollTop = g.scrollTop! + g.y - e.clientY; return; }
    if (v && g.kind !== "velocity") {
      const rect = v.getBoundingClientRect();
      if (e.clientX > rect.right - 24) v.scrollLeft += 16;
      if (e.clientX < rect.left + KEY + 12) v.scrollLeft -= 16;
      if (e.clientY > rect.bottom - 20) v.scrollTop += rowHeight;
      if (e.clientY < rect.top + TOP + 12) v.scrollTop -= rowHeight;
    }
    const { x, y } = point(e);
    if (g.kind === "select") {
      const rect = { x: Math.min(g.x, x), y: Math.min(g.y, y), w: Math.abs(x - g.x), h: Math.abs(y - g.y) };
      setBox(rect); const ids = new Set(g.ids);
      for (const n of notes) {
        const nx = n.start * zoom, ny = rowIndex(n.note) * rowHeight;
        if (nx < rect.x + rect.w && nx + n.duration * zoom > rect.x && ny < rect.y + rect.h && ny + rowHeight > rect.y) ids.add(n.id);
      }
      setSelected(ids); return;
    }
    const dx = x - g.x, dy = y - g.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !g.changed) return;
    g.changed = true;
    let delta = quantize(dx / zoom), pitch = Math.round(-dy / rowHeight);
    if (g.kind === "move") {
      delta = clamp(delta, -Math.min(...g.originals.map((n) => n.start)), (MAX_STEPS - .001) - Math.max(...g.originals.map((n) => n.start)));
      pitch = clamp(pitch, Math.max(...g.originals.map((n) => rowIndex(n.note))) - rows.length + 1, Math.min(...g.originals.map((n) => rowIndex(n.note))));
    }
    if (g.kind === "left") delta = clamp(delta, Math.max(-Math.min(...g.originals.map((n) => n.start)), Math.max(...g.originals.map((n) => n.duration - 256))), Math.min(MAX_STEPS - .001 - Math.max(...g.originals.map((n) => n.start)), ...g.originals.map((n) => n.duration - minimum)));
    if (g.kind === "right") delta = Math.max(delta, minimum - Math.min(...g.originals.map((n) => n.duration)));
    const value = g.base.map((n) => {
      if (!g.ids.has(n.id)) return n;
      if (g.kind === "move") return { ...n, start: n.start + delta, note: pitch ? scalePitch(rows[rowIndex(n.note) - pitch], scale) : n.note };
      if (g.kind === "left") return { ...n, start: n.start + delta, duration: n.duration - delta };
      if (g.kind === "right") return { ...n, duration: clamp(n.duration + delta, minimum, 256) };
      if (g.kind === "draw") return { ...n, duration: clamp(quantize(x / zoom - n.start), minimum, MAX_STEPS - n.start) };
      if (g.kind === "velocity") return { ...n, velocity: clamp(n.velocity - (e.clientY - g.y) / 100, 0.01, 1) };
      return n;
    });
    if (g.kind === "move") {
      const moved = value.filter((n) => g.ids.has(n.id));
      const signature = moved.map((n) => `${n.start}:${n.note}`).join("|");
      if (g.preview !== signature) { audition(moved); g.preview = signature; }
    }
    previewDraft(value);
  };
  const finish = (cancel = false) => {
    const g = gesture.current; if (!g) return;
    const result = draftRef.current;
    if (!cancel && g.changed && result) {
      // Merge with any MIDI notes recorded during this gesture.
      const current = latest.current.pattern.notes;
      const currentIds = new Set(current.map((n) => n.id));
      const changed = new Map(result.filter((n) => g.ids.has(n.id)).map((n) => [n.id, n]));
      commit([...current.map((n) => changed.get(n.id) ?? n), ...result.filter((n) => g.ids.has(n.id) && !currentIds.has(n.id))]);
      const last = result.find((n) => g.ids.has(n.id));
      if (last && ["draw", "left", "right"].includes(g.kind)) setDefaultLength(last.duration);
    }
    gesture.current = null; previewDraft(null); setBox(null);
  };
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input,select,[role=dialog],[role=slider]")) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (key === "delete" || key === "backspace") { e.preventDefault(); e.stopPropagation(); remove(); }
    else if (mod && ["a", "c", "x", "v", "d", "z", "y"].includes(key)) {
      e.preventDefault(); e.stopPropagation();
      if (key === "a") setSelected(new Set(notes.map((n) => n.id)));
      if (key === "c" || key === "x") { copy(); if (key === "x") remove(); }
      if (key === "v") insert(p.clipboard, cursor);
      if (key === "d") duplicate();
      if (key === "z") { if (e.shiftKey) p.onRedo(); else p.onUndo(); }
      if (key === "y") p.onRedo();
    } else if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      e.preventDefault(); e.stopPropagation();
      if (key === "arrowup" || key === "arrowdown") transpose((key === "arrowup" ? 1 : -1) * (e.shiftKey ? 12 : 1));
      else if (selection.length) {
        const delta = clamp((key === "arrowright" ? 1 : -1) * (snap || .01), -Math.min(...selection.map((n) => n.start)), (MAX_STEPS - .001) - Math.max(...selection.map((n) => n.start)));
        const value = notes.map((n) => selected.has(n.id) ? { ...n, start: n.start + delta } : n);
        audition(value.filter((n) => selected.has(n.id))); commit(value);
      }
    } else if (["+", "=", "-", "h"].includes(key)) {
      e.preventDefault(); e.stopPropagation();
      if (key === "h") fit(); else zoomAt(zoom * (key === "-" ? .8 : 1.25));
    } else if (key === "escape") { finish(true); setSelected(new Set()); }
  };
  useEffect(() => {
    const v = viewport.current; if (!v) return;
    const pitch = p.pattern.notes.length ? p.pattern.notes[0].note : scalePitch(60, scale);
    v.scrollTop = Math.max(0, rowIndex(pitch) * rowHeight - v.clientHeight / 2);
  }, [fold, scale.enabled, scale.root, scale.name]);
  useEffect(() => {
    let id = 0;
    const draw = () => {
      const value = latest.current.getPosition();
      const head = value ?? latest.current.playhead;
      if (playline.current) {
        playline.current.style.display = (latest.current.playing || latest.current.playbackState === "paused") && head >= 0 ? "block" : "none";
        playline.current.style.left = `${KEY + clamp(head, 0, latest.current.pattern.length) * zoom}px`;
      }
      const v = viewport.current;
      if (follow && !gesture.current && !rulerDrag.current && !marker.current && latest.current.playing && v && head >= 0) {
        const x = head * zoom;
        if (x < v.scrollLeft || x > v.scrollLeft + v.clientWidth - KEY - 30) v.scrollLeft = Math.max(0, x - 50);
      }
      id = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(id);
  }, [zoom, follow]);
  const outOfRange = notes.filter((n) => n.start >= p.pattern.length).length;
  return <div className="piano-roll" onKeyDown={keyDown} data-piano-roll style={{ "--roll-color": p.color } as CSSProperties}>
    <div className="roll-toolbar">
      <div className="roll-transport">
        <IconButton label={p.playbackState === "paused" ? "Nur diesen Track fortsetzen" : "Nur diesen Track ab Startmarkierung spielen"} active={p.playbackState === "playing"} disabled={p.playbackState === "playing"} onClick={p.onPlay}><Play size={15} fill="currentColor" /></IconButton>
        <IconButton label="Track pausieren" active={p.playbackState === "paused"} disabled={p.playbackState !== "playing"} onClick={p.onPause}><Pause size={15} /></IconButton>
        <IconButton label="Track stoppen und zur Startmarkierung zurücksetzen" disabled={p.playbackState === "stopped"} onClick={p.onStop}><Square size={13} fill="currentColor" /></IconButton>
        <IconButton label={range.loop ? "Loop an · Bereich wiederholen" : "Loop aus · Bereich einmal spielen"} active={range.loop} onClick={() => p.onPlayback({ ...range, loop: !range.loop })}><Repeat2 size={16} /></IconButton>
      </div>
      <button className={`small-button ${scale.enabled ? "on" : ""}`} aria-pressed={scale.enabled} onClick={() => p.onScale({ ...scale, enabled: !scale.enabled })}>Scale</button>
      <Select label="Skalen-Grundton" value={scale.root} onChange={(v) => p.onScale({ ...scale, root: +v })}>{["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"].map((n, i) => <option key={n} value={i}>{n}</option>)}</Select>
      <Select label="Skala" value={scale.name} onChange={(v) => p.onScale({ ...scale, name: v as ScaleConfig["name"] })}>{Object.entries(SCALES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</Select>
      <IconButton label="Fold · Nur verwendete Töne und aktive Skala anzeigen" active={fold} onClick={() => setFold(!fold)}><Filter size={15} /></IconButton>
      <IconButton label="Generieren · Melodie, Euclid-Rhythmus, Arpeggio" onClick={() => setToolDialog("generate")}><Wand2 size={15} /></IconButton>
      <IconButton label="Transformieren · Spiegeln, Legato, Strecken, Rotieren" onClick={() => setToolDialog("transform")}><FlipHorizontal2 size={15} /></IconButton>
      <IconButton label="Humanize · Timing, Velocity und Länge variieren" onClick={() => setToolDialog("humanize")}><Shuffle size={15} /></IconButton>
      <span className="roll-toolbar-divider" />
      <div className="roll-tools" aria-label="Piano-Roll-Werkzeug">
        {([{ id: "draw", label: "Zeichnen", icon: Pencil }, { id: "select", label: "Auswahl", icon: MousePointer2 }, { id: "erase", label: "Radieren", icon: Eraser }, { id: "pan", label: "Hand · Ausschnitt verschieben", icon: Hand }] as const).map((t) => <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)}><t.icon size={15} /></IconButton>)}
      </div>
      <label>Raster <Select label="Piano-Roll-Raster" value={snap} onChange={(v) => setSnap(+v)}>{[0, .125, .25, .5, 1, 2, 4].map((v) => <option key={v} value={v}>{v ? `1/${p.pattern.division / v}` : "Frei"}</option>)}</Select></label>
      <label>Länge <input aria-label="Neue Notenlänge in Steps" type="number" min=".01" max="256" step={snap || .01} value={defaultLength} onChange={(e) => setDefaultLength(clamp(+e.target.value || .01, .01, 256))} /></label>
      <button className="small-button" onClick={() => { const n = makeNote(clamp(cursor, 0, p.pattern.length - .001), scalePitch(first?.note ?? 60, scale), defaultLength); commit([...notes, n]); setSelected(new Set([n.id])); p.onAudition(n.note, n.velocity); }}>+ Note</button>
      <IconButton label="Noten kopieren (Ctrl+C)" disabled={!selection.length} onClick={copy}><Copy size={14} /></IconButton>
      <IconButton label="Noten am Cursor einfügen (Ctrl+V)" disabled={!p.clipboard.length} onClick={() => insert(p.clipboard, cursor)}><ClipboardPaste size={14} /></IconButton>
      <IconButton label="Auswahl duplizieren (Ctrl/Cmd+D)" disabled={!selection.length} onClick={duplicate}><CopyPlus size={15} /></IconButton>
      <IconButton label="Auswahl auf das Raster quantisieren" disabled={!selection.length || !snap} onClick={() => commit(notes.map((n) => selected.has(n.id) ? { ...n, start: clamp(quantize(n.start + n.micro), 0, (MAX_STEPS - .001)), duration: Math.max(minimum, quantize(n.duration)), micro: 0 } : n))}><Grid2X2 size={15} /></IconButton>
      <IconButton label="Auswahl löschen" disabled={!selection.length} onClick={remove}><Trash2 size={14} /></IconButton>
      <IconButton label="Rückgängig (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo}><Undo2 size={14} /></IconButton>
      <IconButton label="Wiederholen (Ctrl+Shift+Z)" disabled={!p.canRedo} onClick={p.onRedo}><Redo2 size={14} /></IconButton>
      <IconButton label="Horizontal herauszoomen" disabled={zoom <= 4} onClick={() => zoomAt(zoom / 1.25)}><Minus size={14} /></IconButton>
      <IconButton label="Horizontal hineinzoomen" disabled={zoom >= 240} onClick={() => zoomAt(zoom * 1.25)}><Plus size={14} /></IconButton>
      <button className="small-button" title="Pattern in Fenster einpassen (H)" onClick={fit}>Fit</button>
      <IconButton label="Follow · Ansicht folgt bei Wiedergabe dem Abspielkopf" active={follow} onClick={() => setFollow(!follow)}><LocateFixed size={15} /></IconButton>
    </div>
    <div className="roll-viewport" ref={viewport} onScroll={() => { if (velocityViewport.current && viewport.current) velocityViewport.current.scrollLeft = viewport.current.scrollLeft; }}>
      <div className="roll-content" style={{ width: KEY + width, height: TOP + rows.length * rowHeight }}>
        <div className="roll-ruler" style={{ width: KEY + width }} title="Ziehen: zoomen / verschieben · Doppelklick: Fit · Shift+Klick: Start · Alt+Klick: Ende"
          onDoubleClick={fit}
          onPointerDown={(e) => {
            if (e.button !== 0 || !viewport.current) return;
            e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
            const rect = viewport.current.getBoundingClientRect(), x = e.clientX - rect.left - KEY;
            const position = Math.round((viewport.current.scrollLeft + x) / zoom);
            if (e.shiftKey || e.altKey) {
              p.onPlayback(e.shiftKey ? { ...range, start: clamp(position, 0, range.end - 1) } : { ...range, end: clamp(position, range.start + 1, p.pattern.length) });
              return;
            }
            rulerDrag.current = { x: e.clientX, y: e.clientY, zoom, unit: (viewport.current.scrollLeft + x) / zoom, changed: false };
          }}
          onPointerMove={(e) => {
            const g = rulerDrag.current, v = viewport.current; if (!g || !v) return;
            if (!g.changed && Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) < 3) return;
            g.changed = true;
            const next = clamp(g.zoom * Math.exp((e.clientY - g.y) * .015), 4, 240);
            const x = e.clientX - v.getBoundingClientRect().left - KEY;
            zoomAnchor.current = { unit: g.unit, x }; setZoom(next);
            v.scrollLeft = g.unit * next - x;
          }}
          onPointerUp={() => { const g = rulerDrag.current; if (g && !g.changed) setCursor(clamp(quantize(g.unit), 0, p.pattern.length - .001)); rulerDrag.current = null; }}
          onPointerCancel={() => { rulerDrag.current = null; }} onLostPointerCapture={() => { rulerDrag.current = null; }}>
          <div className={`roll-range ${range.loop ? "looping" : ""}`} style={{ left: KEY + range.start * zoom, width: (range.end - range.start) * zoom }} />
          {(["start", "end"] as const).map((side) => <button key={side} className={`roll-marker ${side}`} role="slider" tabIndex={0}
            aria-label={side === "start" ? "Bereichsanfang" : "Bereichsende"} aria-valuemin={side === "start" ? 0 : range.start + 1} aria-valuemax={side === "start" ? range.end - 1 : p.pattern.length} aria-valuenow={range[side]}
            title={side === "start" ? `Start: Step ${range.start + 1} · ziehen` : `Ende: nach Step ${range.end} · ziehen`}
            style={{ left: KEY + range[side] * zoom }} onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); marker.current = side; e.currentTarget.focus({ preventScroll: true }); e.currentTarget.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => {
              if (!marker.current || !viewport.current || !grid.current) return;
              e.stopPropagation(); const v = viewport.current, rect = v.getBoundingClientRect();
              if (e.clientX > rect.right - 20) v.scrollLeft += 12;
              if (e.clientX < rect.left + KEY + 10) v.scrollLeft -= 12;
              const position = Math.round((e.clientX - grid.current.getBoundingClientRect().left) / zoom);
              const value = side === "start" ? clamp(position, 0, range.end - 1) : clamp(position, range.start + 1, p.pattern.length);
              const next = { ...range, [side]: value }; rangeRef.current = next; setRangeDraft(next);
            }}
            onPointerUp={(e) => { e.stopPropagation(); if (marker.current) p.onPlayback(rangeRef.current); marker.current = null; setRangeDraft(undefined); }}
            onPointerCancel={() => { marker.current = null; setRangeDraft(undefined); }}
            onLostPointerCapture={() => { marker.current = null; setRangeDraft(undefined); }}
            onKeyDown={(e) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const min = side === "start" ? 0 : range.start + 1, max = side === "start" ? range.end - 1 : p.pattern.length; p.onPlayback({ ...range, [side]: clamp(e.key === "Home" ? min : e.key === "End" ? max : range[side] + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 4 : 1), min, max) }); }}
          >{side === "start" ? "▶" : "◀"}</button>)}
          <span className="roll-ruler-corner">NOTE</span>
          {Array.from({ length: units }, (_, i) => <button key={i} style={{ left: KEY + i * zoom, width: zoom }} className={i % (p.pattern.division / 4) === 0 ? "beat" : ""} aria-label={`Einfügeposition Step ${i + 1}`}>{i % p.pattern.division === 0 ? `${Math.floor(i / p.pattern.division) + 1}.1` : zoom >= 40 ? i + 1 : "·"}</button>)}
        </div>
        <div className="roll-keys">
          {rows.map((n) => <button key={n} className={black(n) ? "black" : "white"} style={{ height: rowHeight }} onPointerDown={(e) => { e.preventDefault(); p.onAudition(n, .8); }} aria-label={`Vorhören ${noteName(n)}`}>{noteName(n)}</button>)}
        </div>
        <div className="roll-grid" tabIndex={0} role="group" aria-label="Piano Roll: Noten zeichnen, auswählen und mit Pfeiltasten bearbeiten" ref={grid}
          style={{ left: KEY, top: TOP, width, height: rows.length * rowHeight, "--grid-unit": `${zoom}px`, "--snap-unit": `${zoom * (snap || 1)}px`, "--bar-unit": `${zoom * p.pattern.division}px` } as CSSProperties}
          onPointerDown={backgroundDown} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onContextMenu={(e) => e.preventDefault()}>
          {rows.map((n, i) => <div key={n} className={`roll-row ${black(n) ? "black" : ""} ${n % 12 === 0 ? "c-row" : ""} ${scale.enabled && inScale(n, scale) ? "in-scale" : ""} ${scale.enabled && n % 12 === scale.root ? "scale-root" : ""}`} style={{ top: i * rowHeight, height: rowHeight }} />)}
          <div className="roll-outside" style={{ left: p.pattern.length * zoom, width: Math.max(0, width - p.pattern.length * zoom) }} />
          <div className="roll-cursor" style={{ left: cursor * zoom }} />
          {notes.map((n) => <div key={n.id} role="button" tabIndex={-1} aria-label={`${noteName(n.note)}, Step ${(n.start + 1).toFixed(2)}, Länge ${n.duration.toFixed(2)}, Velocity ${Math.round(n.velocity * 100)}%`} aria-pressed={selected.has(n.id)}
            className={`roll-note ${selected.has(n.id) ? "selected" : ""} ${n.start >= p.pattern.length ? "outside" : ""}`}
            style={{ left: n.start * zoom, top: rowIndex(n.note) * rowHeight + 1, width: Math.max(5, Math.min(n.duration, units - n.start) * zoom), height: rowHeight - 2, opacity: .5 + n.velocity * .5 }}
            onPointerDown={(e) => noteDown(e, n)} onDoubleClick={() => commit(notes.filter((x) => x.id !== n.id))}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); commit(notes.filter((x) => x.id !== n.id)); }} title={`${noteName(n.note)} · ${n.duration.toFixed(2)} Steps · ${Math.round(n.velocity * 100)}%${n.micro ? ` · Micro ${n.micro.toFixed(2)}` : ""}`}>
            <span className="roll-resize left" onPointerDown={(e) => noteDown(e, n, "left")} />
            <span className="roll-note-name">{noteName(n.note)}{Object.keys(n.locks).length ? " •" : ""}</span>
            <span className="roll-resize right" onPointerDown={(e) => noteDown(e, n, "right")} />
          </div>)}
          {box && <div className="roll-marquee" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
        </div>
        <div className="roll-playhead" ref={playline} />
      </div>
    </div>
    <div className="roll-velocity-viewport" ref={velocityViewport}>
      <div className="roll-velocity" style={{ width: KEY + width }} onPointerMove={(e) => {
        const g = gesture.current; if (!g || g.kind !== "velocity") return;
        g.changed = true;
        previewDraft(g.base.map((n) => g.ids.has(n.id) ? { ...n, velocity: clamp(n.velocity - (e.clientY - g.y) / 80, .01, 1) } : n));
      }} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}>
        <span className="velocity-label">VEL</span>
        {notes.map((n) => <button key={n.id} className={`velocity-bar ${selected.has(n.id) ? "selected" : ""}`} aria-label={`Velocity ${noteName(n.note)} bei Step ${n.start + 1}`} title={`${Math.round(n.velocity * 100)}% · vertikal ziehen`}
          style={{ left: KEY + n.start * zoom, height: `${Math.max(8, n.velocity * 90)}%`, width: Math.max(5, Math.min(12, zoom * .2)) }}
          onPointerDown={(e) => { const ids = selected.has(n.id) ? new Set(selected) : new Set([n.id]); setSelected(ids); startGesture(e, "velocity", ids); gesture.current!.y = e.clientY; }} />)}
      </div>
    </div>
    <div className="roll-inspector" aria-label="Noten-Inspector und Parameter-Locks">
      <strong>{selection.length ? `${selection.length} ${selection.length === 1 ? "Note" : "Noten"}` : "Keine Auswahl"}</strong>
      {first && <>
        <label>Note <Select label="Piano-Note" value={first.note} onChange={(v) => transpose(+v - first.note)}>{Array.from({ length: 128 }, (_, n) => <option key={n} value={n}>{noteName(n)}</option>)}</Select></label>
        <label>Start <input aria-label="Notenstart in Steps (ab 1)" type="number" min="1" max={MAX_STEPS + .999} step={snap || .01} value={+(first.start + 1).toFixed(3)} onChange={(e) => {
          const delta = clamp((+e.target.value || 1) - 1 - first.start, -Math.min(...selection.map((n) => n.start)), (MAX_STEPS - .001) - Math.max(...selection.map((n) => n.start)));
          const value = notes.map((n) => selected.has(n.id) ? { ...n, start: n.start + delta } : n);
        audition(value.filter((n) => selected.has(n.id))); commit(value);
        }} /></label>
        <label>Länge <input aria-label="Notendauer in Steps" type="number" min=".01" max="256" step={snap || .01} value={+first.duration.toFixed(3)} onChange={(e) => editSelected({ duration: clamp(+e.target.value || .01, .01, 256) })} /></label>
        <label>Velocity <input aria-label="Noten-Velocity" type="number" min="1" max="100" value={Math.round(first.velocity * 100)} onChange={(e) => editSelected({ velocity: clamp(+e.target.value / 100, .01, 1) })} /></label>
        <label>Chance % <input aria-label="Noten-Wahrscheinlichkeit" type="number" min="0" max="100" value={Math.round(first.probability * 100)} onChange={(e) => editSelected({ probability: clamp(+e.target.value / 100, 0, 1), group: undefined })} /></label>
        <label>Micro <input aria-label="Noten-Microtiming in Steps" type="number" min="-3.6" max="3.6" step=".01" value={+first.micro.toFixed(3)} onChange={(e) => editSelected({ micro: clamp(+e.target.value, -3.6, 3.6) })} /></label>
        <label>Bedingung <Select label="Noten-Bedingung" value={first.condition} onChange={(v) => editSelected({ condition: v as Condition, group: undefined })}>{["always", "1:2", "2:2", "1:4", "fill", "!fill"].map((v) => <option key={v} value={v}>{v}</option>)}</Select></label>
      </>}
    {first && <LockControls locks={first.locks} patch={p.patch} onSet={(key, value) => commit(notes.map((n) => {
      if (!selected.has(n.id)) return n;
      const locks = { ...n.locks }; if (value === null) delete locks[key]; else locks[key] = value;
      return { ...n, locks };
    }))} />}
    </div>
    {(message || outOfRange > 0) && <div className="roll-status" role="status"><span>{message || `${outOfRange} Noten außerhalb der Loop-Länge bleiben gespeichert.`}</span>{message && <button aria-label="Hinweis schließen" onClick={() => setMessage("")}>×</button>}</div>}
    {toolDialog && <PianoTools pattern={p.pattern} selection={selected} page={toolDialog} onClose={closeTools} onApply={commit} />}

  </div>;
}
