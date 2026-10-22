import { useState } from "react";
import {
  Flame,
  Power,
  SlidersHorizontal,
  Waves,
  AudioLines,
} from "lucide-react";
import { Knob, Select, PanelHeader, formatHz, formatTime, percent } from "./components";
import { HEAT_MODES, makeMasterFx } from "./model";
import type { MasterFx } from "./model";
import { EQ_FREQUENCIES, heatTransfer } from "./master-audio";
export default function MasterFX({
  value: p,
  onChange,
}: {
  value: MasterFx;
  onChange: (value: MasterFx) => void;
}) {
  const [tab, setTab] = useState("heat");
  const change = (v: Partial<MasterFx>) => onChange({ ...p, ...v });
  const toggle = (
    key:
      | "driveEnabled"
      | "eqEnabled"
      | "compressorEnabled"
      | "delayEnabled"
      | "reverbEnabled",
    label: string,
  ) => (
    <button
      className={`master-toggle ${p[key] ? "on" : ""}`}
      aria-pressed={p[key]}
      onClick={() => change({ [key]: !p[key] })}
    >
      <Power size={14} />
      {label} {p[key] ? "ON" : "BYPASS"}
    </button>
  );
  const knob = (
    key: keyof MasterFx,
    label: string,
    min: number,
    max: number,
    format = percent,
    log = false,
  ) => (
    <Knob
      key={key}
      defaultValue={makeMasterFx()[key] as number}
      label={label}
      value={p[key] as number}
      min={min}
      max={max}
      onChange={(v) => change({ [key]: v })}
      format={format}
      log={log}
    />
  );
  const eqKey = p.eqBands === 2 ? "eq2" : p.eqBands === 3 ? "eq3" : "eq8",
    gains = p[eqKey];
  const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
  return (
    <section className={`master-panel studio-panel ${p.enabled ? "" : "master-bypassed"}`}>
      <PanelHeader
        icon={<SlidersHorizontal size={16} />}
        title="Master FX"
        context={<span className="tag">STEREO BUS</span>}
        actions={
        <button
          className={`master-toggle ${p.enabled ? "on" : ""}`}
          aria-pressed={p.enabled}
          onClick={() => change({ enabled: !p.enabled })}
        >
          <Power size={15} />
          {p.enabled ? "MASTER FX ON" : "BYPASS ALL"}
        </button>
        }
      />
      <nav className="master-tabs" aria-label="Master-Effektbereich">
        {[
          { id: "heat", label: "Heat / Drive", icon: Flame },
          { id: "eq", label: "Equalizer", icon: SlidersHorizontal },
          { id: "dynamics", label: "Dynamics / Stereo", icon: AudioLines },
          { id: "space", label: "Space", icon: Waves },
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="master-editor">
        {tab === "heat" && (
          <>
            <div className="master-section-title">
              <h3>Analog colour</h3>
              {toggle("driveEnabled", "DRIVE")}
            </div>
            <p className="master-description">
              Acht eigene Drive-Kennlinien, inspiriert vom Konzept des Analog
              Heat MK II.
            </p>
            <div className="heat-modes">
              {HEAT_MODES.map((mode, i) => (
                <button
                  key={mode}
                  className={p.driveMode === i ? "active" : ""}
                  onClick={() => change({ driveMode: i })}
                >
                  <small>0{i + 1}</small>
                  {mode}
                </button>
              ))}
            </div>
            <div className="heat-mode-select">
              <Select
                label="Master Drive-Modus"
                value={p.driveMode}
                onChange={(value) => change({ driveMode: +value })}
              >
                {HEAT_MODES.map((mode, i) => (
                  <option key={mode} value={i}>
                    {mode}
                  </option>
                ))}
              </Select>
            </div>
            <svg
              className="heat-graph"
              viewBox="0 0 600 120"
              preserveAspectRatio="none"
              role="img"
              aria-label="Drive-Kennlinie"
            >
              <path
                className="fx-grid"
                d="M0 30H600M0 60H600M0 90H600M150 0V120M300 0V120M450 0V120"
              />
              <path
                d={Array.from(
                  { length: 301 },
                  (_, i) =>
                    `${i ? "L" : "M"}${i * 2},${60 - heatTransfer(i / 150 - 1, p.driveMode, p.drive, p.bias) * 48}`,
                ).join(" ")}
              />
            </svg>
            <div className="master-knobs">
              {knob("drive", "Drive", 0, 1)}
              {knob("bias", "Bias", -0.5, 0.5, (v) => v.toFixed(2))}
              {knob("tone", "Tone", 500, 20000, formatHz, true)}
              {knob("lowCut", "Low cut", 20, 1000, formatHz, true)}
              {knob("mix", "Dry / Wet", 0, 1)}
              {knob("output", "Output", -18, 6, db)}
            </div>
          </>
        )}
        {tab === "eq" && (
          <>
            <div className="master-section-title">
              <h3>Stereo equalizer</h3>
              {toggle("eqEnabled", "EQ")}
              <div className="eq-band-switch">
                {([2, 3, 8] as const).map((n) => (
                  <button
                    key={n}
                    className={p.eqBands === n ? "active" : ""}
                    onClick={() => change({ eqBands: n })}
                  >
                    {n} BAND
                  </button>
                ))}
              </div>
              <button
                className="small-button"
                onClick={() => change({ [eqKey]: gains.map(() => 0) })}
              >
                RESET
              </button>
            </div>
            <svg
              className="eq-graph"
              viewBox="0 0 600 140"
              preserveAspectRatio="none"
              role="img"
              aria-label="EQ-Verlauf"
            >
              <path
                className="fx-grid"
                d="M0 35H600M0 70H600M0 105H600M150 0V140M300 0V140M450 0V140"
              />
              <path
                d={Array.from({ length: 241 }, (_, i) => {
                  const freq = 20 * 1000 ** (i / 240),
                    gain = EQ_FREQUENCIES[p.eqBands].reduce(
                      (sum, f, j) =>
                        sum +
                        gains[j] *
                          (p.eqBands < 8 && j === 0
                            ? 1 / (1 + (freq / f) ** 2)
                            : p.eqBands < 8 && j === p.eqBands - 1
                              ? 1 / (1 + (f / freq) ** 2)
                              : Math.exp(
                                  -(Math.log2(freq / f) ** 2) /
                                    (p.eqBands === 8 ? 0.7 : 1.5),
                                )),
                      0,
                    );
                  return `${i ? "L" : "M"}${i * 2.5},${70 - gain * 2.5}`;
                }).join(" ")}
              />
            </svg>
            <div className="eq-faders">
              {gains.map((gain, i) => (
                <label key={`${p.eqBands}-${i}`}>
                  <output>{db(gain)}</output>
                  <input
                    aria-label={`EQ ${formatHz(EQ_FREQUENCIES[p.eqBands][i])}`}
                    type="range"
                    min="-18"
                    max="18"
                    step=".5"
                    value={gain}
                    onDoubleClick={() =>
                      change({
                        [eqKey]: gains.map((v, j) => (i === j ? 0 : v)),
                      })
                    }
                    onChange={(e) =>
                      change({
                        [eqKey]: gains.map((v, j) =>
                          i === j ? +e.target.value : v,
                        ),
                      })
                    }
                  />
                  <span>{formatHz(EQ_FREQUENCIES[p.eqBands][i])}</span>
                  <small>
                    {p.eqBands < 8 && i === 0
                      ? "LOW SHELF"
                      : p.eqBands < 8 && i === p.eqBands - 1
                        ? "HIGH SHELF"
                        : "BELL"}
                  </small>
                </label>
              ))}
            </div>
          </>
        )}
        {tab === "dynamics" && (
          <>
            <div className="master-section-title">
              <h3>Glue compressor</h3>
              {toggle("compressorEnabled", "COMP")}
            </div>
            <p className="master-description">
              Stereo-Kompression vor dem Ausgangslimiter. Breite 0 %: Mono · 100
              %: Stereo · 200 %: erweitert.
            </p>
            <div className="compressor-art">
              <svg
                viewBox="0 0 400 130"
                role="img"
                aria-label="Kompressor-Kennlinie"
              >
                <path
                  className="fx-grid"
                  d="M0 100H400M0 60H400M100 0V130M200 0V130M300 0V130"
                />
                <path
                  d={Array.from({ length: 121 }, (_, i) => {
                    const dbIn = i / 2 - 60,
                      dbOut =
                        dbIn < p.threshold
                          ? dbIn
                          : p.threshold + (dbIn - p.threshold) / p.ratio;
                    return `${i ? "L" : "M"}${(i / 120) * 400},${120 - (dbOut + 60) * 1.8}`;
                  }).join(" ")}
                />
              </svg>
            </div>
            <div className="master-knobs">
              {knob("threshold", "Threshold", -60, 0, db)}
              {knob("ratio", "Ratio", 1, 12, (v) => `${v.toFixed(1)}:1`)}
              {knob("attack", "Attack", 0.001, 0.1, formatTime, true)}
              {knob("release", "Release", 0.02, 1, formatTime, true)}
              {knob("makeup", "Makeup", -6, 12, db)}
              {knob("width", "Stereo width", 0, 2)}
            </div>
          </>
        )}
        {tab === "space" && (
          <div className="master-space">
            <section>
              <div className="master-section-title">
                <h3>Ping-pong echo</h3>
                {toggle("delayEnabled", "DELAY")}
              </div>
              <svg
                className="space-echo-art"
                viewBox="0 0 300 100"
                role="img"
                aria-label="Stereo-Echo"
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <path
                    key={i}
                    d={`M${25 + i * 40} 80V${80 - 65 * 0.78 ** i}H${34 + i * 40}V80`}
                    opacity={1 - i * 0.1}
                  />
                ))}
              </svg>
              <div className="master-knobs">
                {knob("delayTime", "Time", 0.04, 1.5, formatTime, true)}
                {knob("feedback", "Feedback", 0, 0.85)}
                {knob("delay", "Mix", 0, 1)}
              </div>
            </section>
            <section>
              <div className="master-section-title">
                <h3>Wide hall</h3>
                {toggle("reverbEnabled", "REVERB")}
              </div>
              <svg
                className="space-hall-art"
                viewBox="0 0 300 100"
                role="img"
                aria-label="Hallraum"
              >
                {[0, 1, 2, 3].map((i) => (
                  <path
                    key={i}
                    d={`M${20 + i * 20} 85V${10 + i * 12}H${280 - i * 20}V85`}
                    opacity={1 - i * 0.2}
                  />
                ))}
              </svg>
              <div className="master-knobs">
                {knob("reverbSize", "Decay", 0.2, 5, formatTime, true)}
                {knob("reverb", "Mix", 0, 1)}
              </div>
            </section>
          </div>
        )}
      </div>
      <footer className="master-chain">
        DRIVE → EQ → COMPRESSOR → STEREO → DELAY → REVERB → MASTER → LIMITER
      </footer>
    </section>
  );
}
