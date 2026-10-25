import { controlFrame } from "./lfo-phase";

type Kernel = {
  [key:string]:any;
  step(frame:number,clock?:Float32Array):void;
  apply(event:any,now:number):void;
  snapshot():any;
  restore(state:any):void;
  canSkip():boolean;
};
export type ControlSnapshot={sources:Record<string,number>;phases:number[];origin:number};
export type ControlEvent={type:string;at:number;frame?:number;[key:string]:any};

/** Lazy CPU execution of the actual control DSP. Inserts invalidate predicted
 * future state; checkpoints and a bounded phase cache support grain lookahead. */
export class ControlTimeline {
  private kernel:Kernel;
  private events:ControlEvent[]=[];
  private cursor=0;
  private frame:number;
  private baseline?:{frame:number;state:any};
  private checkpoints:{frame:number;state:any}[]=[];
  private history=new Map<number,{values:Float32Array;valid:Uint8Array}>();
  private input=new Float32Array(7);
  private clockRevision=0;
  revision=0;
  private changes:{revision:number;frame:number}[]=[];
  private children=new Set<ControlTimeline>();
  private disposed=false;
  constructor(private make:()=>Kernel,readonly sampleRate:number,private birth:number,private clock?:ControlTimeline,private now?:()=>number){
    this.kernel=make();this.frame=birth-1;
    this.clockRevision=clock?.revision??0;clock?.children.add(this);
  }
  replaceInitial(make:()=>Kernel){this.make=make;this.invalidate(this.birth);}
  event(event:ControlEvent){
    const e={...event,frame:controlFrame(event.at,this.sampleRate)};
    this.events.push(e);this.events.sort((a,b)=>a.at-b.at);
    this.invalidate(e.frame);
    if(this.events.length>256)this.compact(true);
  }
  private invalidate(frame:number){
    if(this.baseline)frame=Math.max(frame,this.baseline.frame+1);
    this.revision++;this.changes.push({revision:this.revision,frame});
    if(this.changes.length>256)this.changes.shift();
    this.checkpoints=this.checkpoints.filter(c=>c.frame<frame);
    for(const block of this.history.keys())if((block+1)*128>frame)this.history.delete(block);
    if(this.frame>=frame)this.rewind(frame-1);
    else this.cursor=this.events.findIndex(e=>e.frame!>this.frame);
    if(this.cursor<0)this.cursor=this.events.length;
  }
  private rewind(frame:number){
    const saved=this.checkpoints.filter(c=>c.frame<=frame).at(-1)??(this.baseline&&this.baseline.frame<=frame?this.baseline:undefined);
    this.kernel=this.make();
    if(saved){this.kernel.restore(saved.state);this.frame=saved.frame;}
    else this.frame=this.birth-1;
    this.cursor=this.events.findIndex(e=>e.frame!>this.frame);
    if(this.cursor<0)this.cursor=this.events.length;
  }
  private syncClock(){
    if(this.clock&&this.clockRevision!==this.clock.revision){
      const changes=this.clock.changes.filter(c=>c.revision>this.clockRevision);
      const frame=this.clockRevision<(this.clock.changes[0]?.revision??1)-1?this.birth:Math.min(...changes.map(c=>c.frame));
      this.clockRevision=this.clock.revision;
      // Keep valid past checkpoints when only future scheduled events change.
      this.invalidate(frame);
    }
  }
  private advance(frame:number){
    this.syncClock();
    if(frame<this.frame)this.rewind(frame);
    while(this.frame<frame){
      let next=this.frame+1;
      if(this.frame>=this.birth&&this.kernel.canSkip())next=Math.min(frame,Math.max(next,this.events[this.cursor]?.frame??frame));
      while(this.cursor<this.events.length&&this.events[this.cursor].frame!<=next){
        this.kernel.apply(this.events[this.cursor++],next/this.sampleRate);
      }
      if(this.clock)this.clock.readClock(next,this.input);
      this.kernel.step(next,this.clock?this.input:undefined);this.frame=next;
      if(this.kernel.clockOnly)this.remember(next);
      if(!this.checkpoints.length||next-this.checkpoints.at(-1)!.frame>=8192){
        this.checkpoints.push({frame:next,state:this.kernel.snapshot()});
        if(this.checkpoints.length>64)this.checkpoints.shift();
      }
    }
  }
  private remember(frame:number){
    const block=Math.floor(frame/128),offset=frame%128;
    let data=this.history.get(block);
    if(!data){data={values:new Float32Array(128*7),valid:new Uint8Array(128)};this.history.set(block,data);}
    data.values.set(this.kernel.clockValues,offset*7);data.valid[offset]=1;
    while(this.history.size>512)this.history.delete(this.history.keys().next().value!);
  }
  readClock(frame:number,out:Float32Array){
    this.syncClock();
    const data=this.history.get(Math.floor(frame/128)),offset=frame%128;
    if(data?.valid[offset]){for(let i=0;i<7;i++)out[i]=data.values[offset*7+i];return;}
    this.advance(Math.max(this.birth,frame));out.set(this.kernel.clockValues);
  }
  at(time:number):ControlSnapshot{
    if(this.disposed)return {sources:{},phases:[0,0,0],origin:0};
    this.advance(Math.max(this.birth,controlFrame(time,this.sampleRate)));
    const result={sources:{...this.kernel.sources},phases:this.kernel.freePhase.slice(),origin:this.kernel.clockOrigin};
    this.compact(false);return result;
  }
  panic(at:number){
    this.events=this.events.filter(e=>e.at<at||!(["note","release","lfoTrigger","clockReset"].includes(e.type)||e.trigger));
    this.event({type:"panic",at});
  }
  private compact(advance:boolean){
    if(!this.now||this.disposed)return;
    let cutoff=controlFrame(Math.max(0,this.now()-8),this.sampleRate);
    // Children may still need earlier parent samples for a local replay.
    for(const child of this.children)cutoff=Math.min(cutoff,child.birth);
    if(cutoff<=this.birth+this.sampleRate)return;
    if(advance&&this.frame<cutoff)this.advance(cutoff);
    const baseline=this.checkpoints.filter(c=>c.frame<=cutoff).at(-1);
    if(!baseline)return;
    this.baseline=baseline;this.birth=baseline.frame;
    this.checkpoints=this.checkpoints.filter(c=>c.frame>=this.birth);
    this.events=this.events.filter(e=>e.frame!>this.birth);
    this.cursor=this.events.findIndex(e=>e.frame!>this.frame);
    if(this.cursor<0)this.cursor=this.events.length;
    for(const block of this.history.keys())if((block+1)*128<=this.birth)this.history.delete(block);
  }
  dispose(){this.disposed=true;this.clock?.children.delete(this);this.events=[];this.checkpoints=[];this.baseline=undefined;this.history.clear();}
}
