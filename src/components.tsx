import { wavetableSpectrum } from "./catalog";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { KEYBOARD_OCTAVES, clamp, noteName } from "./model";
import type { Envelope, Patch } from "./model";

export const formatTime = (v: number) =>
  v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`;
export const formatHz = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`;
export const percent = (v: number) => `${Math.round(v * 100)}%`;
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
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`select-wrap ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronDown size={12} />
    </label>
  );
}
export function Knob({
  label,
  value,
  min = 0,
  max = 1,
  onChange,
  format = percent,
  log = false,
  step,
  defaultValue,
  minLabel,
  maxLabel,
  locked = false,
  onLearn,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  log?: boolean;
  step?: number;
  defaultValue?: number;
  minLabel?: string;
  maxLabel?: string;
  locked?: boolean;
  onLearn?: () => void;
}) {
  const drag = useRef<{ y: number; x: number; value: number } | null>(null);
  const normalized = log
    ? Math.log(value / min) / Math.log(max / min)
    : (value - min) / (max - min);
  const toValue = (n: number) =>
    log ? min * Math.pow(max / min, n) : min + n * (max - min);
  const change = (n: number) => {
    let v = toValue(clamp(n, 0, 1));
    if (step) v = Math.round(v / step) * step;
    onChange(clamp(v, min, max));
  };
  const angle = -135 + clamp(normalized, 0, 1) * 270;
  return (
    <div className={`knob-control ${locked ? "locked" : ""}`}>
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
          e.preventDefault();
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
        onDoubleClick={() => onChange(defaultValue ?? min)}
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
            e.preventDefault();
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
export function EnvelopeGraph({
  env,
  kind,
}: {
  env: Envelope;
  kind: "amp" | "filter";
}) {
  const total = env.attack + env.decay + 1 + env.release,
    a = 18 + (env.attack / total) * 235,
    d = a + (env.decay / total) * 235,
    r = 253 - (env.release / total) * 235,
    y = 70 - env.sustain * 50;
  return (
    <div className={`envelope-graph ${kind}`}>
      <svg
        viewBox="0 0 272 90"
        preserveAspectRatio="none"
        aria-label={`${kind === "amp" ? "Amp" : "Filter"} ADSR-Hüllkurve`}
      >
        <defs>
          <linearGradient id={`env-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".19" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 45, 70].map((v) => (
          <line
            key={v}
            x1="10"
            x2="262"
            y1={v}
            y2={v}
            stroke="currentColor"
            opacity=".1"
          />
        ))}
        <path
          d={`M18,70 L${a},20 L${d},${y} L${r},${y} L253,70 Z`}
          fill={`url(#env-${kind})`}
        />
        <path
          d={`M18,70 L${a},20 L${d},${y} L${r},${y} L253,70`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        {[
          [a, 20],
          [d, y],
          [r, y],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="currentColor" />
        ))}
        <text x="18" y="85">
          A
        </text>
        <text x="87" y="85">
          D
        </text>
        <text x="163" y="85">
          S
        </text>
        <text x="245" y="85">
          R
        </text>
      </svg>
    </div>
  );
}
export function Waveform({
  patch,
  compact = false,
}: {
  patch: Patch;
  compact?: boolean;
}) {
  const spectrum =
    patch.engine === "wavetable"
      ? wavetableSpectrum(
          patch.wavetable,
          patch.shape,
          patch.wtWarp,
          patch.wtFormant,
          patch.brightness,
        )
      : null;
  const points = Array.from({ length: 241 }, (_, i) => {
    const t = (i / 240) * 4 * Math.PI;
    let value = 0;
    if (patch.engine === "fm")
      value = Math.sin(t + Math.sin(t * patch.fmRatio) * patch.fmIndex);
    else if (patch.engine === "ring")
      value = Math.sin(t) * Math.sin(t * patch.fmRatio);
    else if (spectrum) {
      let energy = 0;
      for (let n = 1; n < spectrum.imag.length; n++) {
        value +=
          Math.sin(t * n) * spectrum.imag[n] +
          Math.cos(t * n) * spectrum.real[n];
        energy += Math.abs(spectrum.imag[n]) + Math.abs(spectrum.real[n]);
      }
      value /= Math.max(1, energy * 0.5);
    } else if (patch.engine === "additive")
      for (let n = 1; n <= Math.round(patch.harmonics); n++)
        value +=
          (Math.sin(t * n) / Math.pow(n, 2.5 - patch.brightness * 1.5)) * 0.55;
    else if (patch.engine === "granular")
      value =
        Math.sin(t * 4) * Math.sin(t * 0.5) * 0.8 + Math.sin(t * 17) * 0.15;
    else if (patch.engine === "physical")
      value =
        Math.sin(t * 3) * Math.exp(-i / 150) +
        Math.sin(t * 11) * Math.exp(-i / 60) * 0.3;
    else if (patch.engine === "sampler")
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
}: {
  active: Set<number>;
  onDown: (note: number) => void;
  onUp: (note: number) => void;
  octave: number;
  setOctave: (n: number) => void;
}) {
  const notes = Array.from(
      { length: KEYBOARD_OCTAVES * 12 + 1 },
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
    };
  }, [onUp]);
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
    <div className="keyboard-section">
      <div className="keyboard-controls">
        <span className="eyebrow">4 OCTAVES</span>
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
        <span className="keyboard-hint">A W S E D F T G Y H U J K</span>
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
