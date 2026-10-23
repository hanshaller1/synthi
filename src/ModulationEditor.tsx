import type { ReactNode } from "react";
import { SlidersHorizontal, Waves, X } from "lucide-react";
import { EnvelopeGraph, IconButton, Knob, Select, formatHz, formatTime, percent } from "./components";
import { MOD_TARGETS } from "./model";
import type { MidiTarget, ModSource, ModTarget, Param, Patch } from "./model";
import { MOD_SOURCES, LFO_FIELDS, MOD_CURVES, SYNC_DIVISIONS } from "./modulation-spec";
import { getParameter, PARAMETER_REGISTRY, setParameters } from "./parameters";
import { lfoId, validModulationRoutes } from "./parameter-spec";
import { visibleFmTarget } from "./fm-config";
import { lfoSnapshot, lfoValue } from "./lfo";
import type { LfoField } from "./modulation-spec";
type Props={patch:Patch;locks:Partial<Record<Param,number>>;tempo:number;onPatch:(p:Partial<Patch>)=>void;onParam:(id:Param,v:number)=>void;onLearn:(id:MidiTarget)=>void;onCheckpoint:()=>void;};
export default function ModulationEditor({patch,locks,tempo,onPatch,onParam,onLearn,onCheckpoint}:Props){
  const p=setParameters(patch,locks);
  const control=(id:Param,label?:string):ReactNode=>{
    const m=PARAMETER_REGISTRY[id],value=getParameter(p,id),name=label??m.label;
    if(m.options)return <label className="mod-field" key={id}><span>{name}</span><Select label={name} value={value} onLearn={()=>onLearn(id)} onChange={v=>{onCheckpoint();onParam(id,+v);}}>{!m.options.some(o=>o.value===value)&&<option value={value}>{value} beats · Legacy</option>}{m.options.map(o=><option key={o.value} value={o.value}>{id.endsWith(".mode")&&p.modVersion===1&&p.lfos[+id.split(".")[1]-1]?.mode==="hold"&&o.value===4?"Legacy Hold · eingefroren":o.label}</option>)}</Select></label>;
    const format=/[Aa]ttack|[Dd]ecay|[Rr]elease|[Ff]ade|[Dd]elay/.test(id)&&!/Curve/.test(id)?formatTime:id.endsWith("rate")||id==="randomRate"?formatHz:id.endsWith("phase")?(v:number)=>`${Math.round(v)}°`:id.includes("Curve")?(v:number)=>`${v.toFixed(0)}`:percent;
    return <Knob key={id} locked={id in locks} parameterId={id} label={name} value={value} min={m.min} max={m.max} defaultValue={m.default} log={m.scale==="log"} format={format} onEdit={onCheckpoint} onLearn={()=>onLearn(id)} onChange={v=>onParam(id,v)} />;
  };
  const change=(i:number,key:string,value:string|number)=>{const mods=p.mods.map((r,j)=>j===i?{...r,[key]:value}:r);if(validModulationRoutes(mods).length===mods.length)onPatch({mods});};
  const valid=(i:number,key:"source"|"target",value:string)=>validModulationRoutes(p.mods.map((r,j)=>j===i?{...r,[key]:value}:r)).length===p.mods.length;
  return <div className="modulation-layout expanded-modulation">
    <div className="lfo-grid">{p.lfos.map((l,index)=>{
      const rate=l.sync?tempo/60/l.division:l.rate,span=(l.delay??0)+(l.fade??0)+2/Math.max(.02,rate);
      return <section key={index} className="module lfo-module"><div className="module-title"><h3><Waves size={14}/> LFO {index+1}</h3><span className="module-index">{l.sync?SYNC_DIVISIONS.find(d=>d.value===l.division)?.label??`${l.division} beats`:`${l.rate.toFixed(2)} Hz`}</span></div>
        <svg className="waveform lfo-waveform" viewBox="0 0 240 70" role="img" aria-label={`LFO ${index+1}: Phase, Skew, Polarität und zeitlicher Verlauf`}><path d={Array.from({length:241},(_,i)=>`${i?"L":"M"}${i},${35-(p.modVersion===1&&l.mode==="hold"?lfoValue(l.shape,0,index+1):lfoSnapshot(l,tempo,0,i/240*span,index))*l.depth*27}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="0" x2="240" y1="35" y2="35" stroke="currentColor" opacity=".2"/></svg>
        <div className="mod-select-grid">{(["shape","mode","sync","polarity",...(l.mode==="hold"?["retrigger"]:[])] as LfoField[]).map(key=>control(lfoId(index,key),LFO_FIELDS[key].label))}</div>
        <div className="mod-knob-grid">{([l.sync?"division":"rate","depth","phase","delay","fade","skew","slew","pulseWidth"] as LfoField[]).map(key=>control(lfoId(index,key),LFO_FIELDS[key].label))}</div>
      </section>;
    })}</div>
    <div className="mod-source-grid">{[1,2].map(index=>{
      const prefix=`modEnv${index}`,v=(suffix:string)=>getParameter(p,prefix+suffix);
      return <section className="module mod-envelope" key={prefix}><div className="module-title"><h3>Mod envelope {index}</h3><span className="module-index">ADSR</span></div><EnvelopeGraph kind="amp" env={{attack:v("Attack"),decay:v("Decay"),sustain:v("Sustain"),release:v("Release")}} curves={{attack:v("AttackCurve"),decay:v("DecayCurve"),release:v("ReleaseCurve")}}/>
        <div className="engine-adsr-controls">{["Attack","Decay","Sustain","Release"].map(suffix=>control((prefix+suffix) as Param,suffix))}</div><div className="mod-curve-grid">{["AttackCurve","DecayCurve","ReleaseCurve"].map(suffix=>control((prefix+suffix) as Param,suffix.replace("Curve"," curve")))}</div></section>;
    })}<section className="module macro-module"><div className="module-title"><h3>Macros / Random</h3><span className="module-index">TRACK</span></div><div className="mod-knob-grid">{["macro1","macro2","macro3","macro4","randomRate","randomSlew"].map(id=>control(id as Param,id.replace(/macro(\d)/,"Macro $1").replace("randomRate","Random rate").replace("randomSlew","Random slew")))}</div></section></div>
    <section className="module matrix-module"><div className="module-title"><h3><SlidersHorizontal size={14}/> Modulation matrix</h3><span className="module-index">{p.mods.length} / 24 ROUTES</span></div>
      <p className="mod-scope-hint">Stimmenparameter folgen ihrer eigenen Note. Track-FX folgen der zuletzt gehaltenen Note, danach ihrem Release; die LFOs laufen durch den Effekt-Ausklang weiter. „Anschlag“ schaltet beim nächsten Note-On/Step. Neue Stimmen-Ziele greifen ab der nächsten Note. Rückkopplungen zwischen Modulationsgeneratoren sind gesperrt.</p>
      <div className="matrix-heading"><span>SOURCE</span><span/><span>DESTINATION</span><span>CURVE</span><span>AMOUNT</span><span/></div>
      {p.mods.map((r,i)=><div key={i} className="matrix-row">
        <Select label={`Route ${i+1} source`} value={r.source} onChange={v=>change(i,"source",v)}>{[...new Set(Object.values(MOD_SOURCES).map(s=>s.group))].map(group=><optgroup key={group} label={group}>{Object.entries(MOD_SOURCES).filter(([,s])=>s.group===group).map(([id,s])=><option key={id} value={id} disabled={!valid(i,"source",id)}>{s.label}</option>)}</optgroup>)}</Select><span className="route-arrow">→</span>
        <Select label={`Route ${i+1} target`} value={r.target} onChange={v=>change(i,"target",v)}>{[...new Set(Object.values(MOD_TARGETS).map(t=>t.group))].map(group=><optgroup key={group} label={group}>{Object.entries(MOD_TARGETS).filter(([id,m])=>m.group===group&&visibleFmTarget(id)).map(([id,m])=><option key={id} value={id} disabled={!valid(i,"target",id)}>{m.label}{m.trigger?" · Anschlag":""}</option>)}</optgroup>)}</Select>
        <Select label={`Route ${i+1} curve`} value={r.curve??"linear"} onChange={v=>change(i,"curve",v)}>{MOD_CURVES.map(curve=><option key={curve} value={curve}>{curve}</option>)}</Select>
        <label className="mod-amount"><input type="range" min="-1" max="1" step=".01" aria-label={`Route ${i+1} amount`} value={r.amount} onPointerDown={onCheckpoint} onChange={e=>change(i,"amount",+e.target.value)}/><output>{r.amount>0?"+":""}{Math.round(r.amount*100)}%</output></label>
        <IconButton label={`Route ${i+1} löschen`} onClick={()=>onPatch({mods:p.mods.filter((_,j)=>i!==j)})}><X size={13}/></IconButton>
      </div>)}
      {p.mods.length<24&&<button className="add-route" onClick={()=>{onCheckpoint();onPatch({mods:[...p.mods,{source:"lfo1" as ModSource,target:"cutoff" as ModTarget,amount:0,curve:"linear"}]});}}>+ Modulation route</button>}
    </section>
  </div>;
}
