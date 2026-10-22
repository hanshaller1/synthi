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
  Upload,
  Waves,
  X,
} from "lucide-react";
import {
  EnvelopeGraph,
  IconButton,
  Knob,
  Select,
  Waveform,
  formatHz,
  formatTime,
  percent,
} from "./components";
import { ENGINES, PARAMS, noteName } from "./model";
import type { Lfo, ModSource, ModTarget, Param, Patch, Wave } from "./model";

type Props = {
  patch: Patch;
  color: string;
  track: number;
  tempo: number;
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
  const waveSelect = (key: "wave" | "wave2", label: string) => (
    <Select
      label={label}
      value={p[key]}
      onChange={(v) => onPatch({ [key]: v })}
    >
      <option value="sawtooth">Sawtooth</option>
      <option value="square">Square</option>
      <option value="triangle">Triangle</option>
      <option value="sine">Sine</option>
    </Select>
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
        ],
      });
    return (
      <section className="module lfo-module" key={index}>
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
        <Waveform patch={{ ...p, engine: "subtractive", wave: l.shape }} />
        <div className="lfo-controls">
          <Select
            label={`LFO ${index + 1} Wellenform`}
            value={l.shape}
            onChange={(v) => change({ shape: v as Wave })}
          >
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
            <option value="square">Square</option>
            <option value="sawtooth">Sawtooth</option>
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
          <div className="module-grid synth-grid">
            <section className="module oscillator-module">
              <div className="module-title">
                <h3>
                  <AudioLines size={14} />{" "}
                  {p.engine === "subtractive"
                    ? "Oscillators"
                    : ENGINES.find((e) => e.id === p.engine)?.label}
                </h3>
                <span className="module-index">01</span>
              </div>
              <div className="osc-display">
                <div className="display-meta">
                  <span>
                    {p.engine === "subtractive"
                      ? "OSC 1 + OSC 2"
                      : p.engine.toUpperCase()}
                  </span>
                  <span>
                    {p.tune > 0 ? "+" : ""}
                    {Math.round(p.tune)} ST
                  </span>
                </div>
                <Waveform patch={p} />
                <div className="display-meta">
                  <span>32-BIT FLOAT ENGINE</span>
                  <span>∿</span>
                </div>
              </div>
              {(p.engine === "subtractive" ||
                p.engine === "ring" ||
                p.engine === "fm") && (
                <div className="osc-waves">
                  <label>
                    OSC 1{waveSelect("wave", "Oscillator 1 waveform")}
                  </label>
                  <label>
                    {p.engine === "fm" ? "MODULATOR" : "OSC 2"}
                    {waveSelect("wave2", "Oscillator 2 waveform")}
                  </label>
                </div>
              )}
              <div className="knob-row osc-knobs">
                {p.engine === "subtractive" && (
                  <>
                    {knob("detune", "Detune", (v) => `${v.toFixed(1)} ct`)}
                    {knob("mix", "Osc mix")}
                    {knob("sub", "Sub level")}
                  </>
                )}
                {p.engine === "wavetable" && (
                  <>
                    {knob("shape", "WT position")}
                    {knob("detune", "Detune", (v) => `${v.toFixed(1)} ct`)}
                    {knob("sub", "Sub level")}
                  </>
                )}
                {p.engine === "fm" && (
                  <>
                    {knob(
                      "fmRatio",
                      "Ratio",
                      (v) => `${v.toFixed(2)}×`,
                      false,
                      0.25,
                    )}
                    {knob("fmIndex", "FM index", (v) => v.toFixed(2))}
                    {knob("sub", "Sub level")}
                  </>
                )}
                {p.engine === "additive" && (
                  <>
                    {knob(
                      "harmonics",
                      "Partials",
                      (v) => `${Math.round(v)}`,
                      false,
                      1,
                    )}
                    {knob("brightness", "Brightness")}
                    {knob("shape", "Odd / even")}
                  </>
                )}
                {p.engine === "ring" && (
                  <>
                    {knob("fmRatio", "Ratio", (v) => `${v.toFixed(2)}×`)}
                    {knob("shape", "AM → Ring")}
                    {knob("sub", "Sub level")}
                  </>
                )}
                {p.engine === "physical" && (
                  <>
                    {knob(
                      "damping",
                      "Damping",
                      (v) => `${(v * 100).toFixed(1)}%`,
                    )}
                    {knob("brightness", "Excitation")}
                    {knob(
                      "tune",
                      "Transpose",
                      (v) => `${Math.round(v)} st`,
                      false,
                      1,
                    )}
                  </>
                )}
                {p.engine === "granular" && (
                  <>
                    {knob("grainSize", "Grain size", formatTime, true)}
                    {knob(
                      "grainDensity",
                      "Density",
                      (v) => `${Math.round(v)} / s`,
                      false,
                      1,
                    )}
                    {knob("position", "Position")}
                  </>
                )}
                {p.engine === "sampler" && (
                  <>
                    {knob("sampleStart", "Start")}
                    {knob("sampleEnd", "End")}
                    {knob(
                      "sampleRoot",
                      "Root note",
                      (v) => noteName(Math.round(v)),
                      false,
                      1,
                    )}
                  </>
                )}
              </div>
              {p.engine === "sampler" || p.engine === "granular" ? (
                <div className="sample-row">
                  <label className="small-button upload">
                    <Upload size={12} />
                    <span>{p.sample ? p.sampleName : "Load sample"}</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) props.onSample(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {p.sample && (
                    <IconButton
                      label="Sample entfernen; interne Textur verwenden"
                      onClick={() =>
                        onPatch({
                          sample: null,
                          sampleName: "Built-in texture",
                        })
                      }
                    >
                      <X size={12} />
                    </IconButton>
                  )}
                  {p.engine === "sampler" ? (
                    <button
                      className={`small-button ${p.sampleLoop ? "on" : ""}`}
                      onClick={() => onPatch({ sampleLoop: !p.sampleLoop })}
                    >
                      LOOP
                    </button>
                  ) : (
                    <label className="inline-range">
                      Spread
                      <input
                        aria-label="Grain spread"
                        type="range"
                        min="0"
                        max="1"
                        step=".01"
                        value={p.spread}
                        onChange={(e) => onParam("spread", +e.target.value)}
                      />
                    </label>
                  )}
                </div>
              ) : (
                <div className="osc-bottom">
                  <label className="inline-range">
                    NOISE
                    <input
                      aria-label="Noise level"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={p.noise}
                      onChange={(e) => onParam("noise", +e.target.value)}
                    />
                    <output>{percent(p.noise)}</output>
                  </label>
                </div>
              )}
              {p.voiceMode === "mono" && (
                <div className="mono-controls">
                  <button
                    className={`small-button ${p.legato ? "on" : ""}`}
                    onClick={() => onPatch({ legato: !p.legato })}
                  >
                    LEGATO {p.legato ? "ON" : "OFF"}
                  </button>
                  <label>
                    GLIDE
                    <input
                      aria-label="Portamento"
                      type="range"
                      min="0"
                      max="2"
                      step=".01"
                      value={p.glide}
                      onChange={(e) => onParam("glide", +e.target.value)}
                    />
                    <output>{formatTime(p.glide)}</output>
                  </label>
                </div>
              )}
            </section>
            <section className="module filter-module">
              <div className="module-title">
                <h3>
                  <SlidersHorizontal size={14} /> Filter
                </h3>
                <Select
                  label="Filter-Typ"
                  value={p.filterType}
                  onChange={(v) =>
                    onPatch({ filterType: v as BiquadFilterType })
                  }
                >
                  <option value="lowpass">LP 12 dB</option>
                  <option value="highpass">HP 12 dB</option>
                  <option value="bandpass">Bandpass</option>
                  <option value="notch">Notch</option>
                </Select>
              </div>
              <div className="filter-response">
                <span className="display-meta">FREQUENCY RESPONSE</span>
                <svg
                  viewBox="0 0 250 60"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient
                      id="filter-area"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0"
                        stopColor="currentColor"
                        stopOpacity=".18"
                      />
                      <stop
                        offset="1"
                        stopColor="currentColor"
                        stopOpacity="0"
                      />
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
                  {(() => {
                    const x =
                        35 +
                        (Math.log((props.locks.cutoff ?? p.cutoff) / 30) /
                          Math.log(600)) *
                          165,
                      q = p.resonance;
                    const d =
                      p.filterType === "highpass"
                        ? `M0 56 C${x - 35} 56 ${x - 15} 56 ${x} ${22 - q} S${x + 15} 22 250 22`
                        : p.filterType === "bandpass"
                          ? `M0 56 C${x - 30} 56 ${x - 20} ${30 - q} ${x} ${25 - q} S${x + 25} 56 250 56`
                          : p.filterType === "notch"
                            ? `M0 22 L${x - 25} 22 Q${x} 105 ${x + 25} 22 L250 22`
                            : `M0 22 L${x - 15} 22 Q${x} ${15 - q} ${x + 8} ${30 - q} C${x + 20} 50 ${x + 40} 56 250 56`;
                    return (
                      <>
                        <path
                          d={`${d} L250 60 L0 60 Z`}
                          fill="url(#filter-area)"
                        />
                        <path
                          d={d}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                      </>
                    );
                  })()}
                </svg>
                <div className="display-meta">
                  <span>20 Hz</span>
                  <span>20 kHz</span>
                </div>
              </div>
              <div className="knob-row filter-knobs">
                {knob("cutoff", "Cutoff", formatHz, true)}
                {knob("resonance", "Resonance", (v) => `${v.toFixed(1)} Q`)}
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
                    {p.filterAmount > 0 ? "+" : ""}
                    {(props.locks.filterAmount ?? p.filterAmount).toFixed(1)}
                  </output>
                </label>
              </div>
              <EnvelopeGraph
                kind="filter"
                env={{
                  attack: p.filterAttack,
                  decay: p.filterDecay,
                  sustain: p.filterSustain,
                  release: p.filterRelease,
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
                  attack: p.attack,
                  decay: p.decay,
                  sustain: p.sustain,
                  release: p.release,
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
              <b>LFO 1</b>
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
          <div className="lfo-grid">
            {lfo(0)}
            {lfo(1)}
          </div>
          <section className="module matrix-module">
            <div className="module-title">
              <h3>
                <SlidersHorizontal size={14} /> Modulation matrix
              </h3>
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
              <div className="matrix-row" key={i}>
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
                onClick={() =>
                  onPatch({
                    mods: [
                      ...p.mods,
                      { source: "lfo2", target: "pitch", amount: 0.05 },
                    ],
                  })
                }
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
        <div className="effects-grid">
          {[
            {
              title: "Saturation",
              index: "01",
              description: "Soft-clipping drive",
              controls: (
                <>
                  {knob("distortion", "Drive")}
                  {knob("drive", "Pre-filter drive")}
                </>
              ),
            },
            {
              title: "Stereo chorus",
              index: "02",
              description: "Modulated delay · 0.65 Hz",
              controls: (
                <>
                  {knob("chorus", "Wet level")}
                  {knob("pan", "Balance", (v) =>
                    Math.abs(v) < 0.02 ? "Center" : `${Math.round(v * 100)}`,
                  )}
                </>
              ),
            },
            {
              title: "Tape delay",
              index: "03",
              description: "Feedback echo",
              controls: (
                <>
                  {knob("delayTime", "Time", formatTime, true)}
                  {knob("feedback", "Feedback")}
                  {knob("delay", "Wet level")}
                </>
              ),
            },
            {
              title: "Space reverb",
              index: "04",
              description: "Stereo convolution",
              controls: (
                <>
                  {knob("reverbSize", "Decay", formatTime, true)}
                  {knob("reverb", "Wet level")}
                </>
              ),
            },
          ].map((fx) => (
            <section className="module effect-module" key={fx.title}>
              <div className="module-title">
                <h3>
                  <Sparkles size={14} /> {fx.title}
                </h3>
                <span className="module-index">{fx.index}</span>
              </div>
              <span className="effect-description">{fx.description}</span>
              <div className="effect-visual">
                {Array.from({ length: 25 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      height: `${12 + Math.sin(i * 0.7) * Math.sin(i * 1.9) * 25 + 25}px`,
                      opacity: 0.3 + Math.abs(Math.sin(i * 0.4)) * 0.5,
                    }}
                  />
                ))}
              </div>
              <div className="knob-row">{fx.controls}</div>
              {fx.title === "Tape delay" && (
                <div className="delay-sync">
                  {[0.25, 0.5, 0.75, 1].map((beat) => (
                    <button
                      className="small-button"
                      key={beat}
                      onClick={() =>
                        onParam(
                          "delayTime",
                          Math.min(1.5, (60 / props.tempo) * beat),
                        )
                      }
                    >
                      {beat === 0.25
                        ? "1/16"
                        : beat === 0.5
                          ? "1/8"
                          : beat === 0.75
                            ? "1/8 D"
                            : "1/4"}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
