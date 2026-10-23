/** Normalized ADSR including curved, interruptible release. */
export function modulationCurve(t:number,curve:number) {const c=Math.max(-100,Math.min(100,curve))*.06;if(Math.abs(c)<.00001)return t;return Math.expm1(c*t)/Math.expm1(c);}
export function modulationEnvelope(a:number,d:number,s:number,r:number,ac:number,dc:number,rc:number,time:number,release:number,curve:typeof modulationCurve=modulationCurve) {
  const held=Math.max(0,Math.min(time,release));let value=held<a&&a>0?curve(held/a,ac):held<a+d?1+(s-1)*curve((held-a)/Math.max(.00001,d),dc):s;
  if(time>release)value*=1-curve(Math.min(1,(time-release)/Math.max(.00001,r)),rc);
  return Math.max(0,Math.min(1,value));
}
/** The voice amplifier uses linear attack/decay and an exponential release. */
export function ampEnvelope(a:number,d:number,s:number,r:number,time:number,release:number) {
  const held=Math.max(0,Math.min(time,release));
  const value=held<a&&a>0?held/a:held<a+d?1+(s-1)*(held-a)/Math.max(.00001,d):s;
  if(time<=release)return Math.max(0,value);
  const fraction=Math.min(1,(time-release)/Math.max(.00001,r));
  return fraction>=1?0:Math.max(.00001,value)*Math.pow(.00001/Math.max(.00001,value),fraction);
}
