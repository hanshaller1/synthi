export type FilterFrequencyReading={time:number;frequencies:number[];kind:"native"|"comb"|"advanced";mix:number;note?:number};
export type NativeFrequencyBounds={frequency:[number,number];detune:[number,number]};

/** Native Biquads receive these very same a-rate streams. Measure the scheduled
 * ADSR + matrix inputs, then apply the native AudioParam and Nyquist limits. */
export const filterMeterProcessor=`
class PhaseFilterFrequencyMeter extends AudioWorkletProcessor {
  constructor(options){super();this.bounds=options.processorOptions.bounds;this.frames=0;this.active=true;
    this.port.onmessage=({data})=>{if(data==='dispose'){this.active=false;this.port.close();}};
  }
  process(inputs,outputs){
    if(!this.active)return false;
    const count=outputs[0][0].length;this.frames+=count;
    if(this.frames>=sampleRate/30){this.frames%=sampleRate/30;
      const last=count-1,b=this.bounds;
      const f=Math.max(b.frequency[0],Math.min(b.frequency[1],inputs[0]?.[0]?.[last]??0));
      const cents=Math.max(b.detune[0],Math.min(b.detune[1],inputs[1]?.[0]?.[last]??0));
      const hz=f===0?0:Math.max(0,Math.min(sampleRate/2,f*Math.pow(2,cents/1200)));
      this.port.postMessage({time:(currentFrame+last)/sampleRate,frequencies:[hz],kind:'native',mix:1});
    }
    return true;
  }
}
registerProcessor('phase-filter-frequency-meter',PhaseFilterFrequencyMeter);
`;
export class NativeFilterFrequencyMeter {
  private node:AudioWorkletNode;
  reading?:FilterFrequencyReading;
  constructor(context:AudioContext,bounds:NativeFrequencyBounds,private frequency:AudioNode,private detune:AudioNode,sink:AudioNode){
    this.node=new AudioWorkletNode(context,"phase-filter-frequency-meter",{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:"explicit",processorOptions:{bounds}});
    frequency.connect(this.node,0,0);detune.connect(this.node,0,1);this.node.connect(sink);
    this.node.port.onmessage=({data})=>{this.reading=data;};
  }
  dispose(){this.frequency.disconnect(this.node,0,0);this.detune.disconnect(this.node,0,1);this.node.port.onmessage=null;this.node.port.postMessage('dispose');this.node.disconnect();}
}
