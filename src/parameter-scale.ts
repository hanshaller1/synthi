/** Shared physical-value geometry for base controls and modulation overlays. */
export type ControlScale={min:number;max:number;log?:boolean;power?:number};
const unit=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
export function parameterPosition(value:number,scale:ControlScale){
  const {min,max}=scale;if(max<=min)return 0;
  if(scale.log&&min>0)return unit(Math.log(Math.max(min,value)/min)/Math.log(max/min));
  return unit((value-min)/(max-min))**(1/Math.max(.0001,scale.power??1));
}
export function parameterAt(position:number,scale:ControlScale){
  const {min,max}=scale,t=unit(position);
  return scale.log&&min>0?min*(max/min)**t:min+t**Math.max(.0001,scale.power??1)*(max-min);
}
