/** Piecewise integration: a new rate closes the previous segment first.
 * The same anchors are used for sample stepping and sparse CPU queries. */
export class LfoPhase {
  time=0;
  value=0;
  rate=NaN;
  constructor(time=0){this.time=time;}
  reset(time:number){this.time=time;this.value=0;this.rate=NaN;}
  sample(time:number,rate:number){
    if(!Number.isFinite(this.rate))this.rate=rate;
    else if(rate!==this.rate){
      if(time>=this.time){this.value+=(time-this.time)*this.rate;this.time=time;}
      this.rate=rate;
    }
    return this.value+Math.max(0,time-this.time)*this.rate;
  }
}
export const controlFrame=(time:number,sampleRate:number)=>Math.max(0,Math.ceil(time*sampleRate-1e-7));
