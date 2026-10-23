import { useMemo } from "react";
import { filterResponse } from "./filters";
import { FILTER_KEYS, filterLevels, needsAdvancedFilter } from "./filter-config";
import { clamp } from "./model";
import type { Patch } from "./model";

export default function FilterResponse({ patch: p, sampleRate = 48000, note = 60, velocity = 1 }: { patch: Patch; sampleRate?: number; note?: number; velocity?: number }) {
  const signature = [sampleRate, note, velocity, needsAdvancedFilter(p), p.filterType, p.multimodeType, p.combPolarity, p.cutoff, p.resonance, p.filterAmount, p.filterSustain, p.combFeedback, p.combDamping, p.combMix, p.drive, p.mods.some((m) => m.target === "drive" && m.amount !== 0), ...FILTER_KEYS.map((key) => p[key])].join("|");
  const paths = useMemo(() => {
    const levels = filterLevels(p, velocity), upper = Math.min(20000, sampleRate * .499);
    return [levels.base, levels.peak, levels.sustain].flatMap((cutoff, stage) => {
      const response = filterResponse({ ...p, cutoff }, sampleRate, note);
      return (p.filterType === "comb" && p.combSpread > 0 ? [0, 1] : [0]).map((channel) => ({ stage, channel, path: Array.from({ length: 801 }, (_, i) => {
        const hz = 20 * (upper / 20) ** (i / 800), db = 20 * Math.log10(Math.max(.00001, response(hz, channel)));
        return `${i ? "L" : "M"}${(i / 800 * 250).toFixed(2)},${(clamp((24 - db) / 72, 0, 1) * 60).toFixed(2)}`;
      }).join(" ") }));
    });
  }, [signature]);
  const nonlinear = p.drive >= .005 || (p.drivePosition < .5 && p.mods.some((m) => m.target === "drive" && m.amount !== 0)) || (p.filterType === "comb" ? p.combMode < .5 && p.combSaturation > 0 : [2, 4].includes(p.filterCharacter) && !(p.filterType === "multimode" && ["peak", "notch"].includes(p.multimodeType)));
  return <div className="filter-response" title="Frequenzgang aus denselben Koeffizienten wie der DSP. Base-Width, Mix, Keytracking und Kleinsignal-Drive enthalten; ohne Modulationsmatrix. Die Oversampling-Entzerrung des nativen Pre-Drive wird nicht dargestellt. Bei Sättigung: Kleinsignalantwort, Klang und Pegel sind signalabhängig.">
    <div className="display-meta"><span>FREQUENCY RESPONSE</span><span>{nonlinear ? "SMALL SIGNAL" : "STATIC"}</span></div>
    <svg viewBox="0 0 250 60" preserveAspectRatio="none" role="img" aria-label="Filter-Frequenzgänge bei Base, Envelope-Peak und Sustain">
      {[25, 75, 125, 175, 225].map((x) => <line key={x} x1={x} x2={x} y1="0" y2="60" stroke="currentColor" opacity=".08" />)}
      <line x1="0" x2="250" y1="20" y2="20" stroke="currentColor" opacity=".2" strokeDasharray="2 3" />
      {paths.map(({ stage, channel, path }) => <path key={`${stage}-${channel}`} d={path} className={`filter-curve filter-curve-${stage}`} fill="none" strokeWidth={channel ? "1" : "1.5"} strokeDasharray={channel ? "2 2" : stage === 1 ? "4 2" : undefined} opacity={channel ? .55 : 1} vectorEffect="non-scaling-stroke" />)}
    </svg>
    <div className="display-meta filter-response-legend"><span className="filter-curve-0">BASE</span><span className="filter-curve-1">PEAK</span><span className="filter-curve-2">SUSTAIN</span></div>
    <div className="display-meta"><span>20 Hz</span><span>0 dB ···</span><span>{Math.min(20, sampleRate * .000499).toFixed(1)} kHz</span></div>
  </div>;
}
