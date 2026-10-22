import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Dice5,
  Layers3,
  LockKeyhole,
  RotateCcw,
  Shuffle,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import { IconButton, Select } from "./components";
import { CHORDS, LOCK_PARAMS, PARAMS, noteName } from "./model";
import type { Condition, Param, Pattern, Project, Step } from "./model";
import { useState } from "react";

type Props = {
  project: Project;
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
  onPaste: () => void;
  onClear: () => void;
  onRandom: () => void;
  hasClipboard: boolean;
};
export default function Sequencer(p: Props) {
  const { project, track, selectedStep, page } = p,
    pattern = project.tracks[track].patterns[project.activePattern],
    step = pattern.steps[selectedStep];
  const [addLock, setAddLock] = useState<Param>("cutoff");
  const change = (patch: Partial<Step>) => p.onStep(track, selectedStep, patch);
  return (
    <section className="sequencer">
      <header className="sequencer-header">
        <div className="section-heading">
          <Layers3 size={16} />
          <h2>Step sequencer</h2>
          <span className="tag">PATTERN A0{project.activePattern + 1}</span>
          {p.recording && (
            <span className="record-tag">
              <i /> LIVE REC
            </span>
          )}
        </div>
        <div className="sequencer-actions">
          <button
            className={`small-button fill-button ${p.fill ? "on" : ""}`}
            onClick={() => p.setFill(!p.fill)}
            title="Fill-Bedingungen aktivieren"
          >
            FILL
          </button>
          <IconButton label="Pattern kopieren" onClick={p.onCopy}>
            <Copy size={14} />
          </IconButton>
          <IconButton
            label="Pattern einfügen"
            disabled={!p.hasClipboard}
            onClick={p.onPaste}
          >
            <Layers3 size={14} />
          </IconButton>
          <IconButton label="Pattern generieren" onClick={p.onRandom}>
            <Dice5 size={15} />
          </IconButton>
          <IconButton label="Pattern leeren" onClick={p.onClear}>
            <Trash2 size={14} />
          </IconButton>
        </div>
      </header>
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
        <div className="pattern-settings">
          <label>
            LENGTH
            <input
              aria-label="Pattern length"
              type="number"
              min="1"
              max="64"
              value={pattern.length}
              onChange={(e) =>
                p.onPattern(track, {
                  length: Math.min(64, Math.max(1, +e.target.value || 1)),
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
              onClick={() => p.setPage(Math.min(3, page + 1))}
              disabled={page === 3}
            >
              <ChevronRight size={12} />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="sequence-grid">
        <div className="step-numbers">
          <span>TRACK / TRIG</span>
          <div>
            {Array.from({ length: 16 }, (_, i) => (
              <span className={i % 4 === 0 ? "beat" : ""} key={i}>
                {String(page * 16 + i + 1).padStart(2, "0")}
              </span>
            ))}
          </div>
          <span />
        </div>
        {project.tracks.map((t, ti) => {
          const pat = t.patterns[project.activePattern];
          return (
            <div
              className={`sequence-track ${ti === track ? "selected" : ""} ${t.mute ? "muted-track" : ""}`}
              key={t.id}
              style={{ "--step-color": t.color } as React.CSSProperties}
            >
              <button
                className="sequence-track-label"
                onClick={() => p.selectTrack(ti)}
              >
                <i />
                <span>0{ti + 1}</span>
                <b>{t.name}</b>
              </button>
              <div className="steps">
                {Array.from({ length: 16 }, (_, i) => {
                  const index = page * 16 + i,
                    s = pat.steps[index],
                    hasLock = Object.keys(s.locks).length > 0;
                  return (
                    <button
                      key={index}
                      className={`step ${s.on ? "enabled" : ""} ${index === selectedStep && ti === track ? "inspected" : ""} ${p.playing && p.playheads[ti] === index ? "playhead" : ""} ${index >= pat.length ? "outside" : ""} ${i % 4 === 0 ? "beat-start" : ""}`}
                      aria-label={`Track ${ti + 1} Step ${index + 1} ${s.on ? "on" : "off"}`}
                      aria-pressed={s.on}
                      title={`${noteName(s.note)} · ${Math.round(s.velocity * 100)}%${hasLock ? " · Parameter locks" : ""}\nKlick: Trig · Shift/Rechtsklick: bearbeiten`}
                      onClick={(e) => {
                        p.selectTrack(ti);
                        p.setStep(index);
                        if (!e.shiftKey && index < pat.length)
                          p.onStep(ti, index, { on: !s.on });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        p.selectTrack(ti);
                        p.setStep(index);
                      }}
                    >
                      <span>{s.on ? noteName(s.note) : "·"}</span>
                      {hasLock && <i className="step-lock" />}
                      {s.probability < 1 && s.on && (
                        <small>{Math.round(s.probability * 100)}</small>
                      )}
                      {s.retrig > 1 && s.on && <em>{"ı".repeat(s.retrig)}</em>}
                      <b style={{ height: `${s.velocity * 100}%` }} />
                    </button>
                  );
                })}
              </div>
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
      <div className="step-editor">
        <div className="step-editor-label">
          <span className="eyebrow">TRIG EDITOR</span>
          <strong>Step {String(selectedStep + 1).padStart(2, "0")}</strong>
        </div>
        <label>
          NOTE
          <input
            aria-label="Step note"
            type="number"
            min="24"
            max="96"
            value={step.note}
            onChange={(e) =>
              change({
                note: Math.round(
                  Math.min(96, Math.max(24, +e.target.value || 24)),
                ),
              })
            }
          />
          <output>{noteName(step.note)}</output>
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
      {(p.lockMode || Object.keys(step.locks).length > 0) && (
        <div className="lock-editor">
          <span>
            <LockKeyhole size={12} /> PARAMETER LOCKS
          </span>
          {Object.entries(step.locks).map(([key, value]) => (
            <div className="lock-chip" key={key}>
              <b>{key}</b>
              <input
                aria-label={`Lock ${key}`}
                type="number"
                step="any"
                min={PARAMS[key as Param][0]}
                max={PARAMS[key as Param][1]}
                value={Number(value.toFixed(3))}
                onChange={(e) =>
                  change({
                    locks: {
                      ...step.locks,
                      [key]: Math.min(
                        PARAMS[key as Param][1],
                        Math.max(PARAMS[key as Param][0], +e.target.value),
                      ),
                    },
                  })
                }
              />
              <button
                aria-label={`Remove ${key} lock`}
                onClick={() => {
                  const locks = { ...step.locks };
                  delete locks[key as Param];
                  change({ locks });
                }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {p.lockMode && (
            <>
              <Select
                label="Parameter für Lock"
                value={addLock}
                onChange={(v) => setAddLock(v as Param)}
              >
                {LOCK_PARAMS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </Select>
              <button
                className="small-button"
                onClick={() =>
                  change({
                    on: true,
                    locks: {
                      ...step.locks,
                      [addLock]: project.tracks[track].patch[addLock],
                    },
                  })
                }
              >
                + Lock
              </button>
              <small>Instrument-Regler bewegen, um Werte zu verriegeln.</small>
            </>
          )}
        </div>
      )}
      <footer className="sequencer-footer">
        <span>
          <i /> {p.playing ? "SEQUENCER RUNNING" : "SEQUENCER READY"}
        </span>
        <span>
          <Shuffle size={11} /> PER-TRACK LENGTH & SPEED
        </span>
        <span>
          Klick: Trig <b>·</b> Shift + Klick: bearbeiten <b>·</b> P-Lock: Regler
          verriegeln
        </span>
        <button
          onClick={() => {
            p.onPattern(track, { direction: "forward", division: 16 });
          }}
          title="Auflösung und Richtung zurücksetzen"
        >
          <RotateCcw size={11} /> RESET TIMING
        </button>
      </footer>
    </section>
  );
}
