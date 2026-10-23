import { getParameter, PARAMETER_REGISTRY, setParameters } from "./parameters";
import { useEffectiveFxValues } from "./modulation-ui";
import { ArrowLeft, ArrowRight, Power, Sparkles } from "lucide-react";
import { Knob, Select, formatHz, formatTime, percent } from "./components";
import { FX_OPTIONS } from "./model";
import type { FxSlot, Param, Patch } from "./model";
import { FX_CONTROLS, fxValues } from "./fx-spec";
import type { FxControl } from "./fx-spec";
import { transfer } from "./effects";
/** Preview of the effective controls; nonlinear/transient audio is not a spectrum analyser. */
export function EffectVisual({mode,values:v}:{mode:string;values:Record<string,number>}) {
  const line=(fn:(x:number)=>number)=>Array.from({length:181},(_,i)=>`${i?"L":"M"}${i*240/180},${45-Math.max(-1.2,Math.min(1.2,fn(i/180)))*30}`).join(" ");
  const sr=v.__sampleRate||48000,phase=v.__phase??0,tempo=v.__tempo||118,rate=v.sync>=.5?tempo/60/v.division:v.rate;
  const wave=(p:number)=>{const x=((p%1)+1)%1;return v.shape===1?(x<.5?1:-1):v.shape===2?1-4*Math.abs(x-.5):v.shape===3?1-2*x:Math.sin(x*Math.PI*2);};
  let art;
  if(["soft","hard","fold","crush","diode"].includes(mode))art=<><path className="fx-reference" d="M0 75L240 15"/><path d={line(x=>transfer(x*2-1,mode,v)*10**((v.outputTrim??0)/20))}/></>;
  else if(mode==="chorus")art=Array.from({length:Math.round(v.voices)},(_,i)=><path key={i} opacity={1-i*.1} d={line(x=>(v.baseDelay/.05-.5)+Math.sin((phase+x+i/v.voices)*Math.PI*2)*v.depth*.4+i/v.voices*.25)}/>);
  else if(mode==="flanger"){
    const delay=v.manual+Math.sin(phase*Math.PI*2)*Math.min(.003,v.manual*.8)*v.depth,g=v.regen*v.polarity;
    art=<path d={line(x=>{const w=2*Math.PI*(30*600**x)*delay,c=Math.cos(w),s=Math.sin(w);return Math.sqrt((1+2*c+1)/(1-2*g*c+g*g+s*s*.0001))*.3-.5;})}/>;
  }else if(mode==="phaser"){
    art=<path d={line(x=>{const hz=30*600**x,w=2*Math.PI*hz/sr;let ar=1,ai=0;
      for(let j=0;j<Math.round(v.stages);j++){
        const f=Math.min(sr*.4,v.frequency*(j+1)*2**(Math.sin(phase*Math.PI*2)*v.depth)),angle=2*Math.PI*f/sr,alpha=Math.sin(angle)/(2*v.resonance),b0=(1-alpha)/(1+alpha),b1=-2*Math.cos(angle)/(1+alpha),c=Math.cos(w),q=Math.sin(w),c2=Math.cos(w*2),q2=Math.sin(w*2),nr=b0+b1*c+c2,ni=-b1*q-q2,dr=1+b1*c+b0*c2,di=-b1*q-b0*q2,den=dr*dr+di*di,hr=(nr*dr+ni*di)/den,hi=(ni*dr-nr*di)/den;
        [ar,ai]=[ar*hr-ai*hi,ar*hi+ai*hr];
      }
      const den=(1-v.feedback*ar)**2+(v.feedback*ai)**2;
      const hr=(ar-v.feedback*(ar*ar+ai*ai))/den,hi=ai/den;
      return Math.hypot(1+hr,hi)*.5-.5;
    })}/>;
  }else if(mode==="vibrato")art=<><path className="fx-reference" d="M0 45H240"/><path d={line(x=>Math.sin((phase+x+(v.phase??0)/360)*Math.PI*2)*v.cents/100*(v.fade>0?Math.min(1,(v.__age??0)/v.fade):1))}/></>;
  else if(mode==="tremolo")art=[0,1].map(ch=><path key={ch} opacity={ch?.45:1} d={line(x=>1-v.depth*.5+wave(phase+x+(v.stereoPhase??0)/360*ch)*v.depth*.5)}/>);
  else if(["digital","tape","pingpong","multitap","dub"].includes(mode)){
    const seconds=v.sync>=.5?tempo/60*v.division:v.time,right=mode==="pingpong"?(v.sync>=.5?(v.rightDivision>0?tempo/60*v.rightDivision:seconds):(v.rightTime>0?v.rightTime:seconds)):seconds+(v.stereoOffset??0),span=Math.max(seconds,right)*5;
    art=<>{Array.from({length:mode==="multitap"?3:8},(_,i)=>{
      const tap=mode==="multitap",t=tap?(i===0?seconds:seconds*v.spacing*i):Math.ceil((i+1)/2)*(i%2?right:seconds),level=tap?v[`tap${i+1}Level`]:v.feedback**Math.floor(i/2),pan=tap?v[`tap${i+1}Pan`]:i%2?1:-1,x=8+t/Math.max(.01,span)*224,y=76-level*56;
      return <path key={i} opacity={.45+(pan+1)*.2} d={`M${x} 77V${y}H${x+5}V77`}/>;
    })}<text x="8" y="12">{seconds.toFixed(3)} s · {v.feedback.toFixed(2)} feedback</text></>;
  }else {
    const decay=Math.max(.2,v.decay),pre=v.predelay??0,early=mode==="room"?v.early:mode==="hall"?1-v.earlyLate:.15,late=mode==="hall"?v.earlyLate:1,count=mode==="spring"?Math.round(v.springCount):1;
    art=<>{Array.from({length:count},(_,i)=><path key={i} opacity={1-i*.15} d={line(x=>{const t=x*(decay+pre),elapsed=Math.max(0,t-pre),envelope=t<pre?0:Math.exp(-6.9078*elapsed/decay),reflection=early*Math.exp(-40*elapsed)*Math.abs(Math.sin(elapsed*360));return (late*envelope*(.65+Math.sin(elapsed*(mode==="spring"?80+v.tension*80:240+i*31))*.2)+reflection)*(mode==="gated"?(v.__gate??1):1);})}/>)}<text x="8" y="86">{decay.toFixed(2)} s · width {Math.round(v.width*100)}%</text></>;
  }
  return <svg className={`fx-art fx-art-${mode}`} viewBox="0 0 240 90" role="img" aria-label={`${mode}: wirksame Einstellungen, schematische Vorschau`}><title>{mode} · wirksame Parameter{Number.isFinite(rate)?` · ${rate.toFixed(2)} Hz`:""}</title><path className="fx-grid" d="M0 15H240M0 45H240M0 75H240M60 0V90M120 0V90M180 0V90"/>{art}</svg>;
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
function CurrentEffectVisual({slot,mode,values}:{slot:FxSlot;mode:string;values:Record<string,number>}){
  const effective=useEffectiveFxValues(values,slot,mode);return <EffectVisual mode={effective.mode} values={effective.values}/>;
}
export default function FxRack({patch,onPatch,onParam,locks,onLearn,onCheckpoint}:{patch:Patch;onPatch:(p:Partial<Patch>)=>void;onParam:(p:Param,v:number)=>void;locks:Partial<Record<Param,number>>;tempo:number;onLearn:(p:Param)=>void;onCheckpoint:()=>void;}){
  const p=setParameters(patch,locks);
  const move=(index:number,offset:number)=>{onCheckpoint();const order=[...p.fxOrder];[order[index],order[index+offset]]=[order[index+offset],order[index]];onPatch({fxOrder:order});};
  return <div className="effects-grid serial-fx">{p.fxOrder.map((slot,index)=>{
    const mode=p[slot],values=fxValues(p,mode),enabled=p.fxEnabled[slot],prefix=`fx.${slot}.${mode}.`;
    return <section className={`module effect-module ${enabled?"":"fx-bypassed"}`} key={slot} data-slot={slot}>
      <div className="fx-slot-header"><span>0{index+1} <Sparkles size={12}/></span><button className={`fx-power ${enabled?"on":""}`} aria-label={`${titles[slot]} Bypass`} aria-pressed={enabled} title="Rechtsklick: MIDI Learn" onContextMenu={e=>{e.preventDefault();onLearn(`fx.${slot}.bypass`);}} onClick={()=>{onCheckpoint();onParam(`fx.${slot}.bypass`,Number(enabled));}}><Power size={13}/>{enabled?"ON":"BYPASS"}</button><button disabled={!index} onClick={()=>move(index,-1)} aria-label={`${titles[slot]} nach links`}><ArrowLeft size={14}/></button><button disabled={index===3} onClick={()=>move(index,1)} aria-label={`${titles[slot]} nach rechts`}><ArrowRight size={14}/></button></div>
      <div className="module-title"><h3>{titles[slot]}</h3><span className="module-index">SERIAL FX</span></div>
      <Select label={`${titles[slot]} Variante`} value={FX_OPTIONS[slot].findIndex(o=>o.id===mode)} onLearn={()=>onLearn(`fx.${slot}.mode`)} onChange={v=>{onCheckpoint();onParam(`fx.${slot}.mode`,+v);}}>{FX_OPTIONS[slot].map((o,i)=><option key={o.id} value={i}>{o.label}</option>)}</Select>
      <CurrentEffectVisual slot={slot} mode={mode} values={values}/>
      <div className="fx-controls">{FX_CONTROLS[mode].filter(c=>!["division","rightDivision"].includes(c.key)||values.sync>=.5).filter(c=>!(values.sync>=.5&&["rate","time","rightTime"].includes(c.key))).map(c=>{
        const id=(prefix+c.key) as Param,value=locks[id]??(c.param?locks[c.param]:undefined)??getParameter(p,id);
        const format=c.key==="stereoPhase"||c.key==="phase"?(v:number)=>`${Math.round(v)}°`:c.key==="outputTrim"||mode==="gated"&&c.key==="threshold"?(v:number)=>`${v.toFixed(1)} dB`:formatFx(c);
        return c.options?<label className="fx-choice" key={id}><span>{c.label}</span><Select label={`${mode} ${c.label}`} value={value} onLearn={()=>onLearn(id)} onChange={v=>{onCheckpoint();onParam(id,+v);}}>{c.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</Select></label>:<Knob key={id} parameterId={id} label={c.label} value={value} min={c.min} max={c.max} log={c.log} step={c.unit==="bits"?1:c.step} defaultValue={PARAMETER_REGISTRY[id].default} format={format} locked={id in locks||!!c.param&&c.param in locks} onEdit={onCheckpoint} onLearn={()=>onLearn(id)} onChange={v=>onParam(id,v)}/>;
      })}</div>
    </section>;
  })}</div>;
}
