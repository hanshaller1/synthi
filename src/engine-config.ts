import type { Engine, Patch } from "./model";

export const ENGINE_PARAMS = {
  syncAmount: [0, 1, 0], pulseWidth2: [.05, .95, .5],
  subWave: [0, 3, 0], subOctave: [-3, 0, -1],
  osc1Phase: [0, 1, 0], osc2Phase: [0, 1, 0], oscPhaseReset: [0, 1, 1], noiseColor: [-1, 1, 0],
  wtWarpMode: [0, 3, 0], wtSpread: [0, 1, 0], wtMorphSkew: [-1, 1, 0],
  wtPhase: [0, 1, 0], wtPhaseReset: [0, 1, 1], wtRandomPhase: [0, 1, 0], wtBlur: [0, 1, 0],
  addBand1: [0, 1, 1], addBand2: [0, 1, 1], addBand3: [0, 1, 1], addBand4: [0, 1, 1],
  addBand5: [0, 1, 1], addBand6: [0, 1, 1], addBand7: [0, 1, 1], addBand8: [0, 1, 1],
  addSpectralDecay: [0, 8, 0], addPartialDetune: [0, 30, 0], addPartialDrift: [0, 20, 0], addBlur: [0, 1, 0], addRandomPhase: [0, 1, 0],
  ringModMode: [0, 1, 0], ringModHz: [.1, 16000, 440], ringModPhase: [0, 1, 0], ringPhaseReset: [0, 1, 1], ringBiasMode: [0, 1, 1],
  ringPitchDepth: [-48, 48, 0], ringPitchAttack: [0, 4, 0], ringPitchDecay: [.001, 8, .2], ringPitchSustain: [0, 1, 0], ringPitchRelease: [.001, 8, .2],
  ringEnvEnabled: [0, 1, 0], ringEnvAttack: [0, 4, 0], ringEnvDecay: [.001, 8, .4], ringEnvSustain: [0, 1, 1], ringEnvRelease: [.001, 8, .4],
  ringSidebandTilt: [-1, 1, 0], ringSidebandCutoff: [100, 18000, 18000],
  grainWindowShape: [0, 4, 0], grainQuantize: [0, 4, 0], grainScaleRoot: [0, 11, 0],
  grainSync: [0, 1, 0], grainSyncDivision: [0, 7, 3], grainAttack: [0, .4, 0], grainRelease: [0, .4, 0],
  grainFreeze: [0, 1, 0], grainStereoMotion: [0, 1, 0], grainMotionRate: [.01, 4, .15], grainDrift: [0, 1, 0],
  sampleLoopCrossfade: [0, .25, 0], samplePlayback: [0, 3, 0], sampleSlices: [1, 32, 1], sampleSlice: [0, 31, 0],
  sampleVelocityStart: [-1, 1, 0], sampleStretchMode: [0, 1, 0], sampleStretch: [.25, 4, 1], samplePingPong: [0, 1, 0],
  pickHardness: [0, 1, .5], pickupPosition: [0, 1, 0], excitationDuration: [0, 1, 0],
  bodyFrequency: [0, 6000, 0], bodyQ: [0, 20, 0], stringStiffness: [0, 1, 0],
  bowMode: [0, 1, 1], bowPressure: [0, 1, .3], bowSpeed: [0, 1, .2], stringCoupling: [0, 1, 0],
} as const;
export type EngineParam = keyof typeof ENGINE_PARAMS;
export const ENGINE_KEYS = Object.keys(ENGINE_PARAMS) as EngineParam[];
export const ENGINE_DISCRETE: readonly EngineParam[] = ["subWave", "subOctave", "oscPhaseReset", "wtWarpMode", "wtPhaseReset", "wtRandomPhase", "addRandomPhase", "ringModMode", "ringPhaseReset", "ringBiasMode", "ringEnvEnabled", "grainWindowShape", "grainQuantize", "grainScaleRoot", "grainSync", "grainSyncDivision", "grainFreeze", "samplePlayback", "sampleSlices", "sampleSlice", "sampleStretchMode", "samplePingPong", "bowMode"];
export const ENGINE_OPTIONS: Partial<Record<EngineParam, readonly string[]>> = {
  subWave: ["Sine", "Triangle", "Saw", "Square"], oscPhaseReset: ["Free phase", "Phase reset"],
  wtWarpMode: ["Bend", "Fold", "Sync", "Mirror"], wtPhaseReset: ["Free phase", "Phase reset"], wtRandomPhase: ["Fixed phase", "Random phase"],
  addRandomPhase: ["Aligned partials", "Random phase"], ringModMode: ["Ratio", "Fixed Hz"], ringPhaseReset: ["Free phase", "Phase reset"], ringBiasMode: ["Legacy dry bias", "DC modulator bias"], ringEnvEnabled: ["Envelope bypass", "Depth envelope on"],
  grainWindowShape: ["Legacy ramp", "Hann", "Triangle", "Gaussian", "Tukey"], grainQuantize: ["Off", "Semitones", "Major", "Minor", "Pentatonic"],
  grainScaleRoot: ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"], grainSync: ["Free density", "Tempo sync"], grainSyncDivision: ["1/64", "1/32", "1/16", "1/8", "1/4", "1/2", "1 bar", "2 bars"], grainFreeze: ["Cloud live", "Cloud freeze"],
  samplePlayback: ["Legacy · Loop flag", "One-shot", "Gate", "Loop"], sampleStretchMode: ["Tape / resample", "Time stretch"], samplePingPong: ["Forward loop", "Ping-pong loop"], bowMode: ["Initial excitation", "Continuous bow"],
};
export const ENGINE_LABELS: Record<EngineParam, string> = {
  syncAmount: "Hard sync", pulseWidth2: "OSC 2 pulse width", subWave: "Sub waveform", subOctave: "Sub octave", osc1Phase: "OSC 1 phase", osc2Phase: "OSC 2 phase", oscPhaseReset: "Oscillator phase", noiseColor: "Noise color",
  wtWarpMode: "Warp mode", wtSpread: "Table spread", wtMorphSkew: "Morph skew", wtPhase: "Start phase", wtPhaseReset: "Phase reset", wtRandomPhase: "Random phase", wtBlur: "Spectral blur",
  addBand1: "Partials 1–4", addBand2: "Partials 5–8", addBand3: "Partials 9–12", addBand4: "Partials 13–16", addBand5: "Partials 17–20", addBand6: "Partials 21–24", addBand7: "Partials 25–28", addBand8: "Partials 29–32",
  addSpectralDecay: "Spectral decay", addPartialDetune: "Partial detune", addPartialDrift: "Partial drift", addBlur: "Spectral blur", addRandomPhase: "Random phase",
  ringModMode: "Frequency mode", ringModHz: "Modulator Hz", ringModPhase: "Modulator phase", ringPhaseReset: "Phase reset", ringBiasMode: "Bias routing", ringPitchDepth: "Pitch env depth", ringPitchAttack: "Pitch attack", ringPitchDecay: "Pitch decay", ringPitchSustain: "Pitch sustain", ringPitchRelease: "Pitch release", ringEnvEnabled: "Modulation envelope", ringEnvAttack: "Depth attack", ringEnvDecay: "Depth decay", ringEnvSustain: "Depth sustain", ringEnvRelease: "Depth release", ringSidebandTilt: "Sideband tilt", ringSidebandCutoff: "Sideband LP",
  grainWindowShape: "Window shape", grainQuantize: "Pitch quantize", grainScaleRoot: "Scale root", grainSync: "Grain sync", grainSyncDivision: "Grain division", grainAttack: "Grain attack", grainRelease: "Grain release", grainFreeze: "Cloud freeze", grainStereoMotion: "Stereo motion", grainMotionRate: "Motion rate", grainDrift: "Stereo drift",
  sampleLoopCrossfade: "Loop crossfade", samplePlayback: "Playback mode", sampleSlices: "Slices", sampleSlice: "Slice", sampleVelocityStart: "Velocity → start", sampleStretchMode: "Time stretch mode", sampleStretch: "Duration", samplePingPong: "Loop direction",
  pickHardness: "Pick hardness", pickupPosition: "Pickup position", excitationDuration: "Excitation length", bodyFrequency: "Body frequency", bodyQ: "Body Q", stringStiffness: "String stiffness", bowMode: "Bow mode", bowPressure: "Bow pressure", bowSpeed: "Bow speed", stringCoupling: "String coupling",
};
export const ENGINE_GROUPS: Record<Exclude<Engine, "fm">, readonly { title: string; keys: readonly EngineParam[] }[]> = {
  subtractive: [{ title: "SYNC / PULSE", keys: ["syncAmount", "pulseWidth2"] }, { title: "PHASE / SUB / NOISE", keys: ["osc1Phase", "osc2Phase", "oscPhaseReset", "subWave", "subOctave", "noiseColor"] }],
  wavetable: [{ title: "WARP / SPECTRUM", keys: ["wtWarpMode", "wtSpread", "wtMorphSkew", "wtBlur"] }, { title: "PHASE", keys: ["wtPhase", "wtPhaseReset", "wtRandomPhase"] }],
  additive: [{ title: "HARMONIC BANDS", keys: ["addBand1", "addBand2", "addBand3", "addBand4", "addBand5", "addBand6", "addBand7", "addBand8"] }, { title: "PARTIAL CHARACTER", keys: ["addSpectralDecay", "addPartialDetune", "addPartialDrift", "addBlur", "addRandomPhase"] }],
  ring: [{ title: "MODULATOR / SIDEBANDS", keys: ["ringModMode", "ringModHz", "ringModPhase", "ringPhaseReset", "ringBiasMode", "ringSidebandTilt", "ringSidebandCutoff"] }, { title: "PITCH ENVELOPE", keys: ["ringPitchDepth", "ringPitchAttack", "ringPitchDecay", "ringPitchSustain", "ringPitchRelease"] }, { title: "MODULATION ENVELOPE", keys: ["ringEnvEnabled", "ringEnvAttack", "ringEnvDecay", "ringEnvSustain", "ringEnvRelease"] }],
  granular: [{ title: "GRAIN WINDOW", keys: ["grainWindowShape", "grainAttack", "grainRelease"] }, { title: "PITCH / CLOCK", keys: ["grainQuantize", "grainScaleRoot", "grainSync", "grainSyncDivision"] }, { title: "CLOUD / STEREO", keys: ["grainFreeze", "grainStereoMotion", "grainMotionRate", "grainDrift"] }],
  sampler: [{ title: "PLAYBACK / SLICES", keys: ["samplePlayback", "sampleSlices", "sampleSlice", "sampleVelocityStart"] }, { title: "LOOP / STRETCH", keys: ["sampleLoopCrossfade", "samplePingPong", "sampleStretchMode", "sampleStretch"] }],
  physical: [{ title: "PICK / STRING", keys: ["pickHardness", "pickupPosition", "excitationDuration", "stringStiffness", "stringCoupling"] }, { title: "BODY / BOW", keys: ["bodyFrequency", "bodyQ", "bowMode", "bowPressure", "bowSpeed"] }],
};
const owner = (key: EngineParam): Exclude<Engine, "fm"> => Object.entries(ENGINE_GROUPS).find(([, groups]) => groups.some((g) => (g.keys as readonly string[]).includes(key)))![0] as Exclude<Engine, "fm">;
export const engineOwner = owner;
export const ENGINE_TRIGGER = new Set<EngineParam>(["subWave", "subOctave", "osc1Phase", "osc2Phase", "oscPhaseReset", "wtWarpMode", "wtPhase", "wtPhaseReset", "wtRandomPhase", "addRandomPhase", "ringModMode", "ringModPhase", "ringPhaseReset", "ringBiasMode", "ringPitchAttack", "ringPitchDecay", "ringPitchSustain", "ringPitchRelease", "ringEnvEnabled", "ringEnvAttack", "ringEnvDecay", "ringEnvSustain", "ringEnvRelease", "samplePlayback", "sampleSlices", "sampleSlice", "sampleVelocityStart", "sampleStretchMode", "samplePingPong", "bowMode"]);
export const ENGINE_TARGETS = Object.fromEntries(ENGINE_KEYS.map((key) => [key, { label: `${owner(key)} · ${ENGINE_LABELS[key]}`, group: owner(key) === "granular" ? "Granular · per grain" : `${owner(key)} · character`, trigger: ENGINE_TRIGGER.has(key) }])) as Record<EngineParam, { label: string; group: string; trigger: boolean }>;
export function enginePatchEdits(values: Partial<Patch>): Partial<Patch> {
  const result = { ...values };
  for (const key of ENGINE_DISCRETE) if (result[key] !== undefined) result[key] = Math.round(result[key]!);
  if (values.engine || ENGINE_KEYS.some((key) => key in values)) result.engineVersion = 2;
  if (values.engine) { result.ringBiasMode = 1; result.bowMode = 1; }
  if (values.ringBias !== undefined && values.ringBiasMode === undefined) result.ringBiasMode = 1;
  if (values.samplePlayback !== undefined && values.samplePlayback !== 0) result.sampleLoop = values.samplePlayback === 3;
  return result;
}
export function needsEngineWorklet(p: Patch) {
  if (p.engine === "fm" || p.engine === "granular") return false;
  return p.engineVersion === 2 || p.engine === "physical" && p.excitation === "bow" && p.bowMode >= .5 || ENGINE_KEYS.some((key) => owner(key) === p.engine && !["ringBiasMode", "bowMode"].includes(key) && p[key] !== (key === "pulseWidth2" ? p.pulseWidth : ENGINE_PARAMS[key][2])) || p.mods.some((m) => ENGINE_KEYS.includes(m.target as EngineParam) && owner(m.target as EngineParam) === p.engine && m.amount !== 0);
}
export const isSampleLoop = (p: Patch) => p.samplePlayback === 3 || p.samplePlayback === 0 && p.sampleLoop;
export function sampleRegion(p: Patch, seconds: number, velocity: number) {
  const trimStart = Math.min(p.sampleStart, p.sampleEnd - .01) * seconds, trimEnd = Math.max(p.sampleEnd, p.sampleStart + .01) * seconds;
  const count = Math.max(1, Math.round(p.sampleSlices)), slice = Math.max(0, Math.min(count - 1, Math.round(p.sampleSlice)));
  const start = trimStart + (trimEnd - trimStart) * slice / count, end = trimStart + (trimEnd - trimStart) * (slice + 1) / count;
  const shift = p.sampleVelocityStart >= 0 ? velocity * p.sampleVelocityStart : (1 - velocity) * -p.sampleVelocityStart;
  return { start: Math.min(end - 1e-5, start + (end - start) * shift * .95), end };
}
