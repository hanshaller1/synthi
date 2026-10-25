/** Musical durations in quarter-note beats, shared by LFOs and effect clocks. */
const straight = [1/16, 1/8, 1/4, 1/2, 1, 2, 4, 8, 16, 32];
const label = (beats: number) => beats >= 4 ? `${beats / 4} bar${beats > 4 ? "s" : ""}` : `1/${4 / beats}`;
export const SYNC_DIVISIONS = straight.flatMap((beats) => [
  { value: beats, label: label(beats) },
  ...(beats * 1.5 <= 32 ? [{ value: beats * 1.5, label: `${label(beats)} ·` }] : []),
  ...(beats * 2/3 >= 1/24 ? [{ value: beats * 2/3, label: `${label(beats)} T` }] : []),
]).sort((a,b)=>a.value-b.value);
export const LFO_SHAPES = ["sine", "triangle", "square", "sawtooth", "exp", "ramp", "random", "smooth"] as const;
export const LFO_MODES = ["free", "trig", "one", "half", "hold"] as const;
export const LFO_SYNC_DIVISIONS = SYNC_DIVISIONS.filter(d=>d.value<=16);
export const MOD_CURVES = ["linear", "exponential", "logarithmic"] as const;
export const MODULATION_PARAMS = {
  macro1: [0,1,0], macro2: [0,1,0], macro3: [0,1,0], macro4: [0,1,0],
  randomRate: [.02,30,1], randomSlew: [0,1,.5],
  modEnv1Attack: [0,8,.01], modEnv1Decay: [.001,16,.3], modEnv1Sustain: [0,1,.5], modEnv1Release: [.001,16,.5],
  modEnv1AttackCurve: [-100,100,0], modEnv1DecayCurve: [-100,100,0], modEnv1ReleaseCurve: [-100,100,0],
  modEnv2Attack: [0,8,.1], modEnv2Decay: [.001,16,.8], modEnv2Sustain: [0,1,.3], modEnv2Release: [.001,16,1],
  modEnv2AttackCurve: [-100,100,0], modEnv2DecayCurve: [-100,100,0], modEnv2ReleaseCurve: [-100,100,0],
} as const;
export const MOD_SOURCES = {
  lfo1: {label:"LFO 1",group:"LFO"}, lfo2: {label:"LFO 2",group:"LFO"}, lfo3: {label:"LFO 3",group:"LFO"},
  velocity: {label:"Velocity",group:"Expression"}, keytrack: {label:"Key tracking",group:"Expression"}, modwheel: {label:"Mod wheel",group:"Expression"},
  pressure: {label:"Aftertouch / Pressure",group:"Expression"}, pitchbend: {label:"Pitch bend",group:"Expression"},
  ampEnv: {label:"Amp envelope",group:"Envelopes"}, filterEnv: {label:"Filter envelope",group:"Envelopes"},
  modEnv1: {label:"Mod envelope 1",group:"Envelopes"}, modEnv2: {label:"Mod envelope 2",group:"Envelopes"},
  randomNote: {label:"Random per note",group:"Random"}, smoothRandom: {label:"Smooth random",group:"Random"},
  macro1: {label:"Macro 1",group:"Macros"}, macro2: {label:"Macro 2",group:"Macros"}, macro3: {label:"Macro 3",group:"Macros"}, macro4: {label:"Macro 4",group:"Macros"},
} as const;
export const LFO_FIELDS = {
  rate: {min:.02,max:30,default:.6,label:"Rate",log:true},
  division: {min:1/24,max:16,default:4,label:"Sync division",options:LFO_SYNC_DIVISIONS,event:true},
  depth: {min:-1,max:1,default:.35,label:"Depth"}, phase: {min:0,max:360,default:0,label:"Start phase"},
  delay: {min:0,max:8,default:0,label:"Delay"}, fade: {min:0,max:8,default:0,label:"Fade in"},
  fadeOut: {min:0,max:8,default:0,label:"Fade out"},
  skew: {min:-.95,max:.95,default:0,label:"Skew / symmetry"}, slew: {min:0,max:1,default:0,label:"Slew / smooth"},
  pulseWidth: {min:.01,max:.99,default:.5,label:"Pulse width"},
  polarity: {min:0,max:1,default:0,label:"Polarity",options:[{value:0,label:"Bipolar"},{value:1,label:"Unipolar"}],event:true},
  shape: {min:0,max:7,default:0,label:"Waveform",options:LFO_SHAPES.map((label,value)=>({label,value})),event:true},
  mode: {min:0,max:4,default:0,label:"Trigger mode",options:LFO_MODES.map((id,value)=>({label:id.toUpperCase(),value})),event:true},
  sync: {min:0,max:1,default:0,label:"Tempo sync",options:[{value:0,label:"Hz"},{value:1,label:"Sync"}],event:true},
} as const;
export type LfoField = keyof typeof LFO_FIELDS;
export type LfoParam = `lfo.${1|2|3}.${LfoField}`;
export type DynamicFxParam = `fx.${string}`;
export type DynamicParam = LfoParam | DynamicFxParam;

export const MODULATION_LABELS=Object.fromEntries(Object.keys(MODULATION_PARAMS).map(id=>[id,id.replace(/^macro(\d)$/,"Macro $1").replace(/^modEnv(\d)/,"Mod envelope $1 · ").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^random/,"Random ")]));
