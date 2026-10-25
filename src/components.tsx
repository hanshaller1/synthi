import { PARAMETER_REGISTRY } from "./parameters";
import { parameterPosition, parameterAt } from "./parameter-scale";
import { ModulationOverlay } from "./modulation-ui";
import type { Param } from "./model";
import { filterCurve } from "./filter-config";
import { FM_ALGORITHMS } from "./fm-config";
import { wavetableSpectrum } from "./catalog";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, InputHTMLAttributes } from "react";
import { ChevronDown, X } from "lucide-react";
import { KEYBOARD_OCTAVES, clamp, noteName } from "./model";
import type { Envelope, Patch } from "./model";

export const formatTime = (v: number) =>
  v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
export const formatHz = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`;
export const percent = (v: number) => `${Math.round(v * 100)}%`;
export function TempoInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  const cancelled = useRef(false);
  const drag = useRef<{ y: number; value: number; moved: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing.current) setText(String(value)); }, [value]);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; editing.current = false; setText(String(value)); return; }
    const parsed = Number(text.replace(",", "."));
    const next = text.trim() && Number.isFinite(parsed) ? clamp(Math.round(parsed * 10) / 10, 40, 240) : value;
    editing.current = false; setText(String(next)); onChange(next);
  };
  return <label className="tempo-input" title="Ziehen: BPM ändern · Shift: fein · Wert anklicken: eingeben"
    onPointerDown={(e) => {
      if (e.button !== 0 || (e.target === input.current && editing.current)) return;
      drag.current = { y: e.clientY, value, moved: false };
    }}
    onPointerMove={(e) => {
      const d = drag.current; if (!d || !e.buttons) return;
      if (!d.moved && Math.abs(e.clientY - d.y) < 3) return;
      d.moved = true; e.currentTarget.setPointerCapture(e.pointerId);
      const next = clamp(Math.round((d.value + (d.y - e.clientY) * (e.shiftKey ? .1 : 1)) * 10) / 10, 40, 240);
      setText(String(next)); onChange(next);
    }}
    onPointerUp={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}>
    <span>BPM</span>
    <input ref={input} aria-label="Tempo BPM" type="text" value={text}
      onFocus={(e) => { editing.current = true; e.target.select(); }}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.currentTarget.blur(); e.preventDefault(); }
        if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); e.preventDefault(); e.stopPropagation(); }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault(); const next = clamp(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? .1 : 1), 40, 240);
          setText(String(+next.toFixed(1))); onChange(+next.toFixed(1));
        }
      }} />
  </label>;
}
export function PanelHeader({
  icon, title, context, actions,
}: {
  icon: ReactNode;
  title: string;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="section-heading">
        {icon}
        <h2>{title}</h2>
        {context}
      </div>
      <div className="panel-header-actions">{actions}</div>
    </header>
  );
}
export function IconButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Select({
  label,
  value,
  onChange,
  children,
  className = "",
  onLearn,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  onLearn?: () => void;
}) {
  return (
    <label className={`select-wrap ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => { onChange(e.target.value); e.currentTarget.blur(); }}
        title={onLearn ? `${label} · Rechtsklick: MIDI Learn` : undefined}
        onContextMenu={onLearn ? (e) => { e.preventDefault(); onLearn(); } : undefined}
      >
        {children}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}
/** Every track parameter is explicitly bound. Non-matrix controls (for
 * example Master FX) must opt out rather than silently missing an ID. */
type ParameterBinding = {parameterId:Param;modulation?:never}|{parameterId?:never;modulation:false};
function checkParameterBinding(id:Param|undefined,modulation:false|undefined){
  if(id===undefined){if(modulation!==false)throw new Error("Knob/Slider benötigt eine registrierte parameterId oder modulation={false}.");}
  else {if(modulation===false)throw new Error("Registrierte Parameter dürfen die Modulationsbindung nicht deaktivieren.");if(!Object.hasOwn(PARAMETER_REGISTRY,id))throw new Error(`Unregistrierte Regler-Parameter-ID: ${id}`);}
  return id===undefined?undefined:PARAMETER_REGISTRY[id];
}
export function Slider({value,min:givenMin,max:givenMax,step=.01,log:givenLog,power=1,parameterId,modulation,onChange,format=percent,onLearn,className="",...input}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"min"|"max"|"step"|"type"|"onChange">&ParameterBinding&{
  value:number;min?:number;max?:number;step?:number;log?:boolean;power?:number;
  onChange:(value:number)=>void;format?:(value:number)=>string;onLearn?:()=>void;
}){
  const meta=checkParameterBinding(parameterId,modulation);
  const min=givenMin??meta?.min??0,max=givenMax??meta?.max??1,log=givenLog??(meta?.scale==="log");
  const scale={min,max,log,power},nonlinear=log&&min>0||power!==1;
  const label=input["aria-label"]??meta?.label??"Parameter";
  const title=input.title??`${label}: ${format(value)}${onLearn?" · Rechtsklick: MIDI Learn":""}`;
  return <span className={`parameter-slider ${className}`} data-parameter-id={parameterId}>
    <input {...input} type="range" min={nonlinear?0:min} max={nonlinear?1:max} step={nonlinear ? .001 : step>0 ? step : "any"} value={nonlinear?parameterPosition(value,scale):value}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={format(value)} title={title}
      onContextMenu={onLearn?e=>{e.preventDefault();onLearn();}:input.onContextMenu}
      onChange={e=>{let next=nonlinear?parameterAt(+e.target.value,scale):+e.target.value;if(step)next=Math.round(next/step)*step;onChange(clamp(next,min,max));}}/>
    <ModulationOverlay id={parameterId} base={value} scale={scale} kind="slider" format={format} baseTitle={title}/>
  </span>;
}
export function Knob({
  label,
  value,
  min:givenMin,
  max:givenMax,
  onChange,
  format = percent,
  log:givenLog,
  power = 1,
  step,
  defaultValue:givenDefault,
  minLabel,
  maxLabel,
  locked = false,
  onLearn,
  onEdit,
  parameterId,
  modulation,
}: ParameterBinding & {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  log?: boolean;
  power?: number;
  step?: number;
  defaultValue?: number;
  minLabel?: string;
  maxLabel?: string;
  locked?: boolean;
  onLearn?: () => void;
  onEdit?: () => void;
}) {
  const meta=checkParameterBinding(parameterId,modulation);
  const min=givenMin??meta?.min??0,max=givenMax??meta?.max??1,log=givenLog??(meta?.scale==="log"),defaultValue=givenDefault??meta?.default;
  const scale={min,max,log,power};
  const drag = useRef<{ y: number; x: number; value: number } | null>(null);
  const normalized=parameterPosition(value,scale);
  const toValue=(n:number)=>parameterAt(n,scale);
  const change = (n: number) => {
    let v = toValue(clamp(n, 0, 1));
    if (step) v = Math.round(v / step) * step;
    onChange(clamp(v, min, max));
  };
  const angle = -135 + clamp(normalized, 0, 1) * 270;
  return (
    <div className={`knob-control ${locked ? "locked" : ""}`} data-parameter-id={parameterId}>
      <div
        className="knob"
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuetext={format(value)}
        tabIndex={0}
        title={`${label}: ${format(value)} · Ziehen · Shift: fein · Doppelklick: Reset${onLearn ? " · Rechtsklick: MIDI Learn" : ""}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault(); onEdit?.();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, x: e.clientX, value: normalized };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            change(
              drag.current.value +
                (drag.current.y -
                  e.clientY +
                  (e.clientX - drag.current.x) * 0.5) /
                  (e.shiftKey ? 1800 : 180),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={() => { onEdit?.(); onChange(defaultValue ?? min); }}
        onContextMenu={(e) => {
          if (onLearn) {
            e.preventDefault();
            onLearn();
          }
        }}
        onKeyDown={(e) => {
          if (
            [
              "ArrowUp",
              "ArrowRight",
              "ArrowDown",
              "ArrowLeft",
              "Home",
              "End",
            ].includes(e.key)
          ) {
            e.preventDefault(); if (!e.repeat) onEdit?.();
            if (e.key === "Home") onChange(min);
            else if (e.key === "End") onChange(max);
            else
              change(
                normalized +
                  (["ArrowUp", "ArrowRight"].includes(e.key) ? 1 : -1) *
                    (e.shiftKey ? 0.001 : 0.01),
              );
          }
        }}
      >
        <svg viewBox="0 0 64 64" className="knob-ring">
          <path
            d="M 13.6 50.4 A 26 26 0 1 1 50.4 50.4"
            className="knob-track"
          />
          <path
            d="M 13.6 50.4 A 26 26 0 1 1 50.4 50.4"
            className="knob-progress"
            pathLength="100"
            strokeDasharray={`${clamp(normalized, 0, 1) * 100} 100`}
          />

        </svg>
        <ModulationOverlay id={parameterId} base={value} scale={scale} kind="knob" format={format} baseTitle={`${label}: ${format(value)} · Ziehen · Shift: fein · Doppelklick: Reset${onLearn?" · Rechtsklick: MIDI Learn":""}`}/>
        <span className="knob-cap">
          <i style={{ transform: `rotate(${angle}deg)` }} />
        </span>
        {minLabel && <small className="knob-min">{minLabel}</small>}
        {maxLabel && <small className="knob-max">{maxLabel}</small>}
      </div>
      <span className="knob-label">
        {label}
        {locked && <i className="lock-dot" />}
      </span>
      <output>{format(value)}</output>
    </div>
  );
}
/** Shared geometry keeps the filter and amplifier envelope views identical. */
export function EnvelopeGraph({
  env,
  kind,
  curves = { attack: 0, decay: 0, release: 0 },
}: {
  env: Envelope;
  kind: "amp" | "filter";
  curves?: { attack: number; decay: number; release: number };
}) {
  const hold = Math.max(.15, (env.attack + env.decay + env.release) * .25);
  const releaseAt = env.attack + env.decay + hold, total = releaseAt + env.release;
  const x = (time: number) => 29 + time / total * 265, y = (value: number) => 70 - value * 60;
  const points = [`M${x(0)},${y(0)}`];
  let from = 0;
  [env.attack, env.decay, hold, env.release].forEach((duration, phase) => {
    for (let i = 1; i <= 48; i++) {
      const t = i / 48;
      const value = phase === 0 ? filterCurve(t, curves.attack)
        : phase === 1 ? 1 + (env.sustain - 1) * filterCurve(t, curves.decay)
        : phase === 2 ? env.sustain : env.sustain * (1 - filterCurve(t, curves.release));
      points.push(`L${x(from + duration * t).toFixed(3)},${y(value).toFixed(3)}`);
    }
    from += duration;
  });
  return <div className={`envelope-graph adsr-envelope-graph ${kind}`}>
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label={`Normierte ${kind === "amp" ? "Amplifier" : "Filter"}-ADSR 0 bis 100 Prozent: Attack ${formatTime(env.attack)}, Decay ${formatTime(env.decay)}, Sustain ${percent(env.sustain)}, Release ${formatTime(env.release)}.`}>
      {[0, .5, 1].map((v) => <g key={v}>
        <line x1="29" x2="294" y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".15" strokeDasharray="2 3" />
        <text className="adsr-envelope-axis" x="23" y={y(v) + 3} textAnchor="end">{v * 100}%</text>
      </g>)}
      {[env.attack, env.attack + env.decay, releaseAt].map((t) => <line key={t} x1={x(t)} x2={x(t)} y1="10" y2="70" stroke="currentColor" opacity=".15" />)}
      <path d={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="adsr-envelope-values">
      <span>A {formatTime(env.attack)}</span><span>D {formatTime(env.decay)}</span><span>S {percent(env.sustain)}</span><span>R {formatTime(env.release)}</span>
    </div>
  </div>;
}
export function Waveform({
  patch,
  compact = false,
}: {
  patch: Patch;
  compact?: boolean;
}) {
  const spectrum = (() => {
    if (patch.engine === "wavetable")
      return wavetableSpectrum(
        patch.wavetable,
        patch.shape,
        patch.wtWarp,
        patch.wtFormant,
        patch.brightness,
      );
    if (patch.engine !== "additive") return null;
    const real = new Float32Array(33), imag = new Float32Array(33);
    for (let n = 1; n <= Math.round(patch.harmonics); n++) {
      const peak = Math.exp(-(((n - patch.spectralPeak) / 2) ** 2));
      imag[n] =
        Math.pow(n, -(2.5 - patch.brightness * 2 - patch.spectralTilt)) *
        (1 - patch.shape * 0.8 + (n % 2 ? patch.shape * 0.8 : 0)) *
        (1 + peak * patch.spectralResonance * 5);
    }
    return { real, imag };
  })();
  const points = Array.from({ length: 241 }, (_, i) => {
    const t = (i / 240) * 4 * Math.PI;
    let value = 0;
    if (patch.engine === "fm") {
      const a = FM_ALGORITHMS.find((a) => a.id === patch.fmAlgorithm)!;
      const signals = [0, 0, 0];
      for (let op = 3; op >= 1; op--) {
        const ratio = patch[`fm${op}Ratio` as "fm1Ratio"];
        const depth = a.edges.filter((edge) => edge[1] === op).reduce((sum, [source, , key]) => sum + signals[source - 1] * patch[key], 0);
        signals[op - 1] = Math.sin(t * ratio + depth) * patch[`fm${op}Level` as "fm1Level"];
      }
      value = a.out.reduce((sum, op) => sum + signals[op - 1], 0) / a.out.length;
    }
    else if (patch.engine === "ring")
      value = Math.sin(t) * Math.sin(t * patch.fmRatio);
    else if (spectrum) {
      let energy = 0;
      for (let n = 1; n < spectrum.imag.length; n++) {
        const phase = t * n * (patch.engine === "additive"
          ? Math.sqrt(1 + patch.inharmonicity * n * n)
          : 1);
        value +=
          Math.sin(phase) * spectrum.imag[n] +
          Math.cos(phase) * spectrum.real[n];
        energy += Math.abs(spectrum.imag[n]) + Math.abs(spectrum.real[n]);
      }
      value /= Math.max(1, energy * 0.5);
    } else if (patch.engine === "granular")
      value =
        Math.sin(t * 4) * Math.sin(t * 0.5) * 0.8 + Math.sin(t * 17) * 0.15;
    else if (patch.engine === "physical") {
      const bow = patch.excitation === "bow";
      value = (Math.sin(t * 3) +
        Math.sin(t * 11) * (bow ? 0.12 : patch.brightness * 0.5) *
        (patch.excitation === "pick" ? Math.sin(patch.pluckPosition * Math.PI * 11) : 1)) *
        Math.exp(-i / (bow ? 300 : 70 + patch.stringDecay * 20));
    } else if (patch.engine === "sampler")
      value =
        Math.sin(t * 2 + 0.8 * Math.sin(t * 0.7)) * 0.7 + Math.sin(t * 7) * 0.2;
    else
      value =
        patch.wave === "sine"
          ? Math.sin(t)
          : patch.wave === "square"
            ? Math.sin(t) > 0
              ? 0.7
              : -0.7
            : patch.wave === "triangle"
              ? (Math.asin(Math.sin(t)) * 2) / Math.PI
              : ((t / (2 * Math.PI)) % 1) * 2 - 1;
    return `${i},${35 - value * 24}`;
  }).join(" ");
  return (
    <svg
      className={`waveform ${compact ? "compact" : ""}`}
      viewBox="0 0 240 70"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        x1="0"
        x2="240"
        y1="35"
        y2="35"
        stroke="currentColor"
        opacity=".13"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export function Scope({
  analyser,
  active,
}: {
  analyser?: AnalyserNode;
  active: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const el = canvas.current;
      if (!el) return;
      const rect = el.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr),
        h = Math.round(rect.height * dpr);
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
      }
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#303432";
      ctx.lineWidth = dpr;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h * i) / 4);
        ctx.lineTo(w, (h * i) / 4);
        ctx.stroke();
      }
      const data = new Float32Array(analyser?.fftSize || 2048);
      if (analyser && active) analyser.getFloatTimeDomainData(data);
      ctx.strokeStyle = "#a8bca2";
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      for (let i = 0; i < 512; i++) {
        const x = (i / 511) * w,
          y = h / 2 + (data[i * 2] || 0) * h * 1.5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (active) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);
  return (
    <canvas
      ref={canvas}
      className="scope"
      aria-label="Live-Oszilloskop des Master-Ausgangs"
    />
  );
}
export function Keyboard({
  active,
  onDown,
  onUp,
  octave,
  setOctave,
  hold,
  onHold,
}: {
  hold: boolean;
  onHold: () => void;
  active: Set<number>;
  onDown: (note: number) => void;
  onUp: (note: number) => void;
  octave: number;
  setOctave: (n: number) => void;
}) {
  const [compact, setCompact] = useState(false);
  const octaveCount = KEYBOARD_OCTAVES;
  const notes = Array.from(
      { length: octaveCount * 12 + 1 },
      (_, i) => octave * 12 + i,
    ),
    whites = notes.filter((n) => ![1, 3, 6, 8, 10].includes(n % 12)),
    held = useRef(new Set<number>());
  useEffect(() => {
    const up = () => {
      for (const n of held.current) onUp(n);
      held.current.clear();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("blur", up);
      up();
    };
  }, [onUp, octave, octaveCount]);
  const down = (note: number) => {
    if (!held.current.has(note)) {
      held.current.add(note);
      onDown(note);
    }
  };
  const up = (note: number) => {
    if (held.current.has(note)) {
      held.current.delete(note);
      onUp(note);
    }
  };
  return (
    <div className={`keyboard-section ${compact ? "keyboard-compact" : ""}`}>
      <div className="keyboard-controls">
        <span className="eyebrow">{octaveCount} OCTAVES</span>
        <div className="octave-buttons">
          <button
            aria-label="Oktave tiefer"
            onClick={() => setOctave(Math.max(2, octave - 1))}
          >
            −
          </button>
          <span>{noteName(octave * 12)}</span>
          <button
            aria-label="Oktave höher"
            onClick={() => setOctave(Math.min(4, octave + 1))}
          >
            +
          </button>
        </div>
        <div className="keyboard-options">
        <button className={`keyboard-hold small-button ${hold ? "on" : ""}`} aria-pressed={hold} title="Hold: gespielte Noten halten · Erneut drücken zum Loslassen" onClick={onHold}>HOLD</button>
        <button className="keyboard-height small-button" aria-pressed={compact} title="Keyboard-Höhe halbieren" onClick={() => setCompact(!compact)}>{compact ? "100 %" : "50 %"}</button>
        </div>
      </div>
      <div
        className="keyboard"
        onPointerLeave={() => {
          for (const n of held.current) onUp(n);
          held.current.clear();
        }}
      >
        {whites.map((note, i) => (
          <button
            key={note}
            className={`piano-key white ${active.has(note) ? "pressed" : ""}`}
            aria-label={`Play ${noteName(note)}`}
            onPointerDown={(e) => {
              e.preventDefault();
              down(note);
            }}
            onPointerEnter={(e) => {
              if (e.buttons === 1) down(note);
            }}
            onPointerLeave={() => up(note)}
          >
            <span>{i === 0 || note % 12 === 0 ? noteName(note) : ""}</span>
            {i < 8 && (
              <small>{["A", "S", "D", "F", "G", "H", "J", "K"][i]}</small>
            )}
          </button>
        ))}
        {notes
          .filter((n) => [1, 3, 6, 8, 10].includes(n % 12))
          .map((note) => {
            const left =
              (whites.filter((n) => n < note).length / whites.length) * 100;
            return (
              <button
                key={note}
                className={`piano-key black ${active.has(note) ? "pressed" : ""}`}
                style={{ left: `${left}%`, width: `${65 / whites.length}%` }}
                aria-label={`Play ${noteName(note)}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  down(note);
                }}
                onPointerEnter={(e) => {
                  if (e.buttons === 1) down(note);
                }}
                onPointerLeave={() => up(note)}
              />
            );
          })}
      </div>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      "button,input,select",
    );
    first?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const items = ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <header>
          <div>
            <span className="eyebrow">PHASE / STUDIO</span>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Schließen" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}
export function LevelMeter({ analyser }: { analyser?: AnalyserNode }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!analyser) {
      setLevel(0);
      return;
    }
    const data = new Float32Array(analyser.fftSize);
    const id = window.setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const n of data) sum += n * n;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
    }, 70);
    return () => clearInterval(id);
  }, [analyser]);
  return (
    <div className="level-meter" aria-label="Master-Pegel">
      {Array.from({ length: 24 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--meter-color":
                i > 20 ? "#e0a184" : i > 16 ? "#c4c090" : "#a4bd9e",
              opacity: level > i / 24 ? 1 : 0.15,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
