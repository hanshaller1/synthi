import ModulationEditor from "./ModulationEditor";
import { MOD_SOURCES } from "./modulation-spec";
import { getParameter, setParameters } from "./parameters";
import { sampleSliceSelection } from "./engine-config";
import SourceEditor from "./SourceEditor";
import FxRack from "./FxRack";
import FilterEditor from "./FilterEditor";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Dices,
  FolderOpen,
  Radio,
  Save,
  SlidersHorizontal,
  Sparkles,
  Waves,
} from "lucide-react";
import {
  EnvelopeGraph,
  IconButton,
  Knob,
  Select,
  PanelHeader,
  formatTime,
  percent,
} from "./components";
import { ENGINES, MOD_TARGETS, PARAMS } from "./model";
import type {
  MidiTarget,
  ModSource,
  Param,
  Patch,
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
  onCheckpoint: () => void;
  onParam: (key: Param, value: number) => void;
  locks: Partial<Record<Param, number>>;
  onLearn: (key: MidiTarget) => void;
  onLibrary: () => void;
  onSave: () => void;
  onRandom: () => void;
  onPreset: (offset: number) => void;
  onSample: (file: File) => void;
};
const sourceNames=Object.fromEntries(Object.entries(MOD_SOURCES).map(([id,m])=>[id,m.label])) as Record<ModSource,string>;
const targetNames = Object.fromEntries(
  Object.entries(MOD_TARGETS).map(([key, item]) => [key, item.label]),
);
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
      parameterId={key}
      onEdit={props.onCheckpoint}
      label={label}
      value={key === "sampleSlice" ? sampleSliceSelection(props.locks.sampleSlices ?? p.sampleSlices, props.locks.sampleSlice ?? p.sampleSlice).sampleSlice : props.locks[key] ?? getParameter(p,key)}
      min={PARAMS[key][0]}
      max={key === "sampleSlice" ? sampleSliceSelection(props.locks.sampleSlices ?? p.sampleSlices, 0).sampleSlices - 1 : PARAMS[key][1]}
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
  return (
    <section
      className="instrument studio-panel"
      style={{ "--track-color": props.color } as React.CSSProperties}
    >
      <PanelHeader
        icon={<AudioLines size={16} />}
        title="Synthesizer"
        context={
          <>
            <span className="tag">T{props.track + 1} · {ENGINES.find((e) => e.id === p.engine)?.short}</span>
            <Select
              className="panel-engine"
              label="Syntheseform"
              value={p.engine}
              onChange={(engine) => onPatch({ engine: engine as Patch["engine"] })}
            >
              {ENGINES.map((engine) => (
                <option key={engine.id} value={engine.id} title={engine.description}>
                  {engine.label}
                </option>
              ))}
            </Select>
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
            <button className="panel-preset" onClick={props.onLibrary}>
              {p.name}
              <FolderOpen size={14} />
            </button>
          </>
        }
        actions={
        <div className="patch-actions">
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
          <IconButton label="Sound zufällig variieren" onClick={props.onRandom}>
            <Dices size={16} />
          </IconButton>
          <IconButton label="Preset speichern" onClick={props.onSave}>
            <Save size={15} />
          </IconButton>
        </div>
        }
      />
      {tab === "synth" && (
        <>

          <div className="module-grid synth-grid">
            <SourceEditor onCheckpoint={props.onCheckpoint} onLearn={props.onLearn}
              patch={setParameters(p,props.locks)}
              onPatch={onPatch}
              onParam={onParam}
              onSample={props.onSample}
              knob={knob}
            />
            <FilterEditor patch={p} locks={props.locks} sampleRate={props.sampleRate} onPatch={onPatch} onParam={onParam} onCheckpoint={props.onCheckpoint} onLearn={props.onLearn} knob={knob} />
            <section className="module amp-module">
              <div className="module-title">
                <h3>
                  <Radio size={14} /> Amplifier
                </h3>
                <span className="module-index">04</span>
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
              <b>{p.mods.length} / 24</b>
            </span>
          </button>
        </>
      )}
      {tab === "modulation" && <ModulationEditor patch={p} locks={props.locks} tempo={props.tempo} onPatch={onPatch} onParam={onParam} onLearn={props.onLearn} onCheckpoint={props.onCheckpoint} />}
      {tab === "effects" && (
        <FxRack
          patch={p}
          onPatch={onPatch}
          onParam={onParam}
          locks={props.locks}
          tempo={props.tempo}
          onLearn={props.onLearn}
          onCheckpoint={props.onCheckpoint}
        />
      )}
    </section>
  );
}
