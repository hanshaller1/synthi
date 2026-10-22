import { clamp } from "./model";
import type { Patch } from "./model";

type Context = AudioContext | OfflineAudioContext;

function curve(
  amount: number,
  mode: Patch["saturationMode"],
): Float32Array<ArrayBuffer> {
  const values = new Float32Array(8192);
  const drive = 1 + amount * (mode === "fold" ? 7 : 35);
  const levels = 2 ** Math.round(16 - amount * 13);
  for (let i = 0; i < values.length; i++) {
    const x = (i * 2) / (values.length - 1) - 1;
    if (amount < 0.001) values[i] = x;
    else if (mode === "hard") values[i] = clamp(x * drive, -1, 1);
    else if (mode === "fold")
      values[i] =
        (2 / Math.PI) * Math.asin(Math.sin((x * drive * Math.PI) / 2));
    else if (mode === "crush") values[i] = Math.round(x * levels) / levels;
    else if (mode === "diode")
      values[i] =
        x >= 0 ? Math.tanh(x * drive) : Math.tanh(x * drive * 0.35) * 0.65;
    else values[i] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return values;
}

function impulse(ctx: Context, duration: number, mode: Patch["reverbMode"]) {
  const buffer = ctx.createBuffer(
    2,
    Math.ceil(ctx.sampleRate * duration),
    ctx.sampleRate,
  );
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let seed = 7361 + channel * 2311,
      low = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      const noise = seed / 1073741823.5 - 1,
        t = i / ctx.sampleRate,
        x = i / data.length;
      low += 0.14 * (noise - low);
      if (mode === "spring") {
        // Dispersive chirped resonances approximate the characteristic spring splash.
        data[i] =
          (Math.sin(2 * Math.PI * (210 * t + 170 * Math.sqrt(t + 0.0001))) *
            0.35 +
            Math.sin(
              2 *
                Math.PI *
                (493 * t + 48 * Math.sqrt(t + 0.0001) + channel * 0.3),
            ) *
              0.2 +
            low * 0.45) *
          Math.exp(-6 * x);
      } else if (mode === "gated") {
        data[i] =
          noise *
          Math.min(1, t * 70) *
          (x < 0.72 ? 0.6 : Math.max(0, (0.8 - x) / 0.08) * 0.6);
      } else if (mode === "room") {
        const early = [0.011, 0.019, 0.031, 0.047, 0.073].some(
          (reflection) =>
            Math.abs(t - reflection * (1 + channel * 0.07)) <
            1 / ctx.sampleRate,
        );
        data[i] =
          low * Math.exp(-8 * x) * 0.5 + (early ? 0.7 * Math.exp(-t * 15) : 0);
      } else if (mode === "plate") {
        data[i] =
          (noise - low * 0.6) * Math.exp(-4.5 * x) * Math.min(1, t * 180);
      } else {
        data[i] =
          (low * 0.7 + noise * 0.3) * Math.exp(-4 * x) * Math.min(1, t * 35);
      }
    }
  }
  return buffer;
}

/** Four effect families with selectable Web Audio signal paths; shared by live and WAV rendering. */
export class EffectRack {
  private nodes: AudioNode[] = [];
  private distortion: WaveShaperNode;
  private dcBlock: BiquadFilterNode;
  private modInput: GainNode;
  private modDry: GainNode;
  private modWet: GainNode;
  private modDelay: DelayNode;
  private modFeedback: GainNode;
  private tremolo: GainNode;
  private allpass: BiquadFilterNode[];
  private lfo: OscillatorNode;
  private lfoDepth: GainNode;
  private delayInput: GainNode;
  private delay: DelayNode;
  private delayB: DelayNode;
  private taps: DelayNode[];
  private delayWet: GainNode;
  private feedback: GainNode;
  private feedbackB: GainNode;
  private feedbackFilter: BiquadFilterNode;
  private feedbackFilterB: BiquadFilterNode;
  private tape: WaveShaperNode;
  private tapeB: WaveShaperNode;
  private delayPan: StereoPannerNode;
  private reverb: ConvolverNode;
  private reverbWet: GainNode;
  private reverbFilter: BiquadFilterNode;
  private preDelay: DelayNode;
  private tapGains: GainNode[];
  private room = 0;
  constructor(
    private context: Context,
    input: AudioNode,
    output: AudioNode,
  ) {
    const c = context;
    const node = <T extends AudioNode>(value: T): T => {
      this.nodes.push(value);
      return value;
    };
    const gain = () => node(c.createGain());
    this.distortion = node(c.createWaveShaper());
    this.distortion.oversample = "2x";
    this.dcBlock = node(c.createBiquadFilter());
    this.dcBlock.type = "highpass";
    this.dcBlock.frequency.value = 15;
    input.connect(this.distortion).connect(this.dcBlock);
    this.modInput = gain();
    this.modDry = gain();
    this.modWet = gain();
    this.dcBlock.connect(this.modInput);
    this.modInput.connect(this.modDry).connect(output);
    this.modWet.connect(output);
    this.modDelay = node(c.createDelay(0.1));
    this.modFeedback = gain();
    this.modFeedback.gain.value = 0;
    this.modDelay.connect(this.modFeedback).connect(this.modDelay);
    this.tremolo = gain();
    this.allpass = Array.from({ length: 4 }, () => {
      const filter = node(c.createBiquadFilter());
      filter.type = "allpass";
      filter.Q.value = 0.65;
      return filter;
    });
    this.allpass.forEach((filter, i) => {
      if (i < 3) filter.connect(this.allpass[i + 1]);
    });
    this.lfo = node(c.createOscillator());
    this.lfoDepth = gain();
    this.lfo.connect(this.lfoDepth);
    this.allpass.forEach((filter, i) => {
      const depth = gain();
      depth.gain.value = 160 * (i + 1);
      this.lfo.connect(depth).connect(filter.frequency);
    });
    this.lfo.start();
    this.delayInput = gain();
    this.dcBlock.connect(this.delayInput);
    this.delay = node(c.createDelay(2));
    this.delayB = node(c.createDelay(2));
    this.feedback = gain();
    this.feedbackB = gain();
    this.feedbackFilter = node(c.createBiquadFilter());
    this.feedbackFilterB = node(c.createBiquadFilter());
    this.tape = node(c.createWaveShaper());
    this.tapeB = node(c.createWaveShaper());
    this.delayWet = gain();
    this.delayWet.connect(output);
    this.delayPan = node(c.createStereoPanner());
    this.delay.connect(this.delayPan).connect(this.delayWet);
    const right = node(c.createStereoPanner());
    right.pan.value = 1;
    this.delayB.connect(right).connect(this.delayWet);
    this.delay
      .connect(this.feedback)
      .connect(this.feedbackFilter)
      .connect(this.tape);
    this.delayB
      .connect(this.feedbackB)
      .connect(this.feedbackFilterB)
      .connect(this.tapeB);
    this.tapGains = [];
    this.taps = [0, 1].map((i) => {
      const tap = node(c.createDelay(2)),
        pan = node(c.createStereoPanner()),
        wet = gain();
      this.tapGains.push(wet);
      pan.pan.value = i ? 0.65 : -0.65;
      wet.gain.value = 0;
      tap.connect(pan).connect(wet).connect(this.delayWet);
      return tap;
    });
    this.reverb = node(c.createConvolver());
    this.reverbWet = gain();
    this.preDelay = node(c.createDelay(0.1));
    this.reverbFilter = node(c.createBiquadFilter());
    this.dcBlock
      .connect(this.preDelay)
      .connect(this.reverb)
      .connect(this.reverbFilter)
      .connect(this.reverbWet)
      .connect(output);
  }
  updateEffects(p: Patch, previous: Patch | undefined, time: number) {
    const target = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(time);
      param.setTargetAtTime(value, time, 0.02);
    };
    if (
      previous?.saturationMode !== p.saturationMode ||
      previous?.distortion !== p.distortion
    ) {
      this.distortion.curve = curve(p.distortion, p.saturationMode);
      this.distortion.oversample = p.saturationMode === "crush" ? "none" : "2x";
    }
    const modChanged = previous?.modulationMode !== p.modulationMode;
    if (modChanged) {
      this.modInput.disconnect();
      this.modDelay.disconnect();
      this.modDelay.connect(this.modFeedback);
      this.modInput.connect(this.modDry);
      this.lfoDepth.disconnect();
      this.tremolo.disconnect();
      this.allpass[3].disconnect();
      const mode = p.modulationMode;
      this.lfo.frequency.setValueAtTime(
        mode === "tremolo"
          ? 4
          : mode === "vibrato"
            ? 5.2
            : mode === "phaser"
              ? 0.35
              : 0.65,
        time,
      );
      this.modFeedback.gain.setValueAtTime(mode === "flanger" ? 0.58 : 0, time);
      if (mode === "phaser") {
        this.modInput.connect(this.allpass[0]);
        this.allpass[3].connect(this.modWet);
        this.allpass.forEach((filter, i) =>
          filter.frequency.setValueAtTime(380 * (i + 1), time),
        );
      } else if (mode === "tremolo") {
        this.modInput.connect(this.tremolo).connect(this.modWet);
        this.tremolo.gain.setValueAtTime(0.5, time);
        this.lfoDepth.gain.setValueAtTime(0.5, time);
        this.lfoDepth.connect(this.tremolo.gain);
      } else {
        this.modInput.connect(this.modDelay);
        this.modDelay.connect(this.modWet);
        this.modDelay.delayTime.setValueAtTime(
          mode === "flanger" ? 0.003 : mode === "vibrato" ? 0.01 : 0.018,
          time,
        );
        this.lfoDepth.gain.setValueAtTime(
          mode === "flanger" ? 0.002 : 0.006,
          time,
        );
        this.lfoDepth.connect(this.modDelay.delayTime);
      }
    }
    if (modChanged || previous?.chorus !== p.chorus) {
      const mix = this.modMix(p);
      target(this.modWet.gain, mix);
      target(this.modDry.gain, 1 - mix);
    }
    const delayChanged = previous?.delayMode !== p.delayMode;
    if (delayChanged) {
      this.delayInput.disconnect();
      this.tape.disconnect();
      this.tapeB.disconnect();
      this.delayInput.connect(this.delay);
      this.delayPan.pan.setValueAtTime(
        p.delayMode === "pingpong" ? -1 : 0,
        time,
      );
      this.tape.connect(p.delayMode === "pingpong" ? this.delayB : this.delay);
      if (p.delayMode === "pingpong") this.tapeB.connect(this.delay);
      this.taps.forEach((tap, i) => {
        if (p.delayMode === "multitap") this.delayInput.connect(tap);
        target(this.tapGains[i].gain, p.delayMode === "multitap" ? 0.55 : 0);
      });
      [this.feedbackFilter, this.feedbackFilterB].forEach((filter) => {
        filter.type = p.delayMode === "dub" ? "bandpass" : "lowpass";
        filter.frequency.setValueAtTime(
          p.delayMode === "tape" ? 2800 : p.delayMode === "dub" ? 1100 : 20000,
          time,
        );
        filter.Q.setValueAtTime(p.delayMode === "dub" ? 1.4 : 0.5, time);
      });
      [this.tape, this.tapeB].forEach((shaper) => {
        shaper.curve = curve(p.delayMode === "tape" ? 0.025 : 0, "soft").map(
          (value) => value * (p.delayMode === "tape" ? 0.5 : 1),
        );
      });
    }
    if (delayChanged || previous?.delayTime !== p.delayTime)
      this.delayTimes(p.delayTime, (param, value) => target(param, value));
    if (delayChanged || previous?.feedback !== p.feedback) {
      target(this.feedback.gain, p.feedback);
      target(this.feedbackB.gain, p.feedback);
    }
    if (previous?.delay !== p.delay) target(this.delayWet.gain, p.delay * 0.7);
    if (previous?.reverb !== p.reverb)
      target(this.reverbWet.gain, p.reverb * 0.7);
    if (
      previous?.reverbMode !== p.reverbMode ||
      Math.abs(this.room - p.reverbSize) >= 0.05
    ) {
      this.room = p.reverbSize;
      this.reverb.buffer = impulse(this.context, p.reverbSize, p.reverbMode);
      this.preDelay.delayTime.setValueAtTime(
        p.reverbMode === "hall" ? 0.025 : p.reverbMode === "plate" ? 0.008 : 0,
        time,
      );
      this.reverbFilter.type = "lowpass";
      target(
        this.reverbFilter.frequency,
        p.reverbMode === "room"
          ? 4500
          : p.reverbMode === "spring"
            ? 6000
            : p.reverbMode === "plate"
              ? 14000
              : 9000,
      );
    }
  }
  private modMix(p: Patch) {
    return (
      p.chorus *
      (["chorus", "phaser", "flanger"].includes(p.modulationMode) ? 0.5 : 1)
    );
  }
  private delayTimes(seconds: number, set: (p: AudioParam, v: number) => void) {
    set(this.delay.delayTime, seconds);
    set(this.delayB.delayTime, seconds);
    this.taps.forEach((tap, i) => set(tap.delayTime, (seconds * (i + 1)) / 3));
  }
  scheduleEffects(p: Patch, time: number) {
    const mix = this.modMix(p);
    this.modWet.gain.setValueAtTime(mix, time);
    this.modDry.gain.setValueAtTime(1 - mix, time);
    this.delayTimes(p.delayTime, (param, value) =>
      param.setValueAtTime(value, time),
    );
    this.delayWet.gain.setValueAtTime(p.delay * 0.7, time);
    this.feedback.gain.setValueAtTime(p.feedback, time);
    this.feedbackB.gain.setValueAtTime(p.feedback, time);
    this.reverbWet.gain.setValueAtTime(p.reverb * 0.7, time);
  }
  disposeEffects() {
    this.lfo.stop();
    this.nodes.forEach((node) => node.disconnect());
  }
}
