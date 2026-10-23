import { createFilterDsp } from "./filter-dsp";
import { FILTER_PARAMS } from "./filter-config";

export const FILTER_AUDIO_PARAMS = Object.keys(FILTER_PARAMS).filter((key) => !key.endsWith("Curve") && key !== "filterVelocity" && key !== "filterCharacter" && key !== "filterOversampling" && key !== "drivePosition") as (keyof typeof FILTER_PARAMS)[];
const descriptors = Object.entries(FILTER_PARAMS).filter(([key]) => FILTER_AUDIO_PARAMS.includes(key as keyof typeof FILTER_PARAMS)).map(([name, [minValue, maxValue, defaultValue]]) => ({ name, minValue: Math.min(0, minValue), maxValue, defaultValue, automationRate: "a-rate" }));
export const advancedFilterProcessor = `
const phaseFilterDsp = (${createFilterDsp.toString()})();
class PhaseAdvancedFilter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [
    {name:'frequency',defaultValue:2400,minValue:0,maxValue:96000,automationRate:'a-rate'},
    {name:'resonance',defaultValue:2.2,minValue:0,maxValue:20,automationRate:'a-rate'},
    {name:'detune',defaultValue:0,minValue:-19200,maxValue:19200,automationRate:'a-rate'},
    {name:'note',defaultValue:60,minValue:0,maxValue:127,automationRate:'a-rate'},
    {name:'combFeedback',defaultValue:.65,minValue:0,maxValue:.98,automationRate:'a-rate'},
    {name:'combDamping',defaultValue:8000,minValue:0,maxValue:18000,automationRate:'a-rate'},
    {name:'combMix',defaultValue:.75,minValue:0,maxValue:1,automationRate:'a-rate'},
    {name:'polarity',defaultValue:1,minValue:-1,maxValue:1,automationRate:'a-rate'},
    {name:'drive',defaultValue:.12,minValue:0,maxValue:1,automationRate:'a-rate'},
    ...${JSON.stringify(descriptors)}
  ]; }
  constructor(options) {
    super();
    this.settings = {...options.processorOptions};
    this.core = new phaseFilterDsp.Core(sampleRate, phaseFilterDsp.isOversampled(this.settings));
    this.keys = PhaseAdvancedFilter.parameterDescriptors.map((p) => p.name);
    this.varying = [];
    this.active = true;
    this.port.onmessage = ({data}) => {
      if(data==='reset') this.core.reset();
      if(data==='dispose') { this.active=false; this.port.close(); }
    };
  }
  process(inputs, outputs, params) {
    if(!this.active) return false;
    const output=outputs[0], input=inputs[0] || [];
    if(!output || !output.length) return true;
    const varying=this.varying; varying.length=0;
    for(const key of this.keys) { const a=params[key]; this.settings[key]=a[0]; if(a.length>1) varying.push(key); }
    if(!varying.length) this.core.configure(this.settings);
    for(let i=0;i<output[0].length;i++) {
      if(varying.length) { for(const key of varying) this.settings[key]=params[key][i]; this.core.configure(this.settings); }
      for(let ch=0;ch<output.length;ch++) {
        const source=input[ch] || input[0], x=source && Number.isFinite(source[i])?source[i]:0;
        output[ch][i]=this.core.channel(x,Math.min(ch,1));
      }
      this.core.position=(this.core.position+1)&this.core.mask;
    }
    return true;
  }
}
registerProcessor('phase-advanced-filter',PhaseAdvancedFilter);
`;
