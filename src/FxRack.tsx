import { ArrowLeft, ArrowRight, Power, Sparkles } from "lucide-react";
import { Knob, Select, formatHz, formatTime, percent } from "./components";
import { FX_OPTIONS } from "./model";
import type { FxSlot, Param, Patch } from "./model";
import { FX_CONTROLS, fxValues } from "./fx-spec";
import type { FxControl } from "./fx-spec";
import { transfer } from "./effects";
export function EffectVisual({
  mode,
  values,
}: {
  mode: string;
  values: Record<string, number>;
}) {
  const line = (fn: (x: number) => number, scale = 30) =>
    Array.from(
      { length: 161 },
      (_, i) => `${i ? "L" : "M"}${i * 1.5},${45 - fn(i / 160) * scale}`,
    ).join(" ");
  const v = values;
  let art;
  if (["soft", "hard", "fold", "crush", "diode"].includes(mode))
    art = (
      <>
        <path className="fx-reference" d="M0 75L240 15" />
        <path d={line((x) => transfer(x * 2 - 1, mode, v))} />
      </>
    );
  else if (mode === "chorus")
    art = (
      <>
        {[-1, 0, 1].map((i) => (
          <path
            key={i}
            opacity={i ? 0.45 : 1}
            d={line(
              (x) =>
                Math.sin(x * Math.PI * 5 + i * (v.depth ?? 0.5)) * 0.8 +
                i * 0.15,
            )}
          />
        ))}
      </>
    );
  else if (mode === "flanger")
    art = (
      <path
        d={line(
          (x) =>
            Math.cos(x * 40) *
            (0.5 + Math.sin(x * 7) * 0.4) *
            (1 + (v.regen ?? 0.4) * 0.2),
        )}
      />
    );
  else if (mode === "vibrato")
    art = (
      <>
        <path className="fx-reference" d="M0 45H240" />
        <path
          d={line(
            (x) => Math.sin(x * Math.PI * 8) * (0.15 + (v.cents ?? 25) / 140),
          )}
        />
      </>
    );
  else if (mode === "phaser")
    art = (
      <path
        d={line(
          (x) =>
            0.6 -
            [0.17, 0.38, 0.6, 0.83].reduce(
              (sum, point) =>
                sum + 0.7 * Math.exp(-((x - point) ** 2) / 0.0015),
              0,
            ),
        )}
      />
    );
  else if (mode === "tremolo")
    art = (
      <path
        d={line(
          (x) =>
            (v.shape > 0.5
              ? Math.sin(x * 22) > 0
                ? 1
                : -1
              : Math.sin(x * 22)) * v.depth,
        )}
      />
    );
  else if (["digital", "tape", "pingpong", "multitap", "dub"].includes(mode))
    art = (
      <>
        {Array.from({ length: mode === "multitap" ? 12 : 7 }, (_, i) => {
          const x = 14 + i * (mode === "multitap" ? 19 : 34),
            height = 62 * (v.feedback + 0.2) ** (i / 2);
          return (
            <g key={i}>
              <path
                opacity={1 - i * 0.055}
                d={
                  mode === "tape"
                    ? `M${x} 77Q${x - 6} ${77 - height} ${x + 3} ${77 - height}Q${x + 10} ${77 - height} ${x + 12} 77`
                    : mode === "dub"
                      ? `M${x - 6} 77Q${x} ${77 - height * 1.5} ${x + 6} 77`
                      : `M${x} 77V${77 - height}H${x + 8}V77`
                }
                transform={
                  mode === "pingpong" && i % 2 ? "translate(0,-14)" : undefined
                }
              />
              {mode === "pingpong" && (
                <text x={x} y="88">
                  {i % 2 ? "R" : "L"}
                </text>
              )}
            </g>
          );
        })}
      </>
    );
  else if (mode === "room")
    art = (
      <>
        <path d="M26 15L194 15L220 72L8 72Z M26 15L40 58L194 58L194 15 M8 72L40 58 M194 58L220 72" />
        <path className="fx-reference" d="M40 58L100 30L165 58L80 19L25 64" />
      </>
    );
  else if (mode === "hall")
    art = (
      <>
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            opacity={1 - i * 0.16}
            d={`M${10 + i * 17} 78V${12 + i * 7}H${230 - i * 17}V78`}
          />
        ))}
      </>
    );
  else if (mode === "plate")
    art = (
      <>
        <path d="M30 15L218 22L204 76L14 64Z" />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            opacity=".5"
            d={`M${40 + i * 40} 17L${29 + i * 40} 67 M22 ${26 + i * 10}L213 ${34 + i * 10}`}
          />
        ))}
      </>
    );
  else if (mode === "spring")
    art = (
      <path
        d={line(
          (x) =>
            Math.sin(x * (80 + v.tension * 80)) * Math.sin(x * Math.PI) * 0.75,
        )}
      />
    );
  else
    art = (
      <>
        <path d={`M5 76L5 20L${20 + v.gate * 190} 30V76H235`} />
        <path className="fx-reference" d="M5 20Q130 40 235 76" />
      </>
    );
  return (
    <svg
      className={`fx-art fx-art-${mode}`}
      viewBox="0 0 240 90"
      role="img"
      aria-label={`${mode} Effektvisualisierung`}
    >
      <path
        className="fx-grid"
        d="M0 15H240M0 45H240M0 75H240M60 0V90M120 0V90M180 0V90"
      />
      {art}
    </svg>
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
export default function FxRack({
  patch: p,
  onPatch,
  onParam,
  locks,
  tempo,
  onLearn,
}: {
  patch: Patch;
  onPatch: (p: Partial<Patch>) => void;
  onParam: (p: Param, value: number) => void;
  locks: Partial<Record<Param, number>>;
  tempo: number;
  onLearn: (param: Param) => void;
}) {
  const move = (index: number, offset: number) => {
    const order = [...p.fxOrder];
    [order[index], order[index + offset]] = [
      order[index + offset],
      order[index],
    ];
    onPatch({ fxOrder: order });
  };
  return (
    <div className="effects-grid serial-fx">

      {p.fxOrder.map((slot, index) => {
        const mode = p[slot],
          controls = FX_CONTROLS[mode],
          values = fxValues(p, mode),
          enabled = p.fxEnabled[slot];
        return (
          <section
            className={`module effect-module ${enabled ? "" : "fx-bypassed"}`}
            key={slot}
            data-slot={slot}
          >
            <div className="fx-slot-header">
              <span>
                0{index + 1} <Sparkles size={12} />
              </span>
              <button
                className={`fx-power ${enabled ? "on" : ""}`}
                aria-label={`${titles[slot]} ${enabled ? "deaktivieren" : "aktivieren"}`}
                aria-pressed={enabled}
                onClick={() =>
                  onPatch({ fxEnabled: { ...p.fxEnabled, [slot]: !enabled } })
                }
              >
                <Power size={13} />
                {enabled ? "ON" : "BYPASS"}
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
              label={`${titles[slot]} Effektvariante`}
              value={mode}
              onChange={(value) => onPatch({ [slot]: value })}
            >
              {FX_OPTIONS[slot].map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <EffectVisual mode={mode} values={values} />
            <div className="fx-controls">
              {controls.map((control) => (
                <Knob
                  key={control.key}
                  label={control.label}
                  value={
                    control.param
                      ? (locks[control.param] ?? p[control.param])
                      : values[control.key]
                  }
                  min={control.min}
                  max={control.max}
                  log={control.log}
                  step={control.unit === "bits" ? 1 : control.step}
                  defaultValue={control.default}
                  format={formatFx(control)}
                  locked={control.param ? control.param in locks : false}
                  onLearn={
                    control.param ? () => onLearn(control.param!) : undefined
                  }
                  onChange={(value) =>
                    control.param
                      ? onParam(control.param, value)
                      : onPatch({
                          fxSettings: {
                            ...p.fxSettings,
                            [mode]: {
                              ...p.fxSettings[mode],
                              [control.key]: value,
                            },
                          },
                        })
                  }
                />
              ))}
            </div>
            {slot === "delayMode" && (
              <div className="delay-sync">
                {[0.25, 0.5, 0.75, 1].map((beat) => (
                  <button
                    className="small-button"
                    key={beat}
                    onClick={() =>
                      onParam("delayTime", Math.min(1.5, (60 / tempo) * beat))
                    }
                  >
                    {beat === 0.25
                      ? "1/16"
                      : beat === 0.5
                        ? "1/8"
                        : beat === 0.75
                          ? "1/8·"
                          : "1/4"}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
