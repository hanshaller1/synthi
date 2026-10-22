import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AudioLines, Upload } from "lucide-react";
import { Select, Waveform, formatTime, percent } from "./components";
import { ENGINES } from "./model";
import type { Param, Patch, Wave } from "./model";
import {
  WAVETABLES,
  WAVETABLE_TYPES,
  SAMPLER_SAMPLES,
  GRANULAR_SAMPLES,
  SAMPLE_LIBRARY,
  sampleData,
} from "./catalog";
type Props = {
  patch: Patch;
  onPatch: (p: Partial<Patch>) => void;
  onParam: (p: Param, v: number) => void;
  onSample: (f: File) => void;
  knob: (
    key: Param,
    label: string,
    format?: (v: number) => string,
    log?: boolean,
    step?: number,
  ) => ReactNode;
};
function SamplePreview({ id }: { id: string }) {
  const points = useMemo(() => {
    const descriptor = SAMPLE_LIBRARY.find((s) => s.id === id);
    if (!descriptor) return "";
    const data = sampleData(descriptor, 12000),
      stride = Math.floor(data.length / 200);
    const peaks = Array.from({ length: 200 }, (_, i) => {
      let peak = 0;
      for (let j = 0; j < stride; j++)
        peak = Math.max(peak, Math.abs(data[i * stride + j]));
      return peak;
    });
    return (
      peaks.map((p, i) => `${i},${35 - p * 30}`).join(" ") +
      " " +
      peaks.map((_, i) => `${199 - i},${35 + peaks[199 - i] * 30}`).join(" ")
    );
  }, [id]);
  return (
    <svg
      className="waveform sample-preview"
      viewBox="0 0 200 70"
      preserveAspectRatio="none"
      aria-label="Sample-Wellenform"
      role="img"
    >
      <polygon points={points} fill="currentColor" opacity=".65" />
    </svg>
  );
}
export default function SourceEditor({
  patch: p,
  onPatch,
  onParam,
  onSample,
  knob,
}: Props) {
  const [page, setPage] = useState("source");
  const cents = (v: number) => `${v.toFixed(1)} ct`,
    semitone = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)} st`,
    number = (v: number) => v.toFixed(2);
  const isSample = p.engine === "sampler" || p.engine === "granular",
    dual = ["subtractive", "ring", "fm"].includes(p.engine);
  const samples = p.engine === "granular" ? GRANULAR_SAMPLES : SAMPLER_SAMPLES,
    selectedId = p.engine === "granular" ? p.grainSampleId : p.sampleId;
  const wave = (key: "wave" | "wave2", label: string) => (
    <Select
      label={label}
      value={p[key]}
      onChange={(value) => onPatch({ [key]: value as Wave })}
    >
      {["sawtooth", "square", "triangle", "sine"].map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </Select>
  );
  const basic: Record<Patch["engine"], ReactNode> = {
    subtractive: (
      <>
        {knob("detune", "Detune", cents)}
        {knob("mix", "Osc mix")}
        {knob("sub", "Sub level")}
      </>
    ),
    wavetable: (
      <>
        {knob("shape", "Position")}
        {knob("detune", "Detune", cents)}
        {knob("brightness", "Brightness")}
      </>
    ),
    fm: (
      <>
        {knob("fmRatio", "Op 2 ratio", (v) => `${v.toFixed(2)}×`, false, 0.25)}
        {knob("fmIndex", "FM index", number)}
        {knob("fmDecay", "Index decay", formatTime, true)}
      </>
    ),
    additive: (
      <>
        {knob("harmonics", "Partials", (v) => `${Math.round(v)}`, false, 1)}
        {knob("brightness", "Brightness")}
        {knob("shape", "Odd / even")}
      </>
    ),
    ring: (
      <>
        {knob("fmRatio", "Mod ratio", (v) => `${v.toFixed(2)}×`)}
        {knob("shape", "AM / Ring")}
        {knob("ringDepth", "Depth")}
      </>
    ),
    granular: (
      <>
        {knob("grainSize", "Grain size", formatTime, true)}
        {knob("grainDensity", "Density", (v) => `${Math.round(v)}/s`, false, 1)}
        {knob("position", "Position")}
      </>
    ),
    sampler: (
      <>
        {knob("sampleStart", "Start")}
        {knob("sampleEnd", "End")}
        {knob("sampleFine", "Fine tune", cents)}
      </>
    ),
    physical: (
      <>
        {knob("damping", "Damping", (v) => `${(v * 100).toFixed(1)}%`)}
        {knob("brightness", "Excitation")}
        {knob("stringDecay", "Decay", formatTime, true)}
      </>
    ),
  };
  const extra: Record<Patch["engine"], ReactNode> = {
    subtractive: (
      <>
        {knob("osc2Tune", "Osc 2 tune", semitone, false, 1)}
        {knob("pulseWidth", "Pulse width")}
        {knob("drift", "Analog drift", cents)}
      </>
    ),
    wavetable: (
      <>
        {knob("wtWarp", "Phase warp", number)}
        {knob("wtFormant", "Formant")}
        {knob("sub", "Sub level")}
      </>
    ),
    fm: (
      <>
        {knob("fmFeedback", "Feedback")}
        {knob("fmEnd", "Index end")}
        {knob("fmRatio2", "Op 3 ratio", (v) => `${v.toFixed(2)}×`, false, 0.25)}
        {knob("fmIndex2", "Op 3 index", number)}
      </>
    ),
    additive: (
      <>
        {knob("spectralTilt", "Spectral tilt", number)}
        {knob("spectralPeak", "Peak partial", (v) => v.toFixed(0), false, 1)}
        {knob("spectralResonance", "Peak boost")}
        {knob("inharmonicity", "Inharmonic", (v) => v.toFixed(3))}
      </>
    ),
    ring: (
      <>
        {knob("ringDry", "Dry carrier")}
        {knob("ringBias", "DC bias", number)}
        {knob("ringOffset", "Mod offset", (v) => `${v.toFixed(0)} Hz`)}
      </>
    ),
    granular: (
      <>
        {knob("spread", "Position jitter")}
        {knob("grainPitch", "Pitch scatter", semitone)}
        {knob("grainScan", "Scan speed", number)}
        {knob("grainReverse", "Reverse chance")}
        {knob("grainPan", "Stereo scatter")}
        {knob("grainWindow", "Window attack")}
      </>
    ),
    sampler: (
      <>
        {knob("sampleLoopStart", "Loop start")}
        {knob("sampleLoopEnd", "Loop end")}
        {knob("sampleFade", "Edge fade", formatTime)}
        {knob(
          "sampleRoot",
          "Root note",
          (v) =>
            ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][
              Math.round(v) % 12
            ] +
            (Math.floor(v / 12) - 1),
          false,
          1,
        )}
      </>
    ),
    physical: (
      <>
        {knob("pluckPosition", "Pick position")}
        {knob("bodySize", "Body")}
        {knob("dispersion", "Dispersion")}
      </>
    ),
  };
  return (
    <section
      className="module oscillator-module expanded-source"
      data-engine={p.engine}
    >
      <div className="module-title">
        <h3>
          <AudioLines size={14} />
          {p.engine === "subtractive"
            ? "Oscillators"
            : ENGINES.find((e) => e.id === p.engine)?.label}
        </h3>
        <span className="module-index">01</span>
      </div>
      <nav className="source-tabs" aria-label="Klangquellen-Parameter">
        <button
          className={page === "source" ? "active" : ""}
          onClick={() => setPage("source")}
        >
          Source
        </button>
        <button
          className={page === "detail" ? "active" : ""}
          onClick={() => setPage("detail")}
        >
          Character
        </button>
        <button
          className={page === "unison" ? "active" : ""}
          onClick={() => setPage("unison")}
        >
          Unison
        </button>
      </nav>
      {page === "source" ? (
        <>
          {dual ? (
            <div className="oscillator-pair">
              {(["wave", "wave2"] as const).map((key, i) => (
                <div className="single-osc" key={key}>
                  <span>
                    {p.engine === "fm"
                      ? i
                        ? "OP 2 · MODULATOR"
                        : "OP 1 · CARRIER"
                      : i
                        ? "OSCILLATOR 2"
                        : "OSCILLATOR 1"}
                  </span>
                  <Waveform
                    patch={{ ...p, engine: "subtractive", wave: p[key] }}
                  />
                  {wave(key, `Oszillator ${i + 1} Wellenform`)}
                </div>
              ))}
            </div>
          ) : (
            <div className="source-display">
              {isSample ? (
                p.sample ? (
                  <div className="imported-sample">
                    <Upload size={22} />
                    <span>{p.sampleName}</span>
                  </div>
                ) : (
                  <SamplePreview id={selectedId} />
                )
              ) : (
                <Waveform patch={p} />
              )}
            </div>
          )}
          {p.engine === "wavetable" && (
            <Select
              label="Wavetable auswählen"
              value={p.wavetable}
              onChange={(value) => onParam("wavetable", +value)}
            >
              {WAVETABLE_TYPES.map((type) => (
                <optgroup label={type} key={type}>
                  {WAVETABLES.filter((table) => table.family === type).map(
                    (table) => (
                      <option value={table.id} key={table.id}>
                        {table.name}
                      </option>
                    ),
                  )}
                </optgroup>
              ))}
            </Select>
          )}
          {isSample && (
            <Select
              label={
                p.engine === "granular"
                  ? "Granular-Sample auswählen"
                  : "Sampler-Sample auswählen"
              }
              value={p.sample ? "uploaded" : selectedId}
              onChange={(id) => {
                const sample = samples.find((s) => s.id === id);
                if (sample)
                  onPatch({
                    sample: null,
                    [p.engine === "granular" ? "grainSampleId" : "sampleId"]:
                      id,
                    sampleName: sample.name,
                    sampleRoot: sample.root,
                    sampleLoop: sample.granular || sample.category === "Pad",
                  });
              }}
            >
              {p.sample && (
                <option value="uploaded">Imported · {p.sampleName}</option>
              )}
              {[...new Set(samples.map((s) => s.category))].map((category) => (
                <optgroup key={category} label={category}>
                  {samples
                    .filter((s) => s.category === category)
                    .map((sample) => (
                      <option key={sample.id} value={sample.id}>
                        {sample.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          )}
          <div className="knob-row source-basic">{basic[p.engine]}</div>
          {isSample ? (
            <div className="source-sample-tools">
              <label className="small-button upload">
                <Upload size={12} />
                Import sample
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onSample(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {p.engine === "sampler" && (
                <>
                  <button
                    className={`small-button ${p.sampleLoop ? "on" : ""}`}
                    onClick={() => onPatch({ sampleLoop: !p.sampleLoop })}
                  >
                    LOOP
                  </button>
                  <button
                    className={`small-button ${p.sampleReverse >= 0.5 ? "on" : ""}`}
                    onClick={() =>
                      onParam("sampleReverse", p.sampleReverse >= 0.5 ? 0 : 1)
                    }
                  >
                    REVERSE
                  </button>
                </>
              )}
            </div>
          ) : (
            <label className="inline-range source-noise">
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
          )}
        </>
      ) : page === "detail" ? (
        <>
          {p.engine === "fm" && (
            <Select
              label="FM-Algorithmus"
              value={p.fmAlgorithm}
              onChange={(value) =>
                onPatch({ fmAlgorithm: value as Patch["fmAlgorithm"] })
              }
            >
              <option value="serial">3 → 2 → 1 · Serial</option>
              <option value="parallel">2 + 3 → 1 · Parallel</option>
            </Select>
          )}
          {p.engine === "physical" && (
            <Select
              label="Saitenanregung"
              value={p.excitation}
              onChange={(value) =>
                onPatch({ excitation: value as Patch["excitation"] })
              }
            >
              <option value="noise">Noise · Pluck</option>
              <option value="pick">Pick · Position comb</option>
              <option value="bow">Bow · Soft excitation</option>
            </Select>
          )}
          {p.engine === "fm" && (
            <div className="operator-three">
              <span>
                OP 3 · SINE ·{" "}
                {p.fmAlgorithm === "serial" ? "3 → 2 → 1" : "2 + 3 → 1"}
              </span>
              <Waveform patch={{ ...p, engine: "subtractive", wave: "sine" }} />
            </div>
          )}
          <div className="source-detail-controls">{extra[p.engine]}</div>
        </>
      ) : (
        <>
          <div className="unison-art" aria-hidden="true">
            {Array.from({ length: Math.round(p.unison) }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${50 + (p.unison === 1 ? 0 : (i / (p.unison - 1)) * 2 - 1) * p.unisonWidth * 38}%`,
                  height: `${42 + Math.cos(i * 2) * 12}px`,
                }}
              />
            ))}
          </div>
          <div className="knob-row unison-knobs">
            {knob("unisonDetune", "Unison detune", cents)}
            {knob("unisonWidth", "Unison width")}
          </div>
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
        </>
      )}
      <div className="unison-strip">
        <span>UNISON</span>
        <Select
          label="Unison-Stimmen"
          value={p.unison}
          onChange={(v) => onParam("unison", +v)}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option value={n} key={n}>
              {n === 1 ? "Off · 1 voice" : `${n} voices`}
            </option>
          ))}
        </Select>
        <span>
          {isSample
            ? p.engine === "granular"
              ? "32 TEXTURES"
              : "64 SAMPLES"
            : p.engine === "wavetable"
              ? "32 TABLES"
              : "PER TRACK"}
        </span>
      </div>
    </section>
  );
}
