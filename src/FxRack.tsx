import { useLayoutEffect, useRef } from "react";
import { getParameter, PARAMETER_REGISTRY, setParameters } from "./parameters";
import { useEffectiveFxValues } from "./modulation-ui";
import { ArrowLeft, ArrowRight, Power, Sparkles } from "lucide-react";
import { Knob, Select, formatHz, formatTime, percent } from "./components";
import { FX_OPTIONS } from "./model";
import type { FxSlot, Param, Patch } from "./model";
import { FX_CONTROLS, fxValues } from "./fx-spec";
import type { FxControl } from "./fx-spec";
import { transfer } from "./effects";
import {
  delayDivisionSupported,
  delayTiming,
  FX_DELAY_LIMIT_SECONDS,
} from "./fx-timing";
/** Preview of the effective controls; nonlinear/transient audio is not a spectrum analyser. */
export function EffectVisual({
  mode,
  values: v,
  live = false,
}: {
  mode: string;
  values: Record<string, number>;
  live?: boolean;
}) {
  const line = (fn: (x: number) => number) =>
    Array.from(
      { length: 181 },
      (_, i) =>
        `${i ? "L" : "M"}${(i * 240) / 180},${45 - Math.max(-1.2, Math.min(1.2, fn(i / 180))) * 30}`,
    ).join(" ");
  const sr = v.__sampleRate || 48000,
    phase = v.__phase ?? 0,
    tempo = v.__tempo || 118,
    rate = v.sync >= 0.5 ? tempo / 60 / v.division : v.rate;
  const wave = (p: number) => {
    const x = ((p % 1) + 1) % 1;
    return v.shape === 1
      ? x < 0.5
        ? 1
        : -1
      : v.shape === 2
        ? 1 - 4 * Math.abs(x - 0.5)
        : v.shape === 3
          ? 1 - 2 * x
          : Math.sin(x * Math.PI * 2);
  };
  let art;
  if (mode === "crush") {
    const span = 0.012,
      period = 1 / Math.min(sr, v.sampleRate),
      points: string[] = [];
    let next = 0,
      held = 0,
      index = 0;
    for (let i = 0; i <= 360; i++) {
      const t = (i / 360) * span;
      while (t >= next) {
        held = transfer(Math.sin(next * 440 * Math.PI * 2) * 0.75, mode, v);
        next += period * (1 + Math.sin(++index * 127.1) * v.jitter * 0.45);
      }
      const x = (i * 240) / 360,
        y =
          45 -
          Math.max(
            -1.2,
            Math.min(1.2, held * 10 ** ((v.outputTrim ?? 0) / 20)),
          ) *
            30;
      points.push(i ? `H${x}V${y}` : `M${x},${y}`);
    }
    art = (
      <>
        <path
          className="fx-reference"
          d={line((x) => Math.sin(x * span * 440 * Math.PI * 2) * 0.75)}
        />
        <path d={points.join(" ")} />
        <text x="8" y="86">
          12 ms · Sample &amp; Hold + Quantisierung
        </text>
      </>
    );
  } else if (["soft", "hard", "fold", "diode"].includes(mode))
    art = (
      <>
        <path className="fx-reference" d="M0 75L240 15" />
        <path
          d={line(
            (x) =>
              transfer(x * 2 - 1, mode, v) * 10 ** ((v.outputTrim ?? 0) / 20),
          )}
        />
        {mode === "fold" && (
          <>
            <path
              className="fx-filter-response"
              d={Array.from({ length: 181 }, (_, i) => {
                const hz = 20 * 1000 ** (i / 180),
                  alpha =
                    1 -
                    Math.exp(
                      (-2 * Math.PI * Math.min(sr * 0.45, v.postFilter)) / sr,
                    ),
                  w = (2 * Math.PI * hz) / sr,
                  magnitude =
                    alpha /
                    Math.hypot(
                      1 - (1 - alpha) * Math.cos(w),
                      (1 - alpha) * Math.sin(w),
                    );
                return `${i ? "L" : "M"}${(i * 240) / 180},${78 - magnitude * 12}`;
              }).join(" ")}
            />
            <text x="8" y="88">
              Postfilter · {formatHz(v.postFilter)} · normiert
            </text>
          </>
        )}
      </>
    );
  else if (mode === "chorus")
    art = Array.from({ length: Math.round(v.voices) }, (_, i) => (
      <path
        key={i}
        opacity={1 - i * 0.1}
        d={line(
          (x) =>
            v.baseDelay / 0.05 -
            0.5 +
            Math.sin((phase + x + i / v.voices) * Math.PI * 2) * v.depth * 0.4 +
            (i / v.voices) * 0.25,
        )}
      />
    ));
  else if (mode === "flanger") {
    const delay =
        v.manual +
        Math.sin(phase * Math.PI * 2) *
          Math.min(0.003, v.manual * 0.8) *
          v.depth,
      g = v.regen * v.polarity;
    art = (
      <path
        d={line((x) => {
          const w = 2 * Math.PI * (30 * 600 ** x) * delay,
            c = Math.cos(w),
            s = Math.sin(w);
          return (
            Math.sqrt(
              (1 + 2 * c + 1) / (1 - 2 * g * c + g * g + s * s * 0.0001),
            ) *
              0.3 -
            0.5
          );
        })}
      />
    );
  } else if (mode === "phaser") {
    art = (
      <path
        d={line((x) => {
          const hz = 30 * 600 ** x,
            w = (2 * Math.PI * hz) / sr;
          let ar = 1,
            ai = 0;
          for (let j = 0; j < Math.round(v.stages); j++) {
            const f = Math.min(
                sr * 0.4,
                v.frequency *
                  (j + 1) *
                  2 ** (Math.sin(phase * Math.PI * 2) * v.depth),
              ),
              angle = (2 * Math.PI * f) / sr,
              alpha = Math.sin(angle) / (2 * v.resonance),
              b0 = (1 - alpha) / (1 + alpha),
              b1 = (-2 * Math.cos(angle)) / (1 + alpha),
              c = Math.cos(w),
              q = Math.sin(w),
              c2 = Math.cos(w * 2),
              q2 = Math.sin(w * 2),
              nr = b0 + b1 * c + c2,
              ni = -b1 * q - q2,
              dr = 1 + b1 * c + b0 * c2,
              di = -b1 * q - b0 * q2,
              den = dr * dr + di * di,
              hr = (nr * dr + ni * di) / den,
              hi = (ni * dr - nr * di) / den;
            [ar, ai] = [ar * hr - ai * hi, ar * hi + ai * hr];
          }
          const den = (1 - v.feedback * ar) ** 2 + (v.feedback * ai) ** 2;
          const hr = (ar - v.feedback * (ar * ar + ai * ai)) / den,
            hi = ai / den;
          return Math.hypot(1 + hr, hi) * 0.5 - 0.5;
        })}
      />
    );
  } else if (mode === "vibrato")
    art = (
      <>
        <path className="fx-reference" d="M0 45H240" />
        <path
          d={line(
            (x) =>
              ((Math.sin((phase + x + (v.phase ?? 0) / 360) * Math.PI * 2) *
                v.cents) /
                100) *
              (v.fade > 0 ? Math.min(1, (v.__age ?? 0) / v.fade) : 1),
          )}
        />
      </>
    );
  else if (mode === "tremolo")
    art = [0, 1].map((ch) => (
      <path
        key={ch}
        opacity={ch ? 0.45 : 1}
        d={line(
          (x) =>
            1 -
            v.depth * 0.5 +
            wave(phase + x + ((v.stereoPhase ?? 0) / 360) * ch) * v.depth * 0.5,
        )}
      />
    ));
  else if (["digital", "tape", "pingpong", "multitap", "dub"].includes(mode)) {
    const timing = delayTiming(mode, v, tempo),
      seconds = timing.actual[0],
      right = timing.actual[1],
      span = Math.max(...timing.actual) * (mode === "multitap" ? 1.1 : 5);
    art = (
      <>
        {Array.from({ length: mode === "multitap" ? 3 : 8 }, (_, i) => {
          const tap = mode === "multitap",
            t = tap
              ? timing.actual[i]
              : Math.ceil((i + 1) / 2) * (i % 2 ? right : seconds),
            level = tap
              ? v[`tap${i + 1}Level`]
              : v.feedback ** Math.floor(i / 2),
            pan = tap ? v[`tap${i + 1}Pan`] : i % 2 ? 1 : -1,
            x = 8 + (t / Math.max(0.01, span)) * 224,
            y = 76 - level * 56;
          return (
            <path
              key={i}
              opacity={0.45 + (pan + 1) * 0.2}
              d={`M${x} 77V${y}H${x + 5}V77`}
            />
          );
        })}
        <text x="8" y="12">
          {seconds.toFixed(3)} s · {v.feedback.toFixed(2)} feedback
        </text>
      </>
    );
  } else {
    const decay = Math.max(0.2, v.decay),
      pre = v.predelay ?? 0,
      early =
        mode === "room" ? v.early : mode === "hall" ? 1 - v.earlyLate : 0.15,
      late = mode === "hall" ? v.earlyLate : 1,
      count = mode === "spring" ? Math.round(v.springCount) : 1;
    art = (
      <>
        {Array.from({ length: count }, (_, i) => (
          <path
            key={i}
            opacity={1 - i * 0.15}
            d={line((x) => {
              const t = x * (decay + pre),
                elapsed = Math.max(0, t - pre),
                envelope = t < pre ? 0 : Math.exp((-6.9078 * elapsed) / decay),
                reflection =
                  early *
                  Math.exp(-40 * elapsed) *
                  Math.abs(Math.sin(elapsed * 360));
              return (
                (late *
                  envelope *
                  (0.65 +
                    Math.sin(
                      elapsed *
                        (mode === "spring"
                          ? 80 + v.tension * 80
                          : 240 + i * 31),
                    ) *
                      0.2) +
                  reflection) *
                (mode === "gated" ? (v.__gate ?? 1) : 1)
              );
            })}
          />
        ))}
        <text x="8" y="86">
          {decay.toFixed(2)} s · width {Math.round(v.width * 100)}%
        </text>
      </>
    );
  }
  return (
    <figure className="fx-preview">
      <svg
        className={`fx-art fx-art-${mode}`}
        viewBox="0 0 240 90"
        role="img"
        aria-label={`${mode}: ${live ? "zuletzt gemeldete DSP-Parameter" : "Basisparameter"}, schematische Vorschau`}
      >
        <title>
          {mode} · {live ? "zuletzt gemeldete DSP-Parameter" : "Basisparameter"}
          {Number.isFinite(rate) ? ` · ${rate.toFixed(2)} Hz` : ""}
        </title>
        <path
          className="fx-grid"
          d="M0 15H240M0 45H240M0 75H240M60 0V90M120 0V90M180 0V90"
        />
        {art}
      </svg>
      <figcaption>
        Schematische Vorschau ·{" "}
        {mode === "crush"
          ? "Beispielsignal; Jitter angenähert, Tone/Mix nicht simuliert"
          : mode === "fold"
            ? "Kennlinie und separater Tiefpassgang; Mix nicht simuliert"
            : ["soft", "hard", "diode"].includes(mode)
              ? "statische Kennlinie ohne Filter-/Zeitverlauf oder Mix"
              : "keine vollständige Audioanalyse"}
      </figcaption>
    </figure>
  );
}
export function formatFx(control: FxControl) {
  if (control.unit === "hz")
    return control.key === "rate"
      ? (n: number) => `${n.toFixed(2)} Hz`
      : formatHz;
  if (control.unit === "time") return formatTime;
  if (control.unit === "percent") return percent;
  if (control.unit === "bits") return (n: number) => `${Math.round(n)} bit`;
  if (control.unit === "cents") return (n: number) => `${n.toFixed(1)} ct`;
  return (n: number) => n.toFixed(2);
}
const titles: Record<FxSlot, string> = {
  saturationMode: "Saturation",
  modulationMode: "Modulation",
  delayMode: "Delay",
  reverbMode: "Reverb",
};
type Props = {
  patch: Patch;
  onPatch: (p: Partial<Patch>) => void;
  onParam: (p: Param, v: number) => void;
  locks: Partial<Record<Param, number>>;
  tempo: number;
  onLearn: (p: Param) => void;
  onCheckpoint: () => void;
};
export default function FxRack(props: Props) {
  const { patch, locks, onCheckpoint, onPatch } = props;
  const p = setParameters(patch, locks);
  const move = (index: number, offset: number) => {
    onCheckpoint();
    const order = [...p.fxOrder];
    [order[index], order[index + offset]] = [
      order[index + offset],
      order[index],
    ];
    onPatch({ fxOrder: order });
  };
  return (
    <div className="effects-grid serial-fx">
      {p.fxOrder.map((slot, index) => (
        <FxModule
          key={slot}
          {...props}
          patch={p}
          slot={slot}
          index={index}
          move={move}
        />
      ))}
    </div>
  );
}
function FxModule({
  patch: p,
  onParam,
  locks,
  tempo,
  onLearn,
  onCheckpoint,
  slot,
  index,
  move,
}: Props & {
  slot: FxSlot;
  index: number;
  move: (index: number, offset: number) => void;
}) {
  const mode = p[slot],
    values = fxValues(p, mode),
    enabled = p.fxEnabled[slot],
    prefix = `fx.${slot}.${mode}.`;
  const label=(id:string)=>FX_OPTIONS[slot].find(o=>o.id===id)?.label??id;
  return (
    <section
      className={`module effect-module ${enabled ? "" : "fx-bypassed"}`}
      data-slot={slot}
    >
      <div className="fx-slot-header">
        <span>
          0{index + 1} <Sparkles size={12} />
        </span>
        <button
          className={`fx-power ${enabled ? "on" : ""}`}
          aria-label={`${titles[slot]} Basis-Bypass`}
          aria-pressed={enabled}
          title={`Basis: ${enabled ? "ON" : "BYPASS"} · Rechtsklick: MIDI Learn`}
          onContextMenu={(e) => {
            e.preventDefault();
            onLearn(`fx.${slot}.bypass`);
          }}
          onClick={() => {
            onCheckpoint();
            onParam(`fx.${slot}.bypass`, Number(enabled));
          }}
        >
          <Power size={13} />
          {enabled ? "BASE ON" : "BASE BYPASS"}
        </button>
        <button
          disabled={!index}
          onClick={() => move(index, -1)}
          aria-label={`${titles[slot]} nach links`}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          disabled={index === 3}
          onClick={() => move(index, 1)}
          aria-label={`${titles[slot]} nach rechts`}
        >
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="module-title">
        <h3>{titles[slot]}</h3>
        <span className="module-index">SERIAL FX</span>
      </div>
      <Select
        label={`${titles[slot]} Basis-Variante`}
        value={FX_OPTIONS[slot].findIndex((o) => o.id === mode)}
        onLearn={() => onLearn(`fx.${slot}.mode`)}
        onChange={(v) => {
          onCheckpoint();
          onParam(`fx.${slot}.mode`, +v);
        }}
      >
        {FX_OPTIONS[slot].map((o, i) => (
          <option key={o.id} value={i}>
            Basis: {o.label}
          </option>
        ))}
      </Select>
      <FxLivePreview patch={p} slot={slot} tempo={tempo}/>
      <small className="fx-base-controls">Basisparameter: {label(mode)}</small>
      <div className="fx-controls">
        {FX_CONTROLS[mode]
          .filter(
            (c) =>
              !["division", "rightDivision"].includes(c.key) ||
              values.sync >= 0.5,
          )
          .filter(
            (c) =>
              !(
                values.sync >= 0.5 &&
                ["rate", "time", "rightTime"].includes(c.key)
              ),
          )
          .map((c) => {
            const id = (prefix + c.key) as Param,
              value =
                locks[id] ??
                (c.param ? locks[c.param] : undefined) ??
                getParameter(p, id);
            const format =
              c.key === "stereoPhase" || c.key === "phase"
                ? (v: number) => `${Math.round(v)}°`
                : c.key === "outputTrim" ||
                    (mode === "gated" && c.key === "threshold")
                  ? (v: number) => `${v.toFixed(1)} dB`
                  : formatFx(c);
            return c.options ? (
              <label className="fx-choice" key={id}>
                <span>{c.label}</span>
                <Select
                  label={`${mode} ${c.label}`}
                  value={value}
                  onLearn={() => onLearn(id)}
                  onChange={(v) => {
                    onCheckpoint();
                    onParam(id, +v);
                  }}
                >
                  {c.options.map((o) => {
                    const unsupported =
                      slot === "delayMode" &&
                      ["division", "rightDivision"].includes(c.key) &&
                      !delayDivisionSupported(
                        mode,
                        values,
                        tempo,
                        c.key,
                        o.value,
                      );
                    return (
                      <option
                        key={o.value}
                        value={o.value}
                        disabled={unsupported}
                      >
                        {o.label}
                        {unsupported
                          ? ` · Limit ${FX_DELAY_LIMIT_SECONDS}s`
                          : ""}
                      </option>
                    );
                  })}
                </Select>
              </label>
            ) : (
              <Knob
                key={id}
                parameterId={id}
                label={c.label}
                value={value}
                min={c.min}
                max={c.max}
                log={c.log}
                step={c.unit === "bits" ? 1 : c.step}
                defaultValue={PARAMETER_REGISTRY[id].default}
                format={format}
                locked={id in locks || (!!c.param && c.param in locks)}
                onEdit={onCheckpoint}
                onLearn={() => onLearn(id)}
                onChange={(v) => onParam(id, v)}
              />
            );
          })}
      </div>
    </section>
  );
}

/** Only the live status/preview subscribes to frame updates. The base controls
 * and their drag handlers do not rerender for every incoming DSP packet. */
function FxLivePreview({patch:p,slot,tempo}:{patch:Patch;slot:FxSlot;tempo:number}){
  const anchor=useRef<HTMLDivElement>(null);
  const mode=p[slot],values=fxValues(p,mode),enabled=p.fxEnabled[slot];
  const effective = useEffectiveFxValues(
    { ...values, __tempo: tempo, __bypass: Number(!enabled) },
    slot,
    mode,
  );
  const liveEnabled = effective.live
    ? effective.values.__bypass < 0.5
    : enabled;
  const label = (id: string) =>
    FX_OPTIONS[slot].find((o) => o.id === id)?.label ?? id;
  const previous =
    FX_OPTIONS[slot][Math.round(effective.values.__previousMode ?? -1)];
  const timing =
    slot === "delayMode"
      ? delayTiming(
          effective.mode,
          effective.values,
          effective.values.__tempo || tempo,
        )
      : null;
  const baseTiming =
    slot === "delayMode" ? delayTiming(mode, values, tempo) : null;
  useLayoutEffect(()=>{
    const module=anchor.current?.closest(".effect-module");
    module?.classList.toggle("fx-bypassed",!liveEnabled);
    const button=module?.querySelector<HTMLButtonElement>(".fx-power");
    if(button)button.title=`Basis: ${enabled?"ON":"BYPASS"} · ${effective.live?`DSP: ${liveEnabled?"ON":"BYPASS"}`:"kein Live-Status"} · Rechtsklick: MIDI Learn`;
  });
  return <div ref={anchor} className="fx-live-preview">
      <div
        className={`fx-effective-status ${liveEnabled ? "is-on" : "is-bypassed"}`}
        role="status"
      >
        {effective.live
          ? `DSP: ${previous ? `${previous.label} → ` : ""}${label(effective.mode)} · ${liveEnabled ? "ON" : "BYPASS"}`
          : "Basisansicht · kein Live-DSP-Status"}
      </div>
      <EffectVisual
        mode={effective.mode}
        values={effective.values}
        live={effective.live}
      />
      {timing && (
        <div
          className={`fx-time-status ${timing.limited || baseTiming?.limited ? "is-limited" : ""}`}
        >
          Max. {FX_DELAY_LIMIT_SECONDS} s pro Kanal/Tap ·{" "}
          {effective.live ? "DSP-Grundzeiten" : "Grundzeiten"}:{" "}
          {timing.actual.map((t) => `${t.toFixed(3)} s`).join(" / ")}
          {timing.limited &&
            ` · begrenzt (angefordert ${timing.requested.map((t) => `${t.toFixed(3)} s`).join(" / ")})`}
          {baseTiming?.limited &&
            !timing.limited &&
            " · Basis bei diesem Tempo außerhalb des Limits"}
        </div>
      )}
  </div>;
}
