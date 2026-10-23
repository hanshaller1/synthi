import type { Engine, Patch } from "./model";

type Recipe = Partial<Patch> & { name: string };
type EightSounds = readonly [Recipe, Recipe, Recipe, Recipe, Recipe, Recipe, Recipe, Recipe];
const room = { saturationMode: false, modulationMode: false, delayMode: false, reverbMode: true };
const motion = { ...room, modulationMode: true };
const echo = { ...room, delayMode: true };

/** Hand-authored timbres. Separate recipes keep the original demo preset indices stable. */
const recipes: Record<Exclude<Engine, "sampler">, EightSounds> = {
  subtractive: [
    { name: "SUB · Rounded foundation", wave: "square", wave2: "triangle", mix: .22, pulseWidth: .42, sub: .3, cutoff: 720, filterAmount: 2.4, filterDecay: .22, filterSustain: 0, voiceMode: "mono", sustain: .3, release: .14 },
    { name: "SUB · Amber brass", wave: "sawtooth", wave2: "sawtooth", detune: 7, mix: .5, cutoff: 2100, filterAmount: 1.5, filterAttack: .07, filterDecay: .4, filterSustain: .4, attack: .04, sustain: .75, release: .32 },
    { name: "SUB · Narrow escape", wave: "square", wave2: "sine", mix: .08, pulseWidth: .19, cutoff: 4200, resonance: 3.5, filterAmount: 1.2, filterDecay: .18, filterSustain: .1, voiceMode: "mono", glide: .13, sustain: .7, release: .22 },
    { name: "SUB · Eighties horizon", wave: "sawtooth", wave2: "sawtooth", unison: 4, unisonDetune: 13, detune: 9, cutoff: 3600, filterAmount: 1.2, filterAttack: 1.1, filterDecay: 1.3, filterSustain: .8, attack: .65, sustain: .85, release: 2.4, level: .35, chorus: .25, reverb: .24, fxEnabled: motion },
    { name: "SUB · Acid filament", wave: "sawtooth", mix: .1, filterType: "multimode", multimodeType: "lp4", filterCharacter: 4, cutoff: 420, resonance: 14, filterCompensation: .7, filterAmount: 4.6, filterDecay: .17, filterSustain: 0, filterDecayCurve: -24, drive: .18, voiceMode: "mono", decay: .2, sustain: .15, release: .12, level: .38 },
    { name: "SUB · Cedar pluck", wave: "triangle", wave2: "square", pulseWidth: .32, mix: .24, cutoff: 1350, filterAmount: 2.8, filterDecay: .12, filterSustain: 0, decay: .33, sustain: 0, release: .24 },
    { name: "SUB · Breath circuit", wave: "triangle", wave2: "sine", mix: .4, noise: .35, cutoff: 1800, filterType: "bandpass", resonance: 4, attack: .13, sustain: .8, release: .7, filterAmount: .6, filterAttack: .2, filterSustain: .7, mods: [{ source: "lfo1", target: "pitch", amount: .004 }] },
    { name: "SUB · Glass syncopation", wave: "square", wave2: "triangle", osc2Tune: 12, mix: .4, pulseWidth: .5, cutoff: 7600, attack: .002, decay: .16, sustain: 0, release: .18, delay: .22, delayTime: .25, reverb: .12, fxEnabled: echo, mods: [{ source: "lfo2", target: "pulseWidth", amount: .28 }] },
  ],
  wavetable: [
    { name: "WT · Silk atlas", wavetable: 3, shape: .25, wtWarp: .08, unison: 3, unisonDetune: 8, cutoff: 4300, attack: .45, sustain: .85, release: 2.1, level: .36, reverb: .28, fxEnabled: room, mods: [{ source: "lfo3", target: "shape", amount: .35 }] },
    { name: "WT · Digital mallet", wavetable: 4, shape: .7, wtWarp: .24, brightness: .75, cutoff: 10500, decay: .65, sustain: 0, release: .4, drive: 0 },
    { name: "WT · Vowel halo", wavetable: 8, shape: .4, wtFormant: .72, wtWarp: -.17, cutoff: 7200, attack: .75, sustain: .8, release: 2.8, reverb: .35, fxEnabled: room, mods: [{ source: "lfo1", target: "wtFormant", amount: .35 }] },
    { name: "WT · Copper prism", wavetable: 17, shape: .62, wtWarp: .42, wtFormant: .22, brightness: .7, cutoff: 6000, decay: .4, sustain: .12, release: .5, level: .4 },
    { name: "WT · Console ribbon", wavetable: 24, shape: .12, wtWarp: -.3, cutoff: 8200, voiceMode: "mono", glide: .055, attack: .002, sustain: .65, release: .12, mods: [{ source: "lfo2", target: "shape", amount: .16 }] },
    { name: "WT · Cathedral pixels", wavetable: 22, shape: .82, wtFormant: .18, cutoff: 11500, attack: .025, sustain: 1, release: .7, chorus: .17, reverb: .3, fxEnabled: motion },
    { name: "WT · Fractal undertow", wavetable: 30, shape: .56, wtWarp: -.55, brightness: .35, cutoff: 950, resonance: 6, filterAmount: 2.1, filterDecay: .3, filterSustain: .15, voiceMode: "mono", sub: .18, decay: .45, sustain: .3, release: .2, level: .4 },
    { name: "WT · Ice mirror", wavetable: 31, shape: .92, wtWarp: .12, wtFormant: .6, brightness: .85, filterType: "highpass", cutoff: 540, attack: 1.2, sustain: .8, release: 3.2, level: .34, reverb: .38, fxEnabled: room, mods: [{ source: "lfo3", target: "wtWarp", amount: .18 }] },
  ],
  fm: [
    { name: "FM · Phase tine", fmAlgorithm: "parallel", fm2Ratio: 2, fm3Ratio: 3, fmIndex21: 1.2, fmIndex31: .55, fm2Decay: 1, fm2Sustain: .08, fm3Decay: .28, fm3Sustain: 0, attack: .003, decay: 1.3, sustain: .05, release: .8, drive: 0 },
    { name: "FM · Iron lantern", fmAlgorithm: "serial", fm2Ratio: 3.5, fm3Ratio: 7, fmIndex21: 2.1, fmIndex32: .9, fm3Level: .65, fm2Decay: .85, fm2Sustain: 0, fm3Decay: .32, fm3Sustain: .1, decay: 1.8, sustain: 0, release: 1.3, level: .4, drive: 0 },
    { name: "FM · Velvet current", fmAlgorithm: "branched", fm2Ratio: 1, fm3Ratio: .5, fmIndex21: .5, fmIndex32: .22, fmIndex31: .35, fm2Feedback: .03, fm2Attack: .32, fm2Sustain: .8, fm3Attack: .6, fm3Sustain: .6, attack: .55, sustain: .85, release: 2.2, cutoff: 6300, level: .38, reverb: .25, fxEnabled: room },
    { name: "FM · Twin reed", fmAlgorithm: "dual", fm2Wave: 1, fm2Ratio: 2, fm3Ratio: 3, fmIndex32: .7, fm2Level: .7, fm1Level: .6, fm2Attack: .04, fm2Sustain: .75, fm3Sustain: .4, attack: .035, sustain: .8, release: .4, cutoff: 7600 },
    { name: "FM · Wire ember", fmAlgorithm: "hybrid", fm2Ratio: 1, fm3Ratio: 5, fmIndex21: 1.1, fmIndex32: .45, fm2Level: .5, fm2Feedback: .12, fm2Decay: .3, fm2Sustain: .2, fm3Decay: .09, fm3Sustain: 0, decay: .55, sustain: .15, release: .35, cutoff: 8500, level: .4 },
    { name: "FM · Glass drawbars", fmAlgorithm: "triple", fm1Ratio: 1, fm2Ratio: 2, fm3Ratio: 4, fm1Level: .9, fm2Level: .5, fm3Level: .25, fm3Wave: 1, fm2Sustain: 1, fm3Sustain: 1, fm1Release: .45, fm2Release: .45, fm3Release: .45, attack: .008, sustain: 1, release: .4, drive: 0, chorus: .2, reverb: .18, fxEnabled: motion },
    { name: "FM · Quartz strike", fmAlgorithm: "parallel", fm2Ratio: 2.9, fm3Mode: 1, fm3Hz: 1170, fmIndex21: .6, fmIndex31: 1.3, fm2Decay: .18, fm2Sustain: 0, fm3Decay: .085, fm3Sustain: 0, fm1Release: .7, attack: .002, decay: .48, sustain: 0, release: .5, cutoff: 13500, level: .4, drive: 0 },
    { name: "FM · Hollow ratio", fmAlgorithm: "serial", fm1Wave: 1, fm2Ratio: .5, fm3Ratio: 1.5, fmIndex21: .9, fmIndex32: .4, fm2Sustain: .5, fm3Sustain: .45, fm2DecayCurve: -3, fm3Attack: .08, attack: .018, sustain: .8, release: .55, cutoff: 4200, voiceMode: "mono", glide: .08 },
  ],
  additive: [
    { name: "ADD · Pure foundation", harmonics: 1, shape: 0, brightness: .2, spectralTilt: 0, cutoff: 9000, attack: .02, sustain: .9, release: .4, drive: 0, voiceMode: "mono" },
    { name: "ADD · Odd clarinet", harmonics: 18, shape: 1, brightness: .48, spectralTilt: -.15, spectralPeak: 3, spectralResonance: .3, attack: .065, sustain: .85, release: .28, cutoff: 6100 },
    { name: "ADD · Harmonic sunrise", harmonics: 32, shape: .08, brightness: .68, spectralTilt: .12, spectralPeak: 8, spectralResonance: .4, unison: 3, unisonDetune: 6, attack: 1.1, sustain: .9, release: 2.3, cutoff: 8500, level: .35, mods: [{ source: "lfo3", target: "spectralPeak", amount: .25 }] },
    { name: "ADD · Bronze bowl", harmonics: 14, brightness: .4, spectralTilt: -.3, spectralPeak: 5, spectralResonance: .8, inharmonicity: .019, decay: 2.6, sustain: 0, release: 2.5, cutoff: 10500, level: .44, drive: 0 },
    { name: "ADD · Electric drawbar", harmonics: 9, shape: .85, brightness: .76, spectralPeak: 3, spectralResonance: .6, attack: .004, sustain: 1, release: .16, cutoff: 14000, chorus: .16, reverb: .13, fxEnabled: motion },
    { name: "ADD · Spectral needle", harmonics: 24, brightness: .85, spectralTilt: .35, spectralPeak: 15, spectralResonance: 1, decay: .21, sustain: 0, release: .12, filterType: "highpass", cutoff: 650, level: .38 },
    { name: "ADD · Soft marimba", harmonics: 7, shape: .65, brightness: .35, spectralTilt: -.45, spectralPeak: 4, spectralResonance: .6, inharmonicity: .002, decay: .42, sustain: 0, release: .27, cutoff: 5400, drive: 0 },
    { name: "ADD · Starfield choir", harmonics: 28, brightness: .55, spectralTilt: -.1, spectralPeak: 11, spectralResonance: .7, inharmonicity: .006, attack: .9, sustain: .8, release: 2.8, cutoff: 7800, level: .34, reverb: .32, fxEnabled: room, mods: [{ source: "lfo3", target: "spectralTilt", amount: .16 }] },
  ],
  ring: [
    { name: "RING · Tremolo velvet", wave: "triangle", wave2: "sine", fmRatio: .5, ringOffset: -25, shape: .05, ringDepth: .6, ringDry: .4, ringBias: .1, cutoff: 5200, attack: .18, sustain: .8, release: .75 },
    { name: "RING · Steel interval", wave: "sine", wave2: "sine", fmRatio: 1.414, shape: 1, ringDepth: 1, ringDry: .12, decay: 1.2, sustain: .05, release: .9, cutoff: 10000, drive: 0 },
    { name: "RING · Broken dial", wave: "square", wave2: "triangle", fmRatio: 2.67, ringOffset: 43, shape: .85, ringDepth: .9, ringDry: .2, cutoff: 3400, attack: .008, decay: .22, sustain: .15, release: .15, level: .38 },
    { name: "RING · Octave glass", wave: "sine", wave2: "sine", fmRatio: 2, shape: 1, ringDepth: .8, ringDry: .3, decay: .75, sustain: .1, release: .6, delay: .18, reverb: .18, fxEnabled: echo },
    { name: "RING · Dark sideband", wave: "sawtooth", wave2: "sine", fmRatio: .5, shape: .7, ringDepth: .8, ringDry: .35, cutoff: 650, filterAmount: 2.2, filterDecay: .24, filterSustain: .1, voiceMode: "mono", sustain: .45, release: .2 },
    { name: "RING · Polar drone", wave: "triangle", wave2: "sine", fmRatio: 1.01, ringOffset: 3, shape: .9, ringDepth: 1, ringDry: .15, attack: 1.4, sustain: .9, release: 3.1, cutoff: 4500, level: .38, mods: [{ source: "lfo3", target: "ringBias", amount: .18 }] },
    { name: "RING · Radio chime", wave: "sine", wave2: "triangle", fmRatio: 3.73, ringOffset: 107, shape: 1, ringDepth: 1, ringDry: .08, decay: .6, sustain: 0, release: .8, cutoff: 13500, drive: 0, level: .42 },
    { name: "RING · Bias flute", wave: "sine", wave2: "sine", fmRatio: 1, shape: .35, ringDepth: .65, ringDry: .6, ringBias: .45, attack: .09, sustain: .8, release: .38, cutoff: 3300, mods: [{ source: "lfo1", target: "pitch", amount: .003 }] },
  ],
  granular: [
    { name: "GRAIN · Ocean veil", grainSampleId: "grain-0-1", grainSize: .24, grainDensity: 24, position: .45, spread: .5, grainScan: .12, grainPan: .8, attack: 1.2, sustain: .9, release: 2.5, cutoff: 5700, level: .38 },
    { name: "GRAIN · Vowel orchard", grainSampleId: "grain-1-1", grainSize: .14, grainDensity: 22, position: .25, spread: .16, grainScan: .2, grainPitch: .1, attack: .35, sustain: .8, release: 1.6, cutoff: 8200, reverb: .25, fxEnabled: room },
    { name: "GRAIN · Piano constellation", grainSampleId: "grain-2-0", grainSize: .07, grainDensity: 11, position: .16, spread: .35, grainPitch: 12, grainPan: .75, grainReverse: .2, attack: .015, decay: 1.5, sustain: .25, release: 1.8, cutoff: 10000, level: .4 },
    { name: "GRAIN · Copper rain", grainSampleId: "grain-3-1", grainSize: .035, grainDensity: 30, position: .6, spread: .7, grainReverse: .35, grainPitch: 7, grainPan: 1, filterType: "highpass", cutoff: 700, attack: .2, sustain: .65, release: 1.1, level: .34 },
    { name: "GRAIN · Crystal swarm", grainSampleId: "grain-4-1", grainSize: .045, grainDensity: 36, position: .3, spread: .4, grainScan: -.15, grainWindow: .2, grainPitch: 4, attack: .08, sustain: .8, release: .9, cutoff: 11500, level: .35 },
    { name: "GRAIN · Seed percussion", grainSampleId: "grain-5-2", grainSize: .022, grainDensity: 9, position: .1, spread: .12, grainWindow: .12, attack: .002, decay: .23, sustain: 0, release: .14, cutoff: 7800, level: .45 },
    { name: "GRAIN · Submarine drift", grainSampleId: "grain-6-0", grainSize: .28, grainDensity: 16, position: .65, spread: .18, grainScan: -.08, grainReverse: .6, cutoff: 1200, attack: .4, sustain: .85, release: 1.5, voiceMode: "mono", grainPitch: .2 },
    { name: "GRAIN · Reverse aurora", grainSampleId: "grain-7-3", grainSize: .32, grainDensity: 28, position: .7, spread: .4, grainReverse: 1, grainScan: -.24, grainPan: .9, attack: 1.6, sustain: .9, release: 3.4, cutoff: 9200, level: .34, reverb: .3, fxEnabled: room },
  ],
  physical: [
    { name: "PHYS · Cedar fingerstyle", excitation: "pick", pluckPosition: .22, stringDecay: 3.4, damping: .991, bodySize: .24, dispersion: .12, brightness: .6, decay: 1, sustain: .05, release: .7, cutoff: 8600 },
    { name: "PHYS · Muted palm", excitation: "pick", pluckPosition: .13, stringDecay: .45, damping: .965, bodySize: .12, dispersion: .05, brightness: .35, decay: .2, sustain: 0, release: .12, cutoff: 3900 },
    { name: "PHYS · Glass koto", excitation: "pick", pluckPosition: .055, stringDecay: 5.5, damping: .996, bodySize: .05, dispersion: .65, brightness: .9, decay: 1.8, sustain: .08, release: 1.4, cutoff: 12500, drive: 0 },
    { name: "PHYS · Copper wire", excitation: "noise", pluckPosition: .37, stringDecay: 6.3, damping: .998, bodySize: .45, dispersion: .85, brightness: .75, decay: 2, sustain: .1, release: 1.6, cutoff: 9800, level: .42 },
    { name: "PHYS · Bowed dusk", excitation: "bow", pluckPosition: .46, stringDecay: 9, damping: .999, bodySize: .65, dispersion: .22, brightness: .4, attack: .42, decay: 2.4, sustain: .7, release: 2.2, cutoff: 4600, reverb: .26, fxEnabled: room },
    { name: "PHYS · Hollow kalimba", excitation: "pick", pluckPosition: .33, stringDecay: 1.6, damping: .986, bodySize: .76, dispersion: .4, brightness: .58, decay: .7, sustain: 0, release: .5, cutoff: 6500 },
    { name: "PHYS · Resonant bridge", excitation: "noise", pluckPosition: .72, stringDecay: 4.5, damping: .995, bodySize: .9, dispersion: .55, brightness: .82, decay: 1.5, sustain: .12, release: 1.1, filterType: "bandpass", cutoff: 1700, resonance: 2.3, level: .4 },
    { name: "PHYS · Low wooden pulse", excitation: "pick", pluckPosition: .42, stringDecay: 2.2, damping: .989, bodySize: .6, dispersion: .08, brightness: .3, voiceMode: "mono", cutoff: 1900, decay: .55, sustain: .08, release: .3 },
  ],
};

export function makeSoundBank(make: (recipe: Partial<Patch>) => Patch): Patch[] {
  return (Object.keys(recipes) as (keyof typeof recipes)[]).flatMap((engine) => recipes[engine].map((recipe) => make({
    engine, fmVersion: 2, sub: 0, noise: 0, mods: [], drive: .04,
    cutoff: 12000, resonance: .8, filterAmount: 0, level: .5,
    attack: .008, decay: .45, sustain: .65, release: .6,
    ...recipe,
  })));
}
