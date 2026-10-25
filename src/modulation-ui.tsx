import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Param, Patch, FxSlot } from "./model";
import { fxValues, FX_SLOT_MODES } from "./fx-spec";
import { DYNAMIC_META } from "./parameter-spec";
import { setParameters } from "./parameters";
import { ModulationDisplayStore } from "./modulation-display";
import type { ModulationReadings, ControlModulation, ModulationPoint } from "./modulation-display";
import { parameterPosition } from "./parameter-scale";
import type { ControlScale } from "./parameter-scale";
const Context=createContext<{store:ModulationDisplayStore;patch:Patch}|null>(null);
const NO_LOCKS:Partial<Record<Param,number>>={};
const noSubscribe=()=>()=>{};
const noFx=()=>undefined;

export function ModulationProvider({patch,locks=NO_LOCKS,track,read,release,children}:{
  patch:Patch;locks?:Partial<Record<Param,number>>;track:number;
  read:()=>ModulationReadings|undefined;release:()=>void;children:ReactNode;
}){
  const effective=useMemo(()=>setParameters(patch,locks),[patch,locks]);
  const store=useMemo(()=>new ModulationDisplayStore(effective),[track]);
  const readRef=useRef(read),releaseRef=useRef(release);readRef.current=read;releaseRef.current=release;
  const value=useMemo(()=>({store,patch:effective}),[store,effective]);
  useLayoutEffect(()=>store.setPatch(effective),[store,effective]);
  useEffect(()=>{
    let frame=0,last=0,observing=false;
    const stop=releaseRef.current;
    const suspend=()=>{if(observing){stop();store.clear();observing=false;}};
    const visibility=()=>{if(document.hidden)suspend();};
    const tick=(at:number)=>{
      if(document.hidden||!store.observed)suspend();
      else if(at-last>=1000/30){last=at-(at-last)%(1000/30);store.update(readRef.current());observing=true;}
      frame=requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange",visibility);frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener("visibilitychange",visibility);suspend();};
  },[store]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Override only the range preview for a selected parameter-lock edit. Live
 * points keep their own voice/FX bases and are never moved to the selected step. */
export function ModulationPatchScope({patch,locks,children}:{patch:Patch;locks:Partial<Record<Param,number>>;children:ReactNode}){
  const context=useContext(Context),effective=useMemo(()=>setParameters(patch,locks),[patch,locks]);
  const value=useMemo(()=>context?{store:context.store,patch:effective}:null,[context,effective]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
const visibilityListeners=new Map<Element,(visible:boolean)=>void>();
let visibilityObserver:IntersectionObserver|undefined;
function observeOverlay(element:Element,listener:(visible:boolean)=>void){
  if(typeof IntersectionObserver==="undefined")return()=>{};
  visibilityObserver??=new IntersectionObserver(entries=>{
    for(const entry of entries)visibilityListeners.get(entry.target)?.(entry.isIntersecting);
  });
  visibilityListeners.set(element,listener);visibilityObserver.observe(element);
  return()=>{
    visibilityObserver?.unobserve(element);visibilityListeners.delete(element);
    if(!visibilityListeners.size){visibilityObserver?.disconnect();visibilityObserver=undefined;}
  };
}
const ARC="M 11.494 52.506 A 29 29 0 1 1 52.506 52.506";
const POINTS=32;
const VOICE_COLORS=["#b5c49e","#9dc7c6","#d5b38e","#b1adda","#c9a9b9","#a5c2d7"];
function displayPoints(points:ModulationPoint[]){
  return points.length<=POINTS?points:Array.from({length:POINTS},(_,i)=>points[Math.floor(i*(points.length-1)/(POINTS-1))]);
}
function tooltip(state:ControlModulation,base:number,format:(v:number)=>string){
  const points=displayPoints(state.points).map(p=>`${p.label}: ${format(p.value)} (Basis ${format(p.base)})`);
  return `Basis: ${format(base)}\nTheoretischer Modulationsbereich: ${format(state.min)} … ${format(state.max)}\n${state.routes.join("\n")}\n${points.length?`DSP-/Audio-Werte${state.voices?` · ${state.voices} ${state.voices===1?"Stimme":"Stimmen"}`:""}${state.grains?` · ${state.grains} klingende Grains`:""}:\n${points.join("\n")}${state.points.length>32?`\nWeitere ${state.points.length-32} Werte; Live-Spanne umfasst alle Werte`:""}`:"Kein aktueller DSP-Wert · Bereichsvorschau"}`;
}
/** Only this SVG layer is painted at frame rate. Native/base controls and their
 * handlers remain React-controlled; the audio code never calls React setters. */
export function ModulationOverlay({id,base,scale,kind,format,baseTitle}:{
  id?:Param;base:number;scale:ControlScale;kind:"knob"|"slider";format:(v:number)=>string;baseTitle:string;
}){
  const context=useContext(Context),svg=useRef<SVGSVGElement>(null),badge=useRef<HTMLSpanElement>(null);
  const {min,max,log,power}=scale;
  useLayoutEffect(()=>{
    const root=svg.current;if(!root||!context||!id)return;
    const store=context.store,host=kind==="knob"?root.parentElement:root.parentElement?.querySelector("input");
    if(!host)return;
    const range=root.querySelector<SVGPathElement>(".modulation-range")!,band=root.querySelector<SVGPathElement>(".modulation-live-band")!;
    const dots=[...root.querySelectorAll<SVGElement>(".modulation-point")];
    const set=(node:Element,name:string,v:string)=>{if(node.getAttribute(name)!==v)node.setAttribute(name,v);};
    const position=(v:number)=>parameterPosition(v,{min,max,log,power});
    const arc=(node:SVGPathElement,low:number,high:number)=>{
      set(node,"stroke-dasharray",`${Math.max(0,high-low)*100} 100`);set(node,"stroke-dashoffset",String(-low*100));
    };
    const describe=()=>{const state=store.control(id,base,context.patch);host.title=state?.routed?`${baseTitle}\n${tooltip(state,base,format)}`:baseTitle;};
    const paint=()=>{
      const state=store.control(id,base,context.patch),active=!!state?.routed&&(state.max-state.min>1e-10||state.points.some(p=>Math.abs(p.value-base)>1e-10));
      root.classList.toggle("is-active",active);
      if(!active||!state){if(badge.current)badge.current.hidden=true;host.title=baseTitle;return;}
      const low=position(state.min),high=position(state.max);arc(range,low,high);
      const all=state.points,points=displayPoints(all);
      const positions=points.map(p=>position(p.value)),allPositions=all.map(p=>position(p.value));
      band.style.display=positions.length>1?"":"none";
      if(positions.length>1)arc(band,Math.min(...allPositions),Math.max(...allPositions));
      for(let i=0;i<dots.length;i++){
        const dot=dots[i],p=points[i];dot.style.display=p?"":"none";if(!p)continue;
        const value=positions[i];
        if(kind==="knob"){
          const angle=(-135+value*270)*Math.PI/180;
          set(dot,"cx",String(32+29*Math.sin(angle)));set(dot,"cy",String(32-29*Math.cos(angle)));
          set(dot,"r",points.length>1?"1.7":"2.2");
        }else{set(dot,"x1",String(value*100));set(dot,"x2",String(value*100));}
        set(dot,"data-sampled",String(p.sampled));set(dot,"stroke",VOICE_COLORS[(p.voice??0)%VOICE_COLORS.length]);
      }
      if(badge.current){badge.current.hidden=state.voices<2&&!state.grains;badge.current.textContent=state.grains?`×${state.grains}G`:`×${state.voices}`;}
      if(host.matches(":hover")||document.activeElement===host)describe();
    };
    host.addEventListener("pointerenter",describe);host.addEventListener("focus",describe);
    paint();let unsubscribe=store.subscribe(paint);
    const unobserve=observeOverlay(root,visible=>{
      unsubscribe();unsubscribe=visible?store.subscribe(paint):()=>{};
      if(visible)paint();
    });
    return()=>{unobserve();unsubscribe();host.removeEventListener("pointerenter",describe);host.removeEventListener("focus",describe);};
  },[context,id,base,min,max,log,power,kind,format,baseTitle]);
  if(!id||!context)return null;
  return <>
    <svg ref={svg} className={`modulation-overlay ${kind==="knob"?"knob-ring knob-modulation":"slider-modulation"}`} viewBox={kind==="knob"?"0 0 64 64":"0 0 100 14"} preserveAspectRatio={kind==="knob"?"xMidYMid meet":"none"} aria-hidden="true">
      <path d={kind==="knob"?ARC:"M0 7H100"} className="modulation-range" pathLength="100"/>
      <path d={kind==="knob"?ARC:"M0 7H100"} className="modulation-live-band" pathLength="100"/>
      {Array.from({length:POINTS},(_,i)=>kind==="knob"?<circle key={i} className="modulation-point" r="2.2" style={{display:"none"}}/>:<line key={i} className="modulation-point" y1="3" y2="11" style={{display:"none"}}/>)}
    </svg>
    <span ref={badge} className={`modulation-poly-count ${kind}-poly-count`} hidden aria-hidden="true"/>
  </>;
}
export function useEffectiveFxValues(values:Record<string,number>,slot:FxSlot,mode:string){
  const context=useContext(Context);
  const reading=useSyncExternalStore(context?.store.subscribe??noSubscribe,context?.store.getFx??noFx,noFx)?.values;
  const live=Number.isFinite(reading?.[`fx.${slot}.sampleRate`]);
  const actualMode=live?(FX_SLOT_MODES[slot][Math.round(reading?.[`fx.${slot}.mode`]??-1)]??mode):mode;
  const result=context?{...values,...fxValues(context.patch,actualMode)}:{...values};
  if(live&&reading){
    for(const [key,base]of Object.entries(result)){
      const id=`fx.${slot}.${actualMode}.${key}`,meta=DYNAMIC_META[id as keyof typeof DYNAMIC_META];
      result[key]=reading[id]??reading[meta?.canonical??id]??base;
    }
    for(const key of ["phase","age","gate","bypass","tempo","sampleRate","previousMode","transition"])
      result[`__${key}`]=reading[`fx.${slot}.${key}`]??result[`__${key}`]??0;
  }
  return {mode:actualMode,values:result,live};
}
