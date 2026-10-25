import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Dices,
  Layers3,
  LockKeyhole,
  RotateCcw,
  Trash2,
  UnlockKeyhole,
  Undo2,
} from "lucide-react";
import { IconButton, Select, Modal, PanelHeader } from "./components";
import {
  CHORDS,
  MAX_STEPS,
  STEP_SPANS,
  patternTimeline,
  stepLengthLabel,
  noteName,
} from "./model";
import type {
  Condition,
  EditorMode,
  Pattern,
  PianoNote,
  Project,
  Step,
} from "./model";
import { useCallback, useEffect, useState } from "react";

import PianoRoll from "./PianoRoll";
import { LockControls } from "./ParameterLocks";
import type { TrackPlaybackState } from "./track-playback";

type Props = {
  project: Project;
  preview: TrackPlaybackState;
  onPlayTrack: (track: number) => void;
  onPauseTrack: () => void;
  onStopTrack: () => void;
  onMode: (track: number, mode: EditorMode) => void;
  onNotes: (track: number, notes: PianoNote[]) => void;
  onAudition: (track: number, note: number, velocity: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  noteClipboard: PianoNote[];
  onNoteClipboard: (notes: PianoNote[]) => void;
  getPosition: (track: number) => number | null;
  onRestorePiano: (track: number) => void;
  track: number;
  selectTrack: (i: number) => void;
  selectedStep: number;
  setStep: (i: number) => void;
  page: number;
  setPage: (p: number) => void;
  playheads: number[];
  playing: boolean;
  recording: boolean;
  lockMode: boolean;
  setLockMode: (b: boolean) => void;
  fill: boolean;
  setFill: (b: boolean) => void;
  onStep: (track: number, index: number, patch: Partial<Step>) => void;
  onTrack: (track: number, patch: { mute?: boolean; solo?: boolean }) => void;
  onPattern: (track: number, patch: Partial<Pattern>) => void;
  onSelectPattern: (index: number) => void;
  onCopy: () => void;
  onPaste: (editor: EditorMode) => void;
  onClear: () => void;
  onRandom: () => void;
  hasClipboard: boolean;
};
export default function Sequencer(p: Props) {
  const { project, track, selectedStep, page } = p,
    pattern = project.tracks[track].patterns[project.activePattern],
    step = pattern.steps[selectedStep];
  const [editor, setEditor] = useState<EditorMode>(project.tracks[track].mode);
  useEffect(() => {
    setEditor(project.tracks[track].mode);
  }, [track, project.tracks[track].mode]);
  const modeMatches =
    editor === "step" || project.tracks[track].mode === editor;
  const canEdit = project.tracks[track].mode === editor;
  const visibleTracks =
    editor === "step"
      ? project.tracks
      : project.tracks.filter((t) => t.mode === editor);
  const [editorOpen, setEditorOpen] = useState(false);
  const closeEditor = useCallback(() => setEditorOpen(false), []);
  // One shared 1/64-note scale; never normalize each track independently.
  const timelines = project.tracks.map((t) => {
    const pat = t.patterns[project.activePattern];
    return patternTimeline(pat, true);
  });
  const first = page * 16,
    last = first + 15;
  const startUnit = Math.min(
    ...(visibleTracks.length ? visibleTracks : [project.tracks[track]]).map(
      (t) => (first * 64) / t.patterns[project.activePattern].division,
    ),
  );
  const endUnit = Math.max(
    ...(visibleTracks.length ? visibleTracks : [project.tracks[track]]).map(
      (t) => ((last + 1) * 64) / t.patterns[project.activePattern].division,
    ),
  );
  const timelineStyle = {
    gridTemplateColumns: `repeat(${endUnit - startUnit}, minmax(0, 1fr))`,
  };
  const editableSteps = timelines[track];
  const selection = editableSteps.findIndex((s) => s.index === selectedStep);
  const change = (patch: Partial<Step>) => p.onStep(track, selectedStep, patch);
  const lockEditor = (
    <div className="lock-editor">
      <LockControls
        locks={step.locks}
        patch={project.tracks[track].patch}
        onSet={(key, value) => {
          const locks = { ...step.locks };
          if (value === null) delete locks[key];
          else locks[key] = value;
          change({ locks, ...(value !== null ? { on: true } : {}) });
        }}
      />
    </div>
  );
  const stepEditor = (
    <div className="step-editor">
      <div className="step-editor-label">
        <span className="eyebrow">TRIG EDITOR</span>
        <strong>Step {String(selectedStep + 1).padStart(2, "0")}</strong>
      </div>
      <label>
        NOTE
        <Select
          label="Step note"
          value={step.note}
          onChange={(v) => change({ note: +v })}
        >
          {Array.from({ length: 128 }, (_, note) => note).map((note) => (
            <option key={note} value={note}>
              {noteName(note)}
            </option>
          ))}
        </Select>
      </label>
      <label>
        LENGTH
        <Select
          label="Step length"
          value={step.span}
          onChange={(v) => change({ span: +v })}
        >
          {STEP_SPANS.map((span) => (
            <option key={span} value={span}>
              {stepLengthLabel(span, pattern.division)}
            </option>
          ))}
        </Select>
      </label>
      <label>
        VELOCITY
        <input
          aria-label="Step velocity"
          type="range"
          min=".01"
          max="1"
          step=".01"
          value={step.velocity}
          onChange={(e) => change({ velocity: +e.target.value })}
        />
        <output>{Math.round(step.velocity * 100)}%</output>
      </label>
      <label>
        GATE
        <input
          aria-label="Step gate"
          type="range"
          min=".05"
          max="4"
          step=".05"
          value={step.gate}
          onChange={(e) => change({ gate: +e.target.value })}
        />
        <output>{Math.round(step.gate * 100)}%</output>
      </label>
      <label>
        CHANCE
        <input
          aria-label="Step probability"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={step.probability}
          onChange={(e) => change({ probability: +e.target.value })}
        />
        <output>{Math.round(step.probability * 100)}%</output>
      </label>
      <label>
        MICRO
        <input
          aria-label="Step microtiming"
          type="range"
          min="-.45"
          max=".45"
          step=".01"
          value={step.micro}
          onChange={(e) => change({ micro: +e.target.value })}
        />
        <output>
          {step.micro > 0 ? "+" : ""}
          {Math.round(step.micro * 100)}%
        </output>
      </label>
      <label>
        RETRIG
        <Select
          label="Step retrig"
          value={step.retrig}
          onChange={(v) => change({ retrig: +v })}
        >
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}×
            </option>
          ))}
        </Select>
      </label>
      <label>
        CONDITION
        <Select
          label="Step condition"
          value={step.condition}
          onChange={(v) => change({ condition: v as Condition })}
        >
          {[
            ["always", "Always"],
            ["1:2", "1 : 2"],
            ["2:2", "2 : 2"],
            ["1:4", "1 : 4"],
            ["fill", "Fill"],
            ["!fill", "Not fill"],
          ].map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label>
        CHORD
        <Select
          label="Step chord"
          value={step.chord}
          onChange={(v) => change({ chord: v as Step["chord"] })}
        >
          {Object.keys(CHORDS).map((chord) => (
            <option key={chord} value={chord}>
              {chord === "single"
                ? "Single"
                : chord[0].toUpperCase() + chord.slice(1)}
            </option>
          ))}
        </Select>
      </label>
      <button
        className={`lock-mode ${p.lockMode ? "active" : ""}`}
        onClick={() => p.setLockMode(!p.lockMode)}
        title="Aktiv: Instrument-Regler schreiben Parameter-Locks auf den ausgewählten Step"
      >
        {p.lockMode ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
        <span>P-LOCK</span>
        <i />
      </button>
    </div>
  );
  return (
    <section className="sequencer studio-panel">
      <PanelHeader
        icon={<Layers3 size={16} />}
        title="Sequencer"
        context={
          <>
            <div className="tabs" role="tablist" aria-label="Sequencer-Editor">
              {(["step", "piano"] as const).map((mode) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={editor === mode}
                  className={editor === mode ? "active" : ""}
                  onClick={() => {
                    setEditor(mode);
                    p.setLockMode(false);
                    const first = project.tracks.find((t) => t.mode === mode);
                    if (first && project.tracks[track].mode !== mode)
                      p.selectTrack(first.id);
                  }}
                >
                  {mode === "step" ? "Step-Sequencer" : "Piano Roll"}{" "}
                  <small>
                    ({project.tracks.filter((t) => t.mode === mode).length})
                  </small>
                </button>
              ))}
            </div>
            <span className="tag">PATTERN A0{project.activePattern + 1}</span>
            {p.recording && (
              <span className="record-tag">
                <i /> LIVE REC
              </span>
            )}
          </>
        }
        actions={
          <div className="sequencer-actions">
            <label>
              Track {String(track + 1).padStart(2, "0")} · Editor
              <Select
                label={`Editortyp für Track ${track + 1}`}
                value={project.tracks[track].mode}
                onChange={(v) => p.onMode(track, v as EditorMode)}
              >
                <option value="step">Step-Sequencer</option>
                <option value="piano">Piano Roll</option>
              </Select>
            </label>
            {project.tracks[track].patterns.some((pat) => pat.pianoBackup) && (
              <IconButton
                label="Original-Piano-Roll wiederherstellen"
                onClick={() => p.onRestorePiano(track)}
              >
                <Undo2 size={14} />
              </IconButton>
            )}
            <button
              className={`small-button fill-button ${p.fill ? "on" : ""}`}
              onClick={() => p.setFill(!p.fill)}
              aria-pressed={p.fill}
              title={
                p.fill
                  ? "Fill aktiv: fill spielt, !fill pausiert"
                  : "Fill aktivieren: fill spielt, !fill pausiert"
              }
            >
              {p.fill ? "FILL ON" : "FILL"}
            </button>
            <IconButton label="Pattern kopieren" onClick={p.onCopy}>
              <Copy size={14} />
            </IconButton>
            <IconButton
              label="Pattern einfügen"
              disabled={!p.hasClipboard || !canEdit}
              onClick={() => p.onPaste(editor)}
            >
              <Layers3 size={14} />
            </IconButton>
            <IconButton
              label="Pattern generieren"
              disabled={!canEdit}
              onClick={p.onRandom}
            >
              <Dices size={16} />
            </IconButton>
            <IconButton
              label="Pattern leeren"
              disabled={!canEdit}
              onClick={p.onClear}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        }
      />
      {modeMatches && (
        <>
          <div className="pattern-toolbar">
            <div className="pattern-bank" aria-label="Pattern-Speicher">
              {Array.from({ length: 8 }, (_, i) => (
                <button
                  key={i}
                  className={project.activePattern === i ? "selected" : ""}
                  onClick={() => p.onSelectPattern(i)}
                >
                  A0{i + 1}
                </button>
              ))}
            </div>
            {editor === "piano" && (
              <div
                className="piano-track-item"
                style={
                  {
                    "--track-color": project.tracks[track].color,
                  } as React.CSSProperties
                }
              >
                <Select
                  label="Piano-Roll-Track"
                  value={track}
                  onChange={(v) => p.selectTrack(+v)}
                >
                  {visibleTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {String(t.id + 1).padStart(2, "0")} · {t.name}
                    </option>
                  ))}
                </Select>
                <div className="track-switches">
                  <button
                    aria-label={`Track ${track + 1} mute`}
                    aria-pressed={project.tracks[track].mute}
                    className={project.tracks[track].mute ? "active" : ""}
                    onClick={() =>
                      p.onTrack(track, { mute: !project.tracks[track].mute })
                    }
                  >
                    M
                  </button>
                  <button
                    aria-label={`Track ${track + 1} solo`}
                    aria-pressed={project.tracks[track].solo}
                    className={project.tracks[track].solo ? "solo" : ""}
                    onClick={() =>
                      p.onTrack(track, { solo: !project.tracks[track].solo })
                    }
                  >
                    S
                  </button>
                </div>
              </div>
            )}
            <fieldset className="pattern-settings" disabled={!canEdit}>
              <Select
                label="Track Swing"
                value={pattern.swingMode}
                onChange={(v) =>
                  p.onPattern(track, { swingMode: v as Pattern["swingMode"] })
                }
              >
                <option value="global">Swing · GLOBAL</option>
                <option value="custom">Swing · CUSTOM</option>
                <option value="off">Swing · OFF</option>
              </Select>
              {pattern.swingMode === "custom" && (
                <>
                  <label className="track-swing-amount">
                    SWING
                    <input
                      aria-label="Track Swing-Wert"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={pattern.swing}
                      onChange={(e) =>
                        p.onPattern(track, { swing: +e.target.value })
                      }
                    />
                    <output>{Math.round(pattern.swing * 100)}%</output>
                  </label>
                  <Select
                    label="Track Swing-Auflösung"
                    value={pattern.swingResolution}
                    onChange={(v) =>
                      p.onPattern(track, { swingResolution: +v as 8 | 16 })
                    }
                  >
                    <option value="8">1/8</option>
                    <option value="16">1/16</option>
                  </Select>
                </>
              )}
              <label>
                LENGTH
                <input
                  aria-label="Pattern length"
                  type="number"
                  min="1"
                  max={MAX_STEPS}
                  value={pattern.length}
                  onChange={(e) =>
                    p.onPattern(track, {
                      length: Math.round(
                        Math.min(MAX_STEPS, Math.max(1, +e.target.value || 1)),
                      ),
                    })
                  }
                />
              </label>
              <Select
                label="Step-Auflösung"
                value={pattern.division}
                onChange={(v) => p.onPattern(track, { division: +v })}
              >
                <option value="8">1/8</option>
                <option value="16">1/16</option>
                <option value="32">1/32</option>
              </Select>
              <Select
                label="Abspielrichtung"
                value={pattern.direction}
                onChange={(v) =>
                  p.onPattern(track, { direction: v as Pattern["direction"] })
                }
              >
                <option value="forward">→ Forward</option>
                <option value="reverse">← Reverse</option>
                <option value="pingpong">↔ Ping-pong</option>
                <option value="random">⤨ Random</option>
              </Select>
              <IconButton
                label="Auflösung und Richtung zurücksetzen"
                onClick={() =>
                  p.onPattern(track, { direction: "forward", division: 16 })
                }
              >
                <RotateCcw size={13} />
              </IconButton>
            </fieldset>
            {editor === "step" && (
              <div className="step-pages">
                <IconButton
                  label="Vorherige Step-Seite"
                  onClick={() => p.setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={12} />
                </IconButton>
                <span>
                  {page * 16 + 1}–{page * 16 + 16}
                </span>
                <IconButton
                  label="Nächste Step-Seite"
                  onClick={() =>
                    p.setPage(Math.min(MAX_STEPS / 16 - 1, page + 1))
                  }
                  disabled={page === MAX_STEPS / 16 - 1}
                >
                  <ChevronRight size={12} />
                </IconButton>
              </div>
            )}
          </div>
          {editor === "piano" && (
            <>
              <PianoRoll
                key={`${track}:${project.activePattern}`}
                pattern={pattern}
                patch={project.tracks[track].patch}
                color={project.tracks[track].color}
                playing={
                  p.playing &&
                  (p.preview.state !== "playing" || p.preview.track === track)
                }
                playhead={p.playheads[track]}
                playbackState={
                  p.preview.track === track ? p.preview.state : "stopped"
                }
                onPlay={() => p.onPlayTrack(track)}
                onPause={p.onPauseTrack}
                onStop={p.onStopTrack}
                onPlayback={(pianoPlayback) =>
                  p.onPattern(track, { pianoPlayback })
                }
                onScale={(scale) => p.onPattern(track, { scale })}
                onChange={(notes) => p.onNotes(track, notes)}
                onAudition={(note, velocity) =>
                  p.onAudition(track, note, velocity)
                }
                onUndo={p.onUndo}
                onRedo={p.onRedo}
                canUndo={p.canUndo}
                canRedo={p.canRedo}
                clipboard={p.noteClipboard}
                onClipboard={p.onNoteClipboard}
                getPosition={() => p.getPosition(track)}
              />
            </>
          )}
          {editor === "step" && (
            <>
              <div className="sequence-grid">
                <div className="step-numbers">
                  <span>TRACK / TRIG</span>
                  <div
                    className="timeline-heading"
                    style={timelineStyle}
                    aria-label="Gemeinsames Zeitraster in Sechzehntelnoten"
                  >
                    {Array.from(
                      { length: Math.ceil(endUnit / 4) },
                      (_, i) => i * 4,
                    )
                      .filter((unit) => unit >= startUnit && unit < endUnit)
                      .map((unit) => (
                        <span
                          key={unit}
                          style={{
                            gridColumn: `${unit - startUnit + 1} / span ${Math.min(4, endUnit - unit)}`,
                          }}
                        >
                          {unit / 4 + 1}
                        </span>
                      ))}
                  </div>
                  <span />
                </div>
                {project.tracks.map((t, ti) => {
                  const pat = t.patterns[project.activePattern];
                  const low = Math.min(60, ...pat.notes.map((n) => n.note));
                  const high = Math.max(72, ...pat.notes.map((n) => n.note));
                  return (
                    <div
                      className={`sequence-track ${ti === track ? "selected" : ""} ${t.mute ? "muted-track" : ""}`}
                      key={t.id}
                      style={{ "--step-color": t.color } as React.CSSProperties}
                    >
                      <button
                        className="sequence-track-label"
                        disabled={t.mode === "piano"}
                        title={
                          t.mode === "piano"
                            ? "Piano Roll · schreibgeschützte Übersicht"
                            : undefined
                        }
                        onClick={() => p.selectTrack(ti)}
                      >
                        <i />
                        <span>{String(ti + 1).padStart(2, "0")}</span>
                        <b>{t.name}</b>
                      </button>
                      {t.mode === "piano" ? (
                        <div
                          className="piano-step-preview"
                          role="img"
                          aria-label={`${t.name}: Piano-Roll-Noten, schreibgeschützt`}
                        >
                          <span>PIANO ROLL</span>
                          {pat.notes
                            .filter(
                              (n) =>
                                n.start < last + 1 &&
                                n.start + n.duration > first,
                            )
                            .map((n) => {
                              const start =
                                (Math.max(first, n.start) * 64) / pat.division;
                              const end =
                                (Math.min(last + 1, n.start + n.duration) *
                                  64) /
                                pat.division;
                              return (
                                <i
                                  key={n.id}
                                  title={`${noteName(n.note)} · ${n.duration.toFixed(2)} Steps`}
                                  className={
                                    n.start >= pat.length ? "outside" : ""
                                  }
                                  style={{
                                    left: `${((start - startUnit) / (endUnit - startUnit)) * 100}%`,
                                    width: `${((end - start) / (endUnit - startUnit)) * 100}%`,
                                    top: `${18 + ((high - n.note) / Math.max(12, high - low)) * 62}%`,
                                    opacity: 0.4 + n.velocity * 0.6,
                                  }}
                                />
                              );
                            })}
                          {p.playing &&
                            p.playheads[ti] >= first &&
                            p.playheads[ti] < last + 1 && (
                              <b
                                style={{
                                  left: `${(((p.playheads[ti] * 64) / pat.division - startUnit) / (endUnit - startUnit)) * 100}%`,
                                }}
                              />
                            )}
                        </div>
                      ) : (
                        <div className="steps" style={timelineStyle}>
                          {timelines[ti]
                            .filter(
                              (entry) =>
                                entry.index <= last &&
                                entry.index + entry.span > first,
                            )
                            .map((entry) => {
                              const { index, span, slots } = entry,
                                start =
                                  (Math.max(index, first) * 64) / pat.division,
                                end =
                                  (Math.min(index + span, last + 1) * 64) /
                                  pat.division,
                                continuation = index < first,
                                s = pat.steps[index],
                                hasLock = Object.keys(s.locks).length > 0;
                              return (
                                <button
                                  key={index}
                                  style={{
                                    gridColumn: `${start - startUnit + 1} / span ${end - start}`,
                                  }}
                                  className={`step ${s.on ? "enabled" : ""} ${index === selectedStep && ti === track ? "inspected" : ""} ${p.playing && p.playheads[ti] === index ? "playhead" : ""} ${index >= pat.length ? "outside" : ""} ${index % 4 === 0 ? "beat-start" : ""}`}
                                  aria-label={`Track ${ti + 1} Step ${index + 1} ${s.on ? "on" : "off"}${slots > 1 ? ` · Positionen ${index + 1}–${index + slots}` : ""}${continuation ? " · Fortsetzung" : ""}`}
                                  aria-pressed={s.on}
                                  title={`${noteName(s.note)} · ${stepLengthLabel(span, pat.division)} · ${Math.round(s.velocity * 100)}%${hasLock ? " · Parameter locks" : ""}${span < s.span ? " · am Pattern-Ende gekürzt" : ""}\nKlick: auswählen · Ausgewählten Step erneut klicken: löschen · Shift/Rechtsklick: Note & P-Locks`}
                                  onClick={(e) => {
                                    p.selectTrack(ti);
                                    p.setStep(index);
                                    if (e.shiftKey) setEditorOpen(true);
                                    else if (
                                      index < pat.length &&
                                      (!s.on ||
                                        (ti === track &&
                                          index === selectedStep))
                                    )
                                      p.onStep(ti, index, { on: !s.on });
                                  }}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    p.selectTrack(ti);
                                    p.setStep(index);
                                    setEditorOpen(true);
                                  }}
                                >
                                  <span className="step-number">
                                    {continuation ? "↤ " : ""}
                                    {index + 1}
                                  </span>
                                  <span>{s.on ? noteName(s.note) : "·"}</span>
                                  <span className="step-duration">
                                    {stepLengthLabel(span, pat.division)}
                                  </span>
                                  {hasLock && <i className="step-lock" />}
                                  {s.probability < 1 && s.on && (
                                    <small>
                                      {Math.round(s.probability * 100)}
                                    </small>
                                  )}
                                  {s.retrig > 1 && s.on && (
                                    <em>{"ı".repeat(s.retrig)}</em>
                                  )}
                                  <b
                                    style={{ height: `${s.velocity * 100}%` }}
                                  />
                                </button>
                              );
                            })}
                        </div>
                      )}
                      <div className="track-switches">
                        <button
                          className={t.mute ? "active" : ""}
                          onClick={() => p.onTrack(ti, { mute: !t.mute })}
                          aria-label={`Track ${ti + 1} mute`}
                          aria-pressed={t.mute}
                        >
                          M
                        </button>
                        <button
                          className={t.solo ? "solo" : ""}
                          onClick={() => p.onTrack(ti, { solo: !t.solo })}
                          aria-label={`Track ${ti + 1} solo`}
                          aria-pressed={t.solo}
                        >
                          S
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {canEdit &&
                (editorOpen ? (
                  <Modal
                    title={`Track ${track + 1} · Step ${String(selectedStep + 1).padStart(2, "0")}`}
                    subtitle="Note, Trig-Eigenschaften und Parameter-Locks bearbeiten"
                    wide
                    onClose={closeEditor}
                  >
                    <div className="step-dialog-switch">
                      <button
                        className={`small-button ${step.on ? "on" : ""}`}
                        onClick={() => change({ on: !step.on })}
                      >
                        {step.on ? "TRIG ON" : "TRIG OFF"}
                      </button>
                      <button
                        className="small-button"
                        onClick={() =>
                          p.setStep(
                            editableSteps[Math.max(0, selection - 1)].index,
                          )
                        }
                      >
                        ← Step
                      </button>
                      <button
                        className="small-button"
                        onClick={() =>
                          p.setStep(
                            editableSteps[
                              Math.min(editableSteps.length - 1, selection + 1)
                            ].index,
                          )
                        }
                      >
                        Step →
                      </button>
                    </div>
                    {stepEditor}
                    {lockEditor}
                  </Modal>
                ) : (
                  <>
                    {stepEditor}
                    {(p.lockMode || Object.keys(step.locks).length > 0) &&
                      lockEditor}
                  </>
                ))}
            </>
          )}
        </>
      )}
      {!modeMatches && (
        <div className="sequencer-empty">
          <strong>
            Keine Tracks im {editor === "piano" ? "Piano-Roll" : "Step"}-Modus
          </strong>
          Wähle einen Track im Rack und ändere oben seinen Editortyp.
        </div>
      )}
    </section>
  );
}
