import type { ReactNode } from "react";
import { EnvelopeGraph, Select, formatHz, formatTime, percent } from "./components";
import { ENGINE_DISCRETE, ENGINE_GROUPS, ENGINE_LABELS, ENGINE_OPTIONS } from "./engine-config";
import type { EngineParam } from "./engine-config";
import type { MidiTarget, Param, Patch } from "./model";

type Props = {
  patch: Patch;
  onParam: (key: Param, value: number) => void;
  onCheckpoint: () => void;
  onLearn: (key: MidiTarget) => void;
  knob: (key: Param, label: string, format?: (v: number) => string, log?: boolean, step?: number) => ReactNode;
};
const hints: Partial<Record<Patch["engine"], string>> = {
  subtractive: "Hard Sync setzt OSC 2 bei jedem Zyklus von OSC 1 zurück. Sync Amount erhöht die Slave-Frequenz. Pulse Width wirkt auf Square.",
  wavetable: "Table Spread verteilt die Positionen über Unison-Stimmen. Warp Amount steht oberhalb. Phase und Warp-Modus gelten ab dem nächsten Anschlag.",
  additive: "Acht Harmonic-Bänder steuern jeweils vier der 32 Partials. Spectral Decay ist die Abklingzeit der höchsten Obertöne; 0 schaltet es aus.",
  ring: "Ratio folgt der Note; Fixed Hz bleibt unabhängig von der gespielten Note. DC Bias verschiebt das Modulatorsignal. Hüllkurven gelten ab dem nächsten Anschlag.",
  granular: "Sync ersetzt Density durch das Taktraster. Freeze wiederholt die aktuelle Cloud mit ihren Positionen, Tonhöhen und Panorama-Werten. Änderungen greifen innerhalb des 150-ms-Planungsfensters.",
  sampler: "One-shot spielt den gewählten Slice unabhängig vom Loslassen zu Ende. Gate folgt der Taste; Loop wiederholt den Loop-Bereich. Duration wirkt im Time-Stretch-Modus unabhängig von der Tonhöhe. Starke Dehnungen können körnig klingen.",
  physical: "Body Frequency und Q auf Auto behalten das Verhalten von Body. Continuous Bow regt die Saite während der gehaltenen Note an. String Coupling koppelt drei Saiten.",
};
function format(key: EngineParam): (value: number) => string {
  if (/Attack|Release|Decay|Duration|Crossfade/.test(key) && key !== "ringPitchDepth") return (v) => v === 0 ? "Off" : formatTime(v);
  if (key === "bodyFrequency" || key === "ringModHz" || key === "ringSidebandCutoff") return (v) => v === 0 ? "Auto" : key === "ringSidebandCutoff" && v >= 17999 ? "Open" : formatHz(v);
  if (key === "bodyQ") return (v) => v === 0 ? "Auto" : v.toFixed(2);
  if (key === "sampleStretch") return (v) => `${v.toFixed(2)}×`;
  if (key === "sampleSlice") return (v) => `${Math.round(v) + 1}`;
  if (key === "sampleSlices") return (v) => `${Math.round(v)}`;
  if (key.endsWith("Phase")) return (v) => `${Math.round(v * 360)}°`;
  if (key === "subOctave") return (v) => `${v > 0 ? "+" : ""}${Math.round(v)} oct`;
  if (key === "ringPitchDepth") return (v) => `${v.toFixed(1)} st`;
  if (key === "addPartialDetune" || key === "addPartialDrift") return (v) => `${v.toFixed(1)} ct`;
  if (key === "grainMotionRate") return (v) => `${v.toFixed(2)} Hz`;
  return percent;
}
export default function EngineExtensions({ patch: p, onParam, onCheckpoint, onLearn, knob }: Props) {
  if (p.engine === "fm") return null;
  const control = (key: EngineParam) => {
    const options = ENGINE_OPTIONS[key], label = ENGINE_LABELS[key];
    if (options) return <div key={key} className="engine-choice"><span>{label}</span><Select label={label} value={p[key]} onLearn={() => onLearn(key)} onChange={(value) => { onCheckpoint(); onParam(key, +value); }}>{options.map((name, value) => <option key={value} value={value}>{name}</option>)}</Select></div>;
    return <div key={key}>{knob(key, label, format(key), key === "ringModHz" || key === "ringSidebandCutoff", ENGINE_DISCRETE.includes(key) ? 1 : undefined)}</div>;
  };
  return <div className="engine-extensions">
    {ENGINE_GROUPS[p.engine].map((group) => {
      const pitch = group.title === "PITCH ENVELOPE", depth = group.title === "MODULATION ENVELOPE", envelope = pitch || depth;
      const keys = group.keys.filter((key) => !(key === "ringModHz" && p.ringModMode < .5));
      return <details className="engine-section" key={group.title} open>
        <summary>{group.title}</summary>
        {envelope && <EnvelopeGraph kind="amp" env={pitch ? { attack: p.ringPitchAttack, decay: p.ringPitchDecay, sustain: p.ringPitchSustain, release: p.ringPitchRelease } : { attack: p.ringEnvAttack, decay: p.ringEnvDecay, sustain: p.ringEnvSustain, release: p.ringEnvRelease }} />}
        <div className={envelope ? "engine-envelope-option" : "engine-control-grid"}>{(envelope ? keys.slice(0, 1) : keys).map(control)}</div>
        {envelope && <div className="engine-adsr-controls">{keys.slice(1).map(control)}</div>}
      </details>;
    })}
    <p className="engine-hint">{hints[p.engine]}</p>
  </div>;
}
