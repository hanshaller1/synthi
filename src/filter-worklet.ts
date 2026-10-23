import { fmProcessor } from "./fm-worklet";
import { spectralProcessor } from "./spectral-worklet";
type Context = AudioContext | OfflineAudioContext;
const modules = new WeakMap<Context, Promise<void>>();

// Kept inline so the portable HTML and GitHub Pages need no extra worklet file.
// Processing the delay inside one processor avoids the render-quantum minimum
// delay of a cyclic DelayNode graph, which would detune a high-frequency comb.
const processor = String.raw`
class PhaseCombFilter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 2400, minValue: 0, maxValue: 22000, automationRate: 'a-rate' },
      { name: 'detune', defaultValue: 0, minValue: -9600, maxValue: 9600, automationRate: 'a-rate' },
      { name: 'feedback', defaultValue: 0.65, minValue: 0, maxValue: 0.98, automationRate: 'a-rate' },
      { name: 'damping', defaultValue: 8000, minValue: 0, maxValue: 22000, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0.75, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'polarity', defaultValue: 1, minValue: -1, maxValue: 1, automationRate: 'k-rate' }
    ];
  }
  constructor() {
    super();
    let size = 1;
    while (size < sampleRate / 20 + 4) size *= 2;
    this.rings = [new Float32Array(size), new Float32Array(size)];
    this.low = [0, 0];
    this.mask = size - 1;
    this.position = 0;
    this.active = true;
    this.port.onmessage = ({ data }) => {
      if (data === 'reset') {
        for (const ring of this.rings) ring.fill(0);
        this.low.fill(0);
        this.position = 0;
      }
      if (data === 'dispose') {
        this.active = false;
        this.port.close();
      }
    };
  }
  process(inputs, outputs, params) {
    const output = outputs[0];
    if (!this.active) return false;
    if (!output || !output.length) return true;
    const input = inputs[0] || [];
    const alpha = 1 - Math.exp(-2 * Math.PI * Math.max(100, Math.min(sampleRate * 0.45, params.damping[0])) / sampleRate);
    const sign = Math.max(-1, Math.min(1, params.polarity[0]));
    const frequency = params.frequency, feedback = params.feedback, mix = params.mix;
    for (let i = 0; i < output[0].length; i++) {
      const hz = Math.max(20, Math.min(sampleRate * 0.45, frequency[frequency.length === 1 ? 0 : i] * Math.pow(2, params.detune[params.detune.length === 1 ? 0 : i] / 1200)));
      const delay = sampleRate / hz;
      const whole = Math.floor(delay), fraction = delay - whole;
      const first = (this.position - whole) & this.mask, second = (first - 1) & this.mask;
      const g = Math.max(0, Math.min(0.98, feedback[feedback.length === 1 ? 0 : i]));
      const wet = Math.max(0, Math.min(1, mix[mix.length === 1 ? 0 : i]));
      for (let channel = 0; channel < output.length; channel++) {
        const slot = Math.min(channel, 1), ring = this.rings[slot];
        const source = input[channel] || input[0];
        const x = source && Number.isFinite(source[i]) ? source[i] : 0;
        const delayed = ring[first] + fraction * (ring[second] - ring[first]);
        const low = this.low[slot] + alpha * (delayed - this.low[slot]);
        this.low[slot] = Math.abs(low) < 1e-20 ? 0 : low;
        // Normalization and feedback below unity keep even moving resonances bounded.
        const y = (1 - g) * x + sign * g * this.low[slot];
        ring[this.position] = y;
        output[channel][i] = (1 - wet) * x + wet * y;
      }
      this.position = (this.position + 1) & this.mask;
    }
    return true;
  }
}
registerProcessor('phase-comb-filter', PhaseCombFilter);
`;

export function prepareFilterWorklet(context: Context): Promise<void> {
  const cached = modules.get(context);
  if (cached) return cached;
  // Classic and multimode filters still work in contexts without AudioWorklet.
  if (!context.audioWorklet) return Promise.resolve();
  const url = URL.createObjectURL(
    new Blob([processor, spectralProcessor, fmProcessor], { type: "text/javascript" }),
  );
  const pending = context.audioWorklet
    .addModule(url)
    .finally(() => URL.revokeObjectURL(url));
  modules.set(context, pending);
  void pending.catch(() => modules.delete(context));
  return pending;
}
