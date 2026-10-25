/** Shared control DSP, called by both the worklet and lazy CPU snapshots.
 * Dependencies are explicit so embedding/minification cannot change bindings. */
export function createModulationKernel(dependencies:Record<string,any>){
  const {lfoNoise,lfoValue,lfoFadeGain,modulationCurve,modulationEnvelope,ampEnvelope,routeCurve,modulationValue,modulationModes,modulationShapes,modulationFxModes,Phase}=dependencies;
  const modulationFxSlots=Object.keys(modulationFxModes),modulationFxModeIds=modulationFxSlots.map(slot=>'fx.'+slot+'.mode');
  return class ModulationKernel {
    [key:string]:any;
  constructor(options:any){this.c=options.config;this.allSources=!!options.allSources;this.reporting=options.telemetry;this.eventsEpoch=0;this.notesEpoch=0;this.eventCache={};this.lastNoteEpoch=[-1,-1,-1];this.sr=options.sampleRate;this.trackSeed=options.trackSeed??1;this.params={tempo:options.tempo??118,wheel:0,pressure:0,bend:0,active:1};this.groups={};this.lfoValues=[{},{},{}];this.fieldIds=[1,2,3].map((i:number)=>Object.fromEntries([...this.c.fields,'mode','shape','sync','polarity','division','randomRepeat'].map((key:string)=>[key,'lfo.'+i+'.'+key])));this.groupRoutes();this.track=options.track;this.clockOnly=!!options.clockOnly;this.clockOrigin=0;this.freePhase=[0,0,0];this.freeInitialized=[false,false,false];this.held=[0,0,0];this.started=false;this.disposed=false;this.notes=[];this.note={start:options.start,note:options.note,velocity:options.velocity,release:Infinity,seed:options.seed,values:this.c.values};this.lfoStart=this.note.start;this.phase=[0,0,0];this.initialized=[false,false,false];this.lastModes=[null,null,null];this.randomPhase=0;this.randomStarted=false;this.randomSeed=options.track?1:options.seed;this.age=0;this.sample=0;this.sources={};this.last={};this.modeValues={...this.c.modes};
this.freeIntegrators=[0,1,2].map(()=>new Phase(0));this.localIntegrators=[0,1,2].map(()=>new Phase(this.lfoStart));this.randomIntegrator=new Phase(0);this.clockValues=new Float32Array(7);}
  groupRoutes(){this.groups={};for(const route of this.c.routes)(this.groups[route.target]??=[]).push(route);}
  reset(){this.started=true;}
  apply(event:any,now:number){
    if(event.type==='expression')this.params[event.key]=event.value;
    if(event.type==='lfoTrigger'){this.notesEpoch++;this.eventsEpoch++;this.lfoStart=event.at;if(event.seed!==undefined)this.note.seed=event.seed;}
    if(event.type==='clockReset'){this.clockOrigin=event.at;this.freePhase=[0,0,0];this.freeInitialized=[true,true,true];for(const phase of this.freeIntegrators)phase.reset(event.at);}
    if(event.type==='config'){if(event.trigger||JSON.stringify(event.config.routes.filter((r:any)=>event.config.ranges[r.target]?.event))!==JSON.stringify(this.c.routes.filter((r:any)=>this.c.ranges[r.target]?.event))||Object.entries(event.config.ranges).some(([id,m]:[string,any])=>m.event&&event.config.values[id]!==this.c.values[id]))this.eventsEpoch++;this.c=event.config;this.modeValues={...this.c.modes};this.groupRoutes();}
    if(event.type==='note'){this.lfoStart=event.at;this.eventsEpoch++;this.notesEpoch++;const n={...event,release:Infinity,start:event.at,values:this.c.values};this.notes.push(n);this.note=n;this.reset();}
    if(event.type==='release'){const n=this.notes.find((n:any)=>n.id===event.id);if(n)n.release=event.at;if(!this.track)this.note.release=event.at;const held=this.notes.filter((n:any)=>n.release>now);if(held.length)this.note=held[held.length-1];}
    if(event.type==='retune'){const n=this.track?this.notes.find((n:any)=>n.id===event.id):this.note;if(n)n.note=event.note;}
    if(event.type==='pressure'){for(const n of this.notes)if(event.note===undefined||n.note===event.note)n.pressure=event.value;if(!this.track&&(event.note===undefined||this.note.note===event.note))this.note.pressure=event.value;}
    if(event.type==='panic'){for(const n of this.notes)n.release=now;this.note.release=now;}
    this.notes=this.notes.filter((n:any)=>n.release>now-32);
  }
  value(id:string){const c=this.c,base=c.values[id]??0,meta=c.ranges[id];if(!meta)return base;let amount=0;for(const r of this.groups[id]??[])if((!r.condition||this.modeValues[r.condition.slot]===r.condition.variant))amount+=routeCurve(this.sources[r.source]??0,r.curve)*r.amount;const value=amount===0?base:modulationValue(base,amount*(meta.event&&meta.options?2:1),meta);return /^lfo\.[1-3]\.mode$/.test(id)&&c.lfos[+id.split(".")[1]-1]?.legacyTriggerMod&&base<=1?Math.max(0,Math.min(1,value)):value;}
  eventValue(id:string){if(this.c.ranges[id]?.event&&!id.startsWith("lfo.")&&!id.startsWith("fx."))return this.note.values?.[id]??this.c.values[id];const cached=this.eventCache[id];if(cached&&cached.epoch===this.eventsEpoch)return cached.value;let value=this.value(id);const options=this.c.ranges[id]?.options;if(options&&value!==this.c.values[id])value=options.reduce((best:any,o:any)=>Math.abs(o.value-value)<Math.abs(best-value)?o.value:best,options[0].value);this.eventCache[id]={epoch:this.eventsEpoch,value};return value;}
  envelope(prefix:string,now:number){if(this.track&&this.notes.length===0)return 0;const n=this.note,v=n.values??this.c.values,t=now-n.start,r=n.release-n.start;if(prefix==='amp')return ampEnvelope(v.attack,v.decay,v.sustain,v.release,t,r);if(prefix==='filter')return modulationEnvelope(v.filterAttack,v.filterDecay,v.filterSustain,v.filterRelease,v.filterAttackCurve??0,v.filterDecayCurve??0,v.filterReleaseCurve??0,t,r,modulationCurve);return modulationEnvelope(v[prefix+'Attack'],v[prefix+'Decay'],v[prefix+'Sustain'],v[prefix+'Release'],v[prefix+'AttackCurve'],v[prefix+'DecayCurve'],v[prefix+'ReleaseCurve'],t,r,modulationCurve);}
  step(frame:number,shared?:Float32Array){
      const sampleRate=this.sr,now=frame/sampleRate;this.tempo=this.params.tempo;
      if(now<this.note.start||this.params.active<.5){for(const id of this.c.ids)this.last[id]=0;return;}
      if(!this.started)this.reset();
      const n=this.note,s=this.sources,c=this.c;
      s.velocity=n.velocity;s.keytrack=(n.note-60)/36;s.modwheel=this.params.wheel;s.pressure=n.pressure??this.params.pressure;s.pitchbend=this.params.bend;
      if(this.allSources||c.sourceFlags.randomNote){if(this.noiseStart!==n.start||this.noiseSeed!==n.seed){this.noiseStart=n.start;this.noiseSeed=n.seed;this.noiseValue=lfoNoise(Math.floor(n.start*10000),n.seed);}s.randomNote=this.noiseValue;}
      if(this.allSources||c.sourceFlags.ampEnv)s.ampEnv=this.envelope('amp',now);if(this.allSources||c.sourceFlags.filterEnv)s.filterEnv=this.envelope('filter',now);
      for(const id of c.order){
        if(id==='smoothRandom'){const rate=this.value('randomRate');this.randomPhase=this.randomIntegrator.sample(now,rate);s[id]=this.clockOnly&&!c.sourceFlags.smoothRandom?0:lfoValue('smooth',this.randomPhase,this.randomSeed,.5,0,this.value('randomSlew'),lfoNoise);continue;}
        if(id.startsWith('macro')){s[id]=this.value(id);continue;}
        if(id.startsWith('modEnv')){s[id]=this.clockOnly&&!c.sourceFlags[id]?0:this.envelope(id,now);continue;}
        const j=Number(id.slice(-1))-1,v=this.lfoValues[j],ids=this.fieldIds[j];for(const key of c.fields)v[key]=this.value(ids[key]);
        const mode=modulationModes[Math.round(this.eventValue(ids.mode))],shape=modulationShapes[Math.round(this.eventValue(ids.shape))],sync=this.eventValue(ids.sync)>=.5,unipolar=this.eventValue(ids.polarity)>=.5;
        const rate=sync?this.tempo/60/Math.max(1/24,this.eventValue(ids.division)):v.rate;
        this.freePhase[j]=this.freeIntegrators[j].sample(now,rate);
        const hasClock=shared?.length===7;
        const globalPhase=hasClock?shared[j*2]+shared[j*2+1]:this.freePhase[j];
        const clockAge=hasClock?shared[6]:Math.max(0,now-this.clockOrigin);
        const noteChanged=this.lastNoteEpoch[j]!==this.notesEpoch,modeChanged=this.lastModes[j]!==mode;
        const repeat=this.eventValue(ids.randomRepeat)>=.5;
        const randomSeed=this.trackSeed*65537+j+1+((mode==='free'||mode==='hold'||repeat)?0:this.note.seed*17);
        if(noteChanged||modeChanged||!this.initialized[j]){
          if(mode!=='free')this.localIntegrators[j].reset(noteChanged||!this.initialized[j]?this.lfoStart+v.delay:Math.max(now,this.lfoStart+v.delay));
          if(mode==='hold')this.held[j]=lfoValue(shape,globalPhase+(v.phase%360)/360,randomSeed,v.pulseWidth,v.skew,v.slew,lfoNoise);
          this.lastNoteEpoch[j]=this.notesEpoch;this.lastModes[j]=mode;this.initialized[j]=true;
        }
        const elapsed=(mode==='free'?clockAge:now-this.lfoStart)-v.delay,length=mode==='one'?1:mode==='half'?.5:Infinity;
        this.phase[j]=this.localIntegrators[j].sample(now,rate);
        const done=this.phase[j]>=length,phase=mode==='free'?globalPhase:this.phase[j];
        const needed=!this.clockOnly||c.sourceFlags[id];
        const bipolar=!needed?0:mode==='hold'?this.held[j]:lfoValue(shape,phase+(v.phase%360)/360,randomSeed,v.pulseWidth,v.skew,v.slew,lfoNoise);
        const gain=needed?lfoFadeGain(Math.max(0,elapsed),v.fade,v.fadeOut,now-n.release,Number.isFinite(length)?(length-this.phase[j])/Math.max(.02,rate):Infinity,length/Math.max(.02,rate)):1;
        s[id]=elapsed<0||done?0:(unipolar?(bipolar+1)/2:bipolar)*v.depth*gain;
        if(this.clockOnly){this.clockValues[j*2]=this.freePhase[j]%1;this.clockValues[j*2+1]=Math.floor(this.freePhase[j]);this.clockValues[6]=Math.min(64,clockAge);}
      }
      for(let slot=0;slot<modulationFxSlots.length;slot++){const name=modulationFxSlots[slot],value=Math.round(this.eventValue(modulationFxModeIds[slot]));this.modeValues[name]=modulationFxModes[name][value];}
      if(!this.clockOnly)for(let k=0;k<c.ids.length;k++){const id=c.ids[k],event=c.ranges[id]?.event,value=event?this.eventValue(id):this.value(id),base=c.values[id]??0,delta=value-base;const previous=this.last[id]??0,smoothed=event?delta:previous+(delta-previous)*Math.min(1,1/(sampleRate*.003));this.last[id]=smoothed;}
      this.age++;
  }

  canSkip(){return this.c.routes.length===0&&this.c.ids.length===0;}
  snapshot(){return this.copy(this);}
  restore(state:any){Object.assign(this,this.copy(state));}
  copy(source:any){
    const state={...source};
    for(const key of ['phase','freePhase','freeInitialized','initialized','lastModes','lastNoteEpoch','held'])state[key]=source[key].slice();
    for(const key of ['sources','last','modeValues','eventCache','params'])state[key]={...source[key]};
    state.lfoValues=source.lfoValues.map((v:any)=>({...v}));
    state.notes=source.notes.map((n:any)=>({...n}));
    state.note=state.notes.find((n:any)=>n.id===source.note.id&&n.start===source.note.start)??{...source.note};
    for(const key of ['freeIntegrators','localIntegrators'])state[key]=source[key].map((v:any)=>Object.assign(new Phase(),v));
    state.randomIntegrator=Object.assign(new Phase(),source.randomIntegrator);
    state.clockValues=source.clockValues.slice();
    return state;
  }
 };
}
