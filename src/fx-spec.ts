import { SYNC_DIVISIONS } from "./modulation-spec";
import type { Param, Patch } from "./model";
export type FxControl = {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  param?: Param;
  unit?: "hz" | "time" | "percent" | "cents" | "bits";
  log?: boolean;
  step?: number;
  options?: readonly { value: number; label: string }[];
  event?: boolean;
};
const control = (
  key: string,
  label: string,
  min: number,
  max: number,
  fallback: number,
  unit?: FxControl["unit"],
  param?: Param,
  log = false,
): FxControl => ({ key, label, min, max, default: fallback, unit, param, log });
const drive = () =>
  control("drive", "Drive", 0, 1, 0.05, "percent", "distortion");
const wet = (param: Param) =>
  control("mix", "Mix", 0, 1, 0.2, "percent", param);
const tone = () =>
  control("tone", "Tone", 200, 20000, 12000, "hz", undefined, true);
const time = () =>
  control("time", "Time", 0.04, 1.5, 0.375, "time", "delayTime", true);
const feedback = () =>
  control("feedback", "Feedback", 0, 0.85, 0.32, "percent", "feedback");
const size = () =>
  control("decay", "Decay", 0.2, 5, 2.6, "time", "reverbSize", true);
const rate = () =>
  control("rate", "Rate", 0.02, 12, 0.65, "hz", undefined, true);
const depth = () => control("depth", "Depth", 0, 1, 0.5, "percent");
const width = () => control("width", "Width", 0, 1, 1, "percent");
const predelay = () => control("predelay", "Pre-delay", 0, 0.1, 0.02, "time");
const damping = () =>
  control("damping", "Damping", 500, 18000, 9000, "hz", undefined, true);
const satMix = () => control("mix", "Mix", 0, 1, 1, "percent");
export const FX_CONTROLS: Record<string, FxControl[]> = {
  soft: [
    drive(),
    control("warmth", "Warmth", 0, 1, 0.3, "percent"),
    tone(),
    satMix(),
  ],
  hard: [
    drive(),
    control("threshold", "Threshold", 0.1, 1, 0.7, "percent"),
    tone(),
    satMix(),
  ],
  fold: [
    drive(),
    control("folds", "Folds", 1, 8, 2),
    control("bias", "Bias", -1, 1, 0),
    satMix(),
  ],
  crush: [
    control("bits", "Bit depth", 3, 16, 8, "bits"),
    drive(),
    tone(),
    satMix(),
  ],
  diode: [
    drive(),
    control("bias", "Bias", -0.5, 0.5, 0.1),
    control("asymmetry", "Asymmetry", 0, 1, 0.6, "percent"),
    tone(),
    satMix(),
  ],
  chorus: [wet("chorus"), rate(), depth(), width()],
  flanger: [
    wet("chorus"),
    rate(),
    depth(),
    control("regen", "Feedback", -0.85, 0.85, 0.45, "percent"),
  ],
  vibrato: [
    wet("chorus"),
    rate(),
    control("cents", "Pitch depth", 0, 100, 25, "cents"),
  ],
  phaser: [
    wet("chorus"),
    rate(),
    control("frequency", "Center", 100, 3000, 700, "hz", undefined, true),
    control("resonance", "Resonance", 0.1, 4, 0.7),
  ],
  tremolo: [
    wet("chorus"),
    rate(),
    depth(),
    { ...control("shape", "Sine / Pulse", 0, 1, 0, "percent"), step: 1 },
  ],
  digital: [time(), feedback(), wet("delay"), tone()],
  tape: [
    time(),
    feedback(),
    wet("delay"),
    control("age", "Tape age", 0, 1, 0.4, "percent"),
    control("wow", "Wow / flutter", 0, 1, 0.2, "percent"),
  ],
  pingpong: [time(), feedback(), wet("delay"), width()],
  multitap: [
    time(),
    feedback(),
    wet("delay"),
    control("spacing", "Tap spacing", 0.15, 0.8, 0.333),
    width(),
  ],
  dub: [
    time(),
    feedback(),
    wet("delay"),
    control("frequency", "Dub filter", 200, 4000, 1100, "hz", undefined, true),
    control("resonance", "Resonance", 0.2, 3, 1.4),
  ],
  room: [
    size(),
    wet("reverb"),
    control("early", "Reflections", 0, 1, 0.5, "percent"),
    damping(),
  ],
  hall: [size(), wet("reverb"), predelay(), damping()],
  plate: [
    size(),
    wet("reverb"),
    control("brightness", "Brightness", 0, 1, 0.7, "percent"),
    predelay(),
  ],
  spring: [
    size(),
    wet("reverb"),
    control("tension", "Tension", 0.1, 1, 0.5, "percent"),
    damping(),
  ],
  gated: [
    size(),
    wet("reverb"),
    control("gate", "Gate length", 0.1, 1, 0.65, "percent"),
    predelay(),
  ],
};
/** Keys understood by the original native rack, used only for import migration. */
export const LEGACY_FX_KEYS=Object.fromEntries(Object.entries(FX_CONTROLS).map(([id,controls])=>[id,new Set(controls.map(c=>c.key))]));
export const FX_SLOT_MODES = {
  saturationMode: ["soft","hard","fold","crush","diode"],
  modulationMode: ["chorus","flanger","vibrato","phaser","tremolo"],
  delayMode: ["digital","tape","pingpong","multitap","dub"],
  reverbMode: ["room","hall","plate","spring","gated"],
} as const;
const select = (key: string,label: string,options: readonly {value:number;label:string}[],fallback: number): FxControl => ({key,label,min:Math.min(...options.map(o=>o.value)),max:Math.max(...options.map(o=>o.value)),default:fallback,options,event:true});
const toggle = (key:string,label:string,fallback=0) => select(key,label,[{value:0,label:"Off"},{value:1,label:"On"}],fallback);
const phase = () => control("stereoPhase","Stereo phase",0,360,0);
const clock = () => [toggle("sync","BPM sync"),select("division","Division",SYNC_DIVISIONS.filter(d=>d.value<=8),.5)];
for(const mode of FX_SLOT_MODES.saturationMode) FX_CONTROLS[mode].push(control("outputTrim","Output trim",-24,12,0,undefined,"saturationOutputTrim"));
FX_CONTROLS.soft.push(toggle("oversampling","2× oversampling",1));
FX_CONTROLS.hard.push(control("symmetry","Symmetry",-1,1,0));
FX_CONTROLS.fold.push(control("postFilter","Post filter",200,20000,20000,"hz",undefined,true));
FX_CONTROLS.crush.push(control("sampleRate","Sample rate",500,48000,48000,"hz",undefined,true),control("jitter","Jitter",0,1,0,"percent"));
FX_CONTROLS.diode.find(c=>c.key==="tone")!.label="Post tone";
FX_CONTROLS.diode.push(control("preTone","Pre tone",200,20000,20000,"hz",undefined,true));
FX_CONTROLS.chorus.push(select("voices","Voices",[2,3,4,5,6].map(value=>({value,label:String(value)})),2),control("baseDelay","Base delay",.003,.05,.02,"time",undefined,true),{...phase(),default:180});
FX_CONTROLS.flanger.push(control("manual","Manual delay",.0003,.012,.004,"time",undefined,true),select("polarity","Feedback polarity",[{value:1,label:"Positive"},{value:-1,label:"Negative"}],1),phase());
FX_CONTROLS.vibrato.push(control("phase","Start phase",0,360,0),control("fade","Fade in",0,8,0,"time"),...clock());
FX_CONTROLS.phaser.push(depth(),control("feedback","Feedback",-.85,.85,0,"percent"),select("stages","Stages",[2,4,6,8].map(value=>({value,label:String(value)})),4));
FX_CONTROLS.tremolo.find(c=>c.key==="shape")!.options=[{value:0,label:"Sine"},{value:1,label:"Square"},{value:2,label:"Triangle"},{value:3,label:"Saw"}];
FX_CONTROLS.tremolo.find(c=>c.key==="shape")!.max=3;
FX_CONTROLS.tremolo.find(c=>c.key==="shape")!.event=true;
FX_CONTROLS.tremolo.push(phase(),...clock());
for(const mode of FX_SLOT_MODES.delayMode) FX_CONTROLS[mode].push(...clock());
FX_CONTROLS.digital.push(control("highpass","High pass",20,3000,20,"hz",undefined,true),control("ducking","Ducking",0,1,0,"percent"),control("stereoOffset","Stereo offset",-.05,.05,0,"time"));
FX_CONTROLS.tape.find(c=>c.key==="wow")!.label="Wow";
FX_CONTROLS.tape.push(control("flutter","Flutter",0,1,0,"percent"),control("saturation","Saturation",0,1,0,"percent"));
FX_CONTROLS.pingpong.push(select("rightDivision","Right division",[{value:0,label:"Follow left"},...SYNC_DIVISIONS.filter(d=>d.value<=8)],0),control("rightTime","Right time · 0 Auto",0,1.5,0,"time"),control("crossFeedback","Cross feedback",0,1,1,"percent"));
for(let i=1;i<=3;i++)FX_CONTROLS.multitap.push(control(`tap${i}Level`,`Tap ${i} level`,0,1,i===1?1:.5,"percent"),control(`tap${i}Pan`,`Tap ${i} pan`,-1,1,i===1?0:i===2?-.7:.7));
FX_CONTROLS.dub.push(control("ducking","Ducking",0,1,0,"percent"),control("modDepth","Modulation depth",0,1,0,"percent"),control("feedbackSaturation","Feedback saturation",0,1,0,"percent"));
for(const mode of FX_SLOT_MODES.reverbMode)FX_CONTROLS[mode].push(control("lowCut","Low cut",20,2000,20,"hz","reverbLowCut",true),control("highCut","High cut",500,20000,20000,"hz","reverbHighCut",true),control("width","Width",0,1,1,"percent","reverbWidth"));
FX_CONTROLS.room.push(predelay());
FX_CONTROLS.hall.push(control("earlyLate","Early / late",0,1,.5,"percent"));
FX_CONTROLS.plate.push(control("diffusion","Diffusion",0,1,.7,"percent"));
FX_CONTROLS.spring.push(control("drive","Spring drive",0,1,0,"percent"),select("springCount","Spring count",[1,2,3,4].map(value=>({value,label:String(value)})),2));
FX_CONTROLS.gated.push(control("threshold","Threshold",-60,0,-36),control("hold","Hold",.01,2,.2,"time"),control("release","Release",.01,2,.1,"time"));

export type FxSettings = Record<string, Record<string, number>>;
export function defaultFxSettings(): FxSettings {
  return Object.fromEntries(
    Object.entries(FX_CONTROLS).map(([id, controls]) => [
      id,
      Object.fromEntries(
        controls.filter((c) => !c.param).map((c) => [c.key, c.default]),
      ),
    ]),
  );
}
export function fxValues(patch: Patch, id: string) {
  return Object.fromEntries(
    FX_CONTROLS[id].map((c) => [
      c.key,
      c.param ? (patch[c.param] ?? c.default) : (patch.fxSettings[id]?.[c.key] ?? c.default),
    ]),
  );
}
/** Canonical common parameters are discovered from the controls, never maintained twice. */
export const FX_PARAMETERS=new Set(Object.values(FX_CONTROLS).flatMap(controls=>controls.flatMap(c=>c.param?[c.param]:[])));
export const FX_PARAMETER_META=Object.fromEntries(Object.entries(FX_SLOT_MODES).flatMap(([slot,modes])=>modes.flatMap(mode=>FX_CONTROLS[mode].filter(c=>c.param).map(c=>[c.param!,{label:`${slot.replace("Mode","")} · ${c.label}`,group:"Track FX",log:!!c.log}]))));
