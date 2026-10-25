import type { FxSlot, Patch } from "./model";
import { FX_CONTROLS, FX_SLOT_MODES } from "./fx-spec";
import { DYNAMIC_META } from "./parameter-spec";
import { PARAMETER_REGISTRY } from "./parameters";
import { Modulator } from "./modulation-worklet";
import { WorkletFxStage } from "./fx-worklet";
type Context=AudioContext|OfflineAudioContext;
export class WorkletRack {
  private stages:Record<FxSlot,WorkletFxStage>;private order:FxSlot[]=[];
  private reporting=false;
  private mod?:Modulator;private sink:GainNode;private previous?:Patch;private tempo=118;private retry?:number;
  constructor(private context:Context,private input:AudioNode,private output:AudioNode,private clock?:Modulator){
    this.stages=Object.fromEntries(Object.keys(FX_SLOT_MODES).map(slot=>[slot,new WorkletFxStage(context,slot as FxSlot)])) as Record<FxSlot,WorkletFxStage>;
    this.sink=context.createGain();this.sink.gain.value=0;this.sink.connect(output);
  }
  setReporting(enabled:boolean){this.reporting=enabled;this.mod?.setReporting(enabled);for(const stage of Object.values(this.stages))stage.setReporting(enabled);}
  private ids(p:Patch){return [...new Set(p.mods.filter(r=>PARAMETER_REGISTRY[r.target as keyof typeof PARAMETER_REGISTRY]?.scope==="fx").map(r=>DYNAMIC_META[r.target as keyof typeof DYNAMIC_META]?.canonical??r.target))];}
  update(p:Patch,at:number,tempo=this.tempo,step=false){
    this.tempo=tempo;
    if(this.order.join()!==p.fxOrder.join()){
      if(this.order.length)this.input.disconnect(this.stages[this.order[0]].input);
      for(const stage of Object.values(this.stages))stage.output.disconnect();this.order=[...p.fxOrder];
      this.input.connect(this.stages[this.order[0]].input);this.order.forEach((slot,i)=>this.stages[slot].output.connect(i===3?this.output:this.stages[this.order[i+1]].input));
    }
    for(const stage of Object.values(this.stages))stage.update(p,at,tempo);
    const ids=this.ids(p);
    if(!this.mod){
      this.mod=new Modulator(this.context,p,ids,at,60,0,true,1,this.clock);this.mod.node.connect(this.sink,0);this.mod.setReporting(this.reporting);
      for(const id of ids)for(const stage of Object.values(this.stages))for(const destination of stage.parameters(id))this.mod.connect(id,destination);
    }else{
      const added=this.mod.extend(ids);
      if(added)for(const id of added)for(const stage of Object.values(this.stages))for(const destination of stage.parameters(id))this.mod.connect(id,destination);
      else if(this.context instanceof AudioContext&&this.retry===undefined)this.retry=window.setTimeout(()=>{this.retry=undefined;if(this.previous)this.update(this.previous,this.context.currentTime);},60);
      this.mod.update(p,at,step);
    }
    this.mod.expression("tempo",tempo,at);this.previous=p;
  }
  note(id:number,note:number,velocity:number,p:Patch,at:number,seed?:number){this.update(p,at,this.tempo,true);this.mod?.note(id,note,velocity,at,seed);}
  release(id:number,at:number){this.mod?.release(at,id);}
  retune(id:number,note:number,at:number){this.mod?.retune(note,at,id);}
  triggerLfo(at:number,seed?:number){this.mod?.triggerLfo(at,seed);}
  pressure(value:number,at:number,note?:number){this.mod?.pressure(value,at,note);}
  expression(key:"tempo"|"wheel"|"pressure"|"bend",value:number,at:number){if(key==="tempo"&&this.previous)this.update(this.previous,at,value);this.mod?.expression(key,value,at);}
  panic(at:number,base?:Patch){this.mod?.panic(at);for(const stage of Object.values(this.stages))stage.cancel(at);if(base)this.update(base,at,this.tempo,true);}
  get reading(){
    const reading=this.mod?.reading;if(!reading)return undefined;
    const values={...reading.values},variants={...reading.variants},confirmed:string[]=[];let time=reading.time;
    for(const [slot,stage] of Object.entries(this.stages)){
      const actual=stage.reading;if(!actual||this.context.currentTime-actual.time>.3)continue;variants[slot]=actual.mode;time=Math.max(time,actual.time);
      for(const c of FX_CONTROLS[actual.mode]){const value=actual.values[c.key];values[`fx.${slot}.${actual.mode}.${c.key}`]=value;confirmed.push(`fx.${slot}.${actual.mode}.${c.key}`);if(c.param){values[c.param]=value;confirmed.push(c.param);}}
      confirmed.push(`fx.${slot}.mode`,`fx.${slot}.bypass`);
      values[`fx.${slot}.mode`]=(FX_SLOT_MODES[slot as FxSlot] as readonly string[]).indexOf(actual.mode);
      values[`fx.${slot}.previousMode`]=actual.previousMode?(FX_SLOT_MODES[slot as FxSlot] as readonly string[]).indexOf(actual.previousMode):-1;
      values[`fx.${slot}.transition`]=actual.transition;
      for(const key of ["phase","age","gate","bypass","tempo","sampleRate"] as const)values[`fx.${slot}.${key}`]=actual[key];
    }
    return {...reading,values,variants,time,confirmed};
  }
  dispose(){if(this.retry!==undefined)window.clearTimeout(this.retry);this.mod?.dispose();this.sink.disconnect();if(this.order.length)this.input.disconnect(this.stages[this.order[0]].input);for(const stage of Object.values(this.stages))stage.dispose();}
}
