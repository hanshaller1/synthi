import type { ModulationReading } from "./modulation-worklet";

/** Native legacy routes are measured where their summed control signal also
 * enters the AudioParams. No main-thread recreation of their envelopes. */
export const modulationMeterProcessor=`
class PhaseModulationMeter extends AudioWorkletProcessor {
  constructor(options){super();this.config=options.processorOptions.config;this.events=[];this.frames=0;this.disposed=false;
    this.port.onmessage=({data})=>{if(data.type==='dispose'){this.disposed=true;this.port.close();}else{this.events.push(data);this.events.sort((a,b)=>a.at-b.at);}};
  }
  process(inputs,outputs){
    if(this.disposed)return false;
    const length=outputs[0][0].length,now=(currentFrame+length-1)/sampleRate;
    while(this.events.length&&this.events[0].at<=now)this.config=this.events.shift().config;
    this.frames+=length;
    if(this.frames>=sampleRate/30){this.frames%=sampleRate/30;const values={},bases={};
      for(let i=0;i<this.config.length;i++){const c=this.config[i],signal=inputs[i]?.[0];bases[c.id]=c.base;values[c.id]=Math.max(c.min,Math.min(c.max,c.offset+(signal?.[signal.length-1]??0)));}
      this.port.postMessage({values,bases,sources:{},time:now});
    }
    return true;
  }
}
registerProcessor('phase-modulation-meter',PhaseModulationMeter);
`;
type MeterConfig={id:string;base:number;offset:number;min:number;max:number}[];
export class NativeModulationMeter {
  readonly node:AudioWorkletNode;
  reading?:ModulationReading;
  private links:{source:AudioNode;index:number}[]=[];
  constructor(context:AudioContext,config:MeterConfig,outputs:Record<string,AudioNode[]>,sink:AudioNode){
    this.node=new AudioWorkletNode(context,"phase-modulation-meter",{numberOfInputs:config.length,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:"explicit",processorOptions:{config}});
    config.forEach((c,index)=>{for(const source of outputs[c.id]??[]){source.connect(this.node,0,index);this.links.push({source,index});}});
    this.node.connect(sink);this.node.port.onmessage=({data})=>{this.reading=data;};
  }
  update(config:MeterConfig,at:number){this.node.port.postMessage({config,at});}
  dispose(){for(const {source,index}of this.links)source.disconnect(this.node,0,index);this.links=[];this.node.port.onmessage=null;this.node.port.postMessage({type:"dispose"});this.node.disconnect();}
}
