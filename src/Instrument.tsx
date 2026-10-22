import SourceEditor from "./SourceEditor";
import FxRack from "./FxRack";
import FilterResponse from "./FilterResponse";
import { lfoValue } from "./lfo";
import { useState } from "react";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Dices,
  FolderOpen,
  Link2,
  Plus,
  Radio,
  Save,
  SlidersHorizontal,
  Sparkles,
  Waves,
  X,
} from "lucide-react";
import {
  EnvelopeGraph,
  IconButton,
  Knob,
  Select,
  formatHz,
  formatTime,
  percent,
} from "./components";
import { ENGINES, MULTIMODE_FILTERS, PARAMS } from "./model";
import type {
  Lfo,
  LfoShape,
  LfoMode,
  ModSource,
  ModTarget,
  Param,
  Patch,
  FilterType,
  MultimodeFilter,
} from "./model";

type Props = {
  patch: Patch;
  color: string;
  track: number;
  tempo: number;
  sampleRate: number;
  tab: string;
  setTab: (tab: string) => void;
  onPatch: (patch: Partial<Patch>) => void;
  onParam: (key: Param, value: number) => void;
  locks: Partial<Record<Param, number>>;
  onLearn: (key: Param) => void;
  onLibrary: () => void;
  onSave: () => void;
  onRandom: () => void;
  onPreset: (offset: number) => void;
  onSample: (file: File) => void;
};
const sourceNames: Record<ModSource, string> = {
  lfo1: "LFO 1",
  lfo2: "LFO 2",
  lfo3: "LFO 3",
  velocity: "Velocity",
  keytrack: "Key tracking",
  modwheel: "Mod wheel",
  filterEnv: "Filter envelope",
};
const targetNames: Record<ModTarget, string> = {
  cutoff: "Filter cutoff",
  pitch: "Pitch",
  amplitude: "Amplitude",
  pan: "Stereo pan",
  fmIndex: "FM index",
};
export default function Instrument(props: Props) {
  const { patch: p, onPatch, onParam, tab, setTab } = props;
  const [section, setSection] = useState("oscillator");
  const [activeLfo, setActiveLfo] = useState(0);
  const [routePage, setRoutePage] = useState(0);
  const [modPage, setModPage] = useState("lfos");
  const knob = (
    key: Param,
    label: string,
    format = percent,
    log = false,
    step?: number,
  ) => (
    <Knob
      key={key}
      label={label}
      value={props.locks[key] ?? p[key]}
      min={PARAMS[key][0]}
      max={PARAMS[key][1]}
      defaultValue={PARAMS[key][2]}
      onChange={(v) => onParam(key, v)}
      format={format}
      log={log}
      step={step}
      locked={key in props.locks}
      onLearn={() => props.onLearn(key)}
    />
  );
  const adsr = (filter: boolean) => (
    <div className="knob-row envelope-knobs">
      {(filter
        ? ["filterAttack", "filterDecay", "filterSustain", "filterRelease"]
        : ["attack", "decay", "sustain", "release"]
      ).map((key, i) =>
        knob(
          key as Param,
          ["Attack", "Decay", "Sustain", "Release"][i],
          i === 2 ? percent : formatTime,
          i !== 2,
        ),
      )}
    </div>
  );
  const lfo = (index: number) => {
    const l = p.lfos[index];
    const change = (v: Partial<Lfo>) =>
      onPatch({
        lfos: p.lfos.map((x, i) => (i === index ? { ...x, ...v } : x)) as [
          Lfo,
          Lfo,
          Lfo,
        ],
      });
    return (
      <section className="module lfo-module" key={index} data-lfo={index}>
        <div className="module-title">
          <h3>
            <Waves size={14} /> LFO {index + 1}
          </h3>
          <button
            className={`small-button ${l.sync ? "on" : ""}`}
            onClick={() => change({ sync: !l.sync })}
          >
            <Link2 size={11} />
            {l.sync ? "SYNC" : "FREE"}
          </button>
        </div>
        <svg
          className="waveform lfo-waveform"
          viewBox="0 0 240 70"
          preserveAspectRatio="none"
          role="img"
          aria-label={`LFO ${index + 1} ${l.shape} ${l.mode}`}
        >
          <path
            d={Array.from(
              { length: 241 },
              (_, i) =>
                `${i ? "L" : "M"}${i},${35 - lfoValue(l.shape, i / 120, 1) * 25}`,
            ).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <div className="lfo-controls">
          <Select
            label={`LFO ${index + 1} Wellenform`}
            value={l.shape}
            onChange={(v) => change({ shape: v as LfoShape })}
          >
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
            <option value="square">Square</option>
            <option value="sawtooth">Sawtooth</option>
            <option value="exp">Exp</option>
            <option value="ramp">Ramp</option>
            <option value="random">Random</option>
          </Select>
          <Select
            label={`LFO ${index + 1} Modus`}
            value={l.mode}
            onChange={(v) => change({ mode: v as LfoMode })}
          >
            <option value="free">Free · laufend</option>
            <option value="hold">Hold · Wert halten</option>
            <option value="one">One · ein Zyklus</option>
            <option value="half">Half · halber Zyklus</option>
          </Select>
          <button
            className={`small-button ${l.retrigger ? "on" : ""}`}
            onClick={() => change({ retrigger: !l.retrigger })}
          >
            RETRIG {l.retrigger ? "ON" : "OFF"}
          </button>
        </div>
        <div className="knob-row">
          <Knob
            label={l.sync ? "Division" : "Rate"}
            defaultValue={l.sync ? [4, 2, 8][index] : [0.6, 2, 0.15][index]}
            value={l.sync ? l.division : l.rate}
            min={l.sync ? 0.25 : 0.02}
            max={l.sync ? 16 : 30}
            log
            format={(v) =>
              l.sync
                ? `${v.toFixed(v < 1 ? 2 : 1)} beats`
                : `${v.toFixed(2)} Hz`
            }
            onChange={(v) => change(l.sync ? { division: v } : { rate: v })}
          />
          <Knob
            label="Depth"
            defaultValue={[0.35, 0.25, 0.3][index]}
            value={l.depth}
            onChange={(v) => change({ depth: v })}
          />
        </div>
      </section>
    );
  };
  return (
    <section
      className="instrument"
      data-section={section}
      data-mod-page={modPage}
      data-lfo={activeLfo}
      data-route-page={p.mods.length <= 4 ? 0 : routePage}
      style={{ "--track-color": props.color } as React.CSSProperties}
    >
      <div className="instrument-header">
        <div className="instrument-identity">
          <div className="track-badge">0{props.track + 1}</div>
          <div>
            <div className="eyebrow">
              SOUND ENGINE <span className="muted">/</span>{" "}
              {ENGINES.find((e) => e.id === p.engine)?.short}
            </div>
            <button className="patch-name" onClick={props.onLibrary}>
              {p.name}
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
        <div className="patch-actions">
          <span className="voice-badge">
            <i />{" "}
            {p.voiceMode === "poly"
              ? "POLYPHONIC"
              : p.voiceMode === "para"
                ? "PARAPHONIC"
                : "MONOPHONIC"}
          </span>
          <div className="button-pair">
            <IconButton
              label="Vorheriges Preset"
              onClick={() => props.onPreset(-1)}
            >
              <ChevronLeft size={15} />
            </IconButton>
            <IconButton
              label="Nächstes Preset"
              onClick={() => props.onPreset(1)}
            >
              <ChevronRight size={15} />
            </IconButton>
          </div>
          <IconButton label="Sound zufällig variieren" onClick={props.onRandom}>
            <Dices size={16} />
          </IconButton>
          <IconButton label="Preset speichern" onClick={props.onSave}>
            <Save size={15} />
          </IconButton>
        </div>
      </div>
      <div className="engine-selector" aria-label="Syntheseform">
        {ENGINES.map((e, i) => (
          <button
            key={e.id}
            className={p.engine === e.id ? "selected" : ""}
            onClick={() => onPatch({ engine: e.id })}
            title={e.description}
          >
            <span>0{i + 1}</span>
            {e.label}
            {p.engine === e.id && <i />}
          </button>
        ))}
      </div>
      <div className="instrument-toolbar">
        <div className="tabs" role="tablist" aria-label="Instrument-Bereich">
          {[
            { id: "synth", label: "Synthesis", icon: AudioLines },
            { id: "modulation", label: "Modulation", icon: SlidersHorizontal },
            { id: "effects", label: "Effects", icon: Sparkles },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={13} />
              {t.label}
              {t.id === "modulation" && <small>{p.mods.length}</small>}
            </button>
          ))}
        </div>
        <div className="voice-mode">
          <span>VOICE</span>
          <Select
            label="Stimmenmodus"
            value={p.voiceMode}
            onChange={(v) => onPatch({ voiceMode: v as Patch["voiceMode"] })}
          >
            <option value="poly">Polyphonic</option>
            <option value="para">Paraphonic</option>
            <option value="mono">Monophonic</option>
          </Select>
        </div>
      </div>
      {tab === "synth" && (
        <>
          <nav className="module-switch" aria-label="Synthesizer-Modul">
            {[
              ["oscillator", "Klangquelle"],
              ["filter", "Filter"],
              ["amp", "Amp / Output"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={section === id ? "active" : ""}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="module-grid synth-grid">
            <SourceEditor
              patch={p}
              onPatch={onPatch}
              onParam={onParam}
              onSample={props.onSample}
              knob={knob}
            />
            <section
              className="module filter-module"
              data-filter={p.filterType}
            >
              <div className="module-title">
                <h3>
                  <SlidersHorizontal size={14} /> Filter
                </h3>
                <Select
                  label="Filter-Typ"
                  value={p.filterType}
                  onChange={(v) => onPatch({ filterType: v as FilterType })}
                >
                  <option value="lowpass">LP 12 dB</option>
                  <option value="highpass">HP 12 dB</option>
                  <option value="bandpass">Bandpass</option>
                  <option value="notch">Notch</option>
                  <option value="multimode">Multimode</option>
                  <option
                    value="comb"
                    disabled={typeof AudioWorkletNode === "undefined"}
                  >
                    Comb
                  </option>
                </Select>
              </div>
              <div className="filter-model-options">
                <span>
                  {p.filterType === "comb"
                    ? "FEEDBACK POLARITY"
                    : p.filterType === "multimode"
                      ? "MULTIMODE TYPE"
                      : "CLASSIC · RESONANT"}
                </span>
                {p.filterType === "multimode" && (
                  <Select
                    label="Multimode-Charakteristik"
                    value={p.multimodeType}
                    onChange={(v) =>
                      onPatch({ multimodeType: v as MultimodeFilter })
                    }
                  >
                    {MULTIMODE_FILTERS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                )}
                {p.filterType === "comb" && (
                  <Select
                    label="Comb-Polarität"
                    value={p.combPolarity}
                    onChange={(v) =>
                      onPatch({ combPolarity: v as Patch["combPolarity"] })
                    }
                  >
                    <option value="positive">Comb + · positive</option>
                    <option value="negative">Comb − · negative</option>
                  </Select>
                )}
              </div>
              <FilterResponse
                patch={p}
                locks={props.locks}
                sampleRate={props.sampleRate}
              />
              <div className="knob-row filter-knobs">
                {knob(
                  "cutoff",
                  p.filterType === "comb" ? "Frequency" : "Cutoff",
                  formatHz,
                  true,
                )}
                {p.filterType === "comb" ? (
                  <>
                    {knob("combFeedback", "Feedback")}
                    {knob("combDamping", "Damping", formatHz, true)}
                    {knob("combMix", "Dry / Wet")}
                  </>
                ) : (
                  knob(
                    "resonance",
                    p.filterType === "multimode" && p.multimodeType === "peak"
                      ? "Peak gain"
                      : "Resonance",
                    (v) =>
                      p.filterType === "multimode" && p.multimodeType === "peak"
                        ? `${v.toFixed(1)} dB`
                        : `${Math.round((v / 20) * 100)}%`,
                  )
                )}
                {knob("drive", "Drive")}
              </div>
              <div className="filter-envelope-title">
                <span>FILTER ENVELOPE</span>
                <label>
                  AMOUNT
                  <input
                    aria-label="Filter envelope amount"
                    type="range"
                    min="-6"
                    max="6"
                    step=".1"
                    value={props.locks.filterAmount ?? p.filterAmount}
                    onChange={(e) => onParam("filterAmount", +e.target.value)}
                  />
                  <output>
                    {(props.locks.filterAmount ?? p.filterAmount) > 0 ? "+" : ""}
                    {(props.locks.filterAmount ?? p.filterAmount).toFixed(1)}
                  </output>
                </label>
              </div>
              <EnvelopeGraph
                kind="filter"
                env={{
                  attack: props.locks.filterAttack ?? p.filterAttack,
                  decay: props.locks.filterDecay ?? p.filterDecay,
                  sustain: props.locks.filterSustain ?? p.filterSustain,
                  release: props.locks.filterRelease ?? p.filterRelease,
                }}
              />
              {adsr(true)}
            </section>
            <section className="module amp-module">
              <div className="module-title">
                <h3>
                  <Radio size={14} /> Amplifier
                </h3>
                <span className="module-index">03</span>
              </div>
              <div className="amp-envelope-heading">
                <span>AMPLITUDE ENVELOPE</span>
                <span className="tag">ADSR</span>
              </div>
              <EnvelopeGraph
                kind="amp"
                env={{
                  attack: props.locks.attack ?? p.attack,
                  decay: props.locks.decay ?? p.decay,
                  sustain: props.locks.sustain ?? p.sustain,
                  release: props.locks.release ?? p.release,
                }}
              />
              {adsr(false)}
              <div className="amp-divider" />
              <div className="knob-row output-knobs">
                {knob("level", "Level")}
                {knob("pan", "Pan", (v) =>
                  Math.abs(v) < 0.02
                    ? "Center"
                    : `${Math.round(Math.abs(v) * 100)} ${v < 0 ? "L" : "R"}`,
                )}
                {knob(
                  "tune",
                  "Transpose",
                  (v) => `${v > 0 ? "+" : ""}${Math.round(v)} st`,
                  false,
                  1,
                )}
              </div>
              <div className="signal-flow">
                <span>VOICE</span>
                <i />
                <span>FILTER</span>
                <i />
                <span>AMP</span>
                <i />
                <span>FX</span>
              </div>
            </section>
          </div>
          <button
            className="modulation-strip"
            onClick={() => setTab("modulation")}
          >
            <span>
              <Waves size={13} />
              <b>3 LFOs</b>
              <span>{p.lfos[0].shape.toUpperCase()}</span>
              <em>
                {p.lfos[0].sync
                  ? `${p.lfos[0].division} beats`
                  : `${p.lfos[0].rate.toFixed(2)} Hz`}
              </em>
            </span>
            <span className="mod-route">
              <i />{" "}
              {p.mods.length
                ? `${sourceNames[p.mods[0].source]} → ${targetNames[p.mods[0].target]}`
                : "Add modulation"}{" "}
              <ChevronRight size={12} />
            </span>
            <span>
              <SlidersHorizontal size={12} /> MOD MATRIX{" "}
              <b>{p.mods.length} / 8</b>
            </span>
          </button>
        </>
      )}
      {tab === "modulation" && (
        <div className="modulation-layout">
          <nav className="mod-mobile-tabs" aria-label="Modulationsbereich">
            <button
              className={modPage === "lfos" ? "active" : ""}
              onClick={() => setModPage("lfos")}
            >
              3 LFOs
            </button>
            <button
              className={modPage === "matrix" ? "active" : ""}
              onClick={() => setModPage("matrix")}
            >
              Modulation matrix
            </button>
          </nav>
          <nav className="lfo-switch" aria-label="LFO auswählen">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                className={activeLfo === index ? "active" : ""}
                onClick={() => setActiveLfo(index)}
              >
                LFO {index + 1}
              </button>
            ))}
          </nav>
          <div className="lfo-grid">{[0, 1, 2].map(lfo)}</div>
          <section className="module matrix-module">
            <div className="module-title">
              <h3>
                <SlidersHorizontal size={14} /> Modulation matrix
              </h3>
              <nav
                className="route-pages"
                aria-label="Modulationsrouten auswählen"
              >
                {[0, 1].map((page) => (
                  <button
                    key={page}
                    disabled={page === 1 && p.mods.length < 5}
                    className={
                      (p.mods.length <= 4 ? 0 : routePage) === page
                        ? "active"
                        : ""
                    }
                    onClick={() => setRoutePage(page)}
                  >
                    {page ? "5–8" : "1–4"}
                  </button>
                ))}
              </nav>
              <span className="module-index">{p.mods.length} / 8 ROUTES</span>
            </div>
            <div className="matrix-heading">
              <span>SOURCE</span>
              <span />
              <span>DESTINATION</span>
              <span>AMOUNT</span>
              <span />
            </div>
            {p.mods.map((mod, i) => (
              <div
                className="matrix-row"
                key={i}
                data-route-page={Math.floor(i / 4)}
              >
                <Select
                  label={`Modulation ${i + 1} source`}
                  value={mod.source}
                  onChange={(v) =>
                    onPatch({
                      mods: p.mods.map((m, j) =>
                        j === i ? { ...m, source: v as ModSource } : m,
                      ),
                    })
                  }
                >
                  {Object.entries(sourceNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                <span className="route-arrow">→</span>
                <Select
                  label={`Modulation ${i + 1} destination`}
                  value={mod.target}
                  onChange={(v) =>
                    onPatch({
                      mods: p.mods.map((m, j) =>
                        j === i ? { ...m, target: v as ModTarget } : m,
                      ),
                    })
                  }
                >
                  {Object.entries(targetNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
                <label className="mod-amount">
                  <input
                    aria-label={`Modulation ${i + 1} amount`}
                    type="range"
                    min="-1"
                    max="1"
                    step=".01"
                    value={mod.amount}
                    onChange={(e) =>
                      onPatch({
                        mods: p.mods.map((m, j) =>
                          j === i ? { ...m, amount: +e.target.value } : m,
                        ),
                      })
                    }
                  />
                  <output>
                    {mod.amount > 0 ? "+" : ""}
                    {Math.round(mod.amount * 100)}%
                  </output>
                </label>
                <IconButton
                  label={`Modulation ${i + 1} entfernen`}
                  onClick={() =>
                    onPatch({ mods: p.mods.filter((_, j) => j !== i) })
                  }
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
            {p.mods.length < 8 && (
              <button
                className="add-route"
                onClick={() => {
                  setRoutePage(Math.floor(p.mods.length / 4));
                  onPatch({
                    mods: [
                      ...p.mods,
                      { source: "lfo3", target: "pitch", amount: 0.05 },
                    ],
                  });
                }}
              >
                <Plus size={13} /> Add modulation route
              </button>
            )}
            <div className="module-note">
              Audio-rate modulation · bipolare Tiefe · bis zu 8 Verbindungen
            </div>
          </section>
        </div>
      )}
      {tab === "effects" && (
        <FxRack
          patch={p}
          onPatch={onPatch}
          onParam={onParam}
          locks={props.locks}
          tempo={props.tempo}
          onLearn={props.onLearn}
        />
      )}
    </section>
  );
}
