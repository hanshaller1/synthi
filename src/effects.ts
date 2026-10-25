import type { Modulator } from "./modulation-worklet";
import { WorkletRack } from "./worklet-rack";
import { fxValues } from "./fx-spec";
import { clamp } from "./model";
import type { FxSlot, Patch } from "./model";
type Context = AudioContext | OfflineAudioContext;
type Values = Record<string, number>;
export function transfer(x: number, mode: string, v: Values) {
  if (mode === "soft" && (v.drive ?? 0.2) < 0.0001) return x;
  const drive = 1 + (v.drive ?? 0.2) * 35;
  if (mode === "hard")
    return clamp(x * drive, -(v.threshold ?? .7)*(1-Math.max(0,v.symmetry??0)*.95), (v.threshold ?? .7)*(1+Math.min(0,v.symmetry??0)*.95));
  if (mode === "fold")
    return (
      (2 / Math.PI) *
      Math.asin(
        Math.sin(
          (((x + (v.bias ?? 0)) * (v.folds ?? 2) * Math.PI) / 2) *
            (1 + (v.drive ?? 0) * 2),
        ),
      )
    );
  if (mode === "crush") {
    const levels = 2 ** Math.round(v.bits ?? 8);
    return (
      Math.round(clamp(x * (1 + (v.drive ?? 0) * 3), -1, 1) * levels) / levels
    );
  }
  if (mode === "diode") {
    const bias = v.bias ?? 0.1,
      a = v.asymmetry ?? 0.6;
    return (
      (Math.tanh((x + bias) * drive * (x < 0 ? 1 - a * 0.8 : 1)) -
        Math.tanh(bias * drive)) *
      0.8
    );
  }
  return Math.tanh(x * drive * (1 + (v.warmth ?? 0) * 0.5)) / Math.tanh(drive);
}
function curve(mode: string, v: Values) {
  const data = new Float32Array(8192);
  for (let i = 0; i < data.length; i++)
    data[i] = transfer((i * 2) / (data.length - 1) - 1, mode, v);
  return data;
}
function impulse(c: Context, mode: string, v: Values) {
  const seconds = v.decay,
    data = c.createBuffer(2, Math.ceil(seconds * c.sampleRate), c.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    let seed = 7361 + channel * 2311,
      low = 0;
    const out = data.getChannelData(channel);
    for (let i = 0; i < out.length; i++) {
      const t = i / c.sampleRate,
        x = i / out.length;
      seed = (seed * 16807) % 2147483647;
      const noise = seed / 1073741823.5 - 1;
      low += 0.13 * (noise - low);
      if (mode === "spring")
        out[i] =
          (Math.sin(
            2 *
              Math.PI *
              ((130 + v.tension * 300) * t +
                (50 + v.tension * 180) * Math.sqrt(t + 0.0001)),
          ) *
            0.35 +
            Math.sin(
              2 *
                Math.PI *
                (493 * t + 48 * Math.sqrt(t + 0.0001) + channel * 0.3),
            ) *
              0.2 +
            low * 0.45) *
          Math.exp(-6 * x);
      else if (mode === "gated")
        out[i] =
          noise * Math.min(1, t * 70) * clamp((v.gate - x) / 0.04, 0, 1) * 0.6;
      else if (mode === "room") {
        const early = [0.011, 0.019, 0.031, 0.047, 0.073].some(
          (r) => Math.abs(t - r * (1 + channel * 0.07)) < 1 / c.sampleRate,
        );
        out[i] =
          low * Math.exp(-8 * x) * 0.5 +
          (early ? (v.early ?? 0.5) * 1.4 * Math.exp(-t * 15) : 0);
      } else if (mode === "plate")
        out[i] =
          (noise - low * 0.6) * Math.exp(-4.5 * x) * Math.min(1, t * 180);
      else
        out[i] =
          (low * 0.7 + noise * 0.3) * Math.exp(-4 * x) * Math.min(1, t * 35);
    }
  }
  return data;
}

class FxStage {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private mode = "";
  private apply: (v: Values, set: (p: AudioParam, v: number) => void) => void =
    () => {};
  private graph: { gate: GainNode; dispose: () => void } | undefined;
  private retired = new Set<() => void>();
  private timers = new Set<number>();
  private previous = new Map<AudioParam, number>();
  constructor(
    private c: Context,
    readonly slot: FxSlot,
  ) {
    this.input = c.createGain();
    this.output = c.createGain();
    this.dry = c.createGain();
    this.wet = c.createGain();
    this.wet.gain.value = 0;
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
  }
  update(p: Patch, at: number, scheduled = false) {
    const mode = p[this.slot];
    if (this.mode !== mode) {
      this.build(mode, at);
      this.mode = mode;
      this.previous.clear();
    }
    const v = fxValues(p, mode);
    const set = (param: AudioParam, value: number) => {
      if (scheduled) param.setTargetAtTime(value, at, .003);
      else if (this.previous.get(param) !== value) {
        param.cancelScheduledValues(at);
        param.setTargetAtTime(value, at, 0.015);
        this.previous.set(param, value);
      }
    };
    const mix = p.fxEnabled[this.slot] ? v.mix : 0;
    set(this.dry.gain, 1 - mix);
    set(this.wet.gain, mix);
    this.apply(v, set);
  }
  private build(mode: string, at: number) {
    const c = this.c,
      nodes: AudioNode[] = [],
      oscillators: OscillatorNode[] = [];
    const node = <T extends AudioNode>(n: T): T => {
      nodes.push(n);
      return n;
    };
    const gain = (value = 1) => {
      const n = node(c.createGain());
      n.gain.value = value;
      return n;
    };
    const osc = () => {
      const o = node(c.createOscillator());
      oscillators.push(o);
      o.start(at);
      return o;
    };
    const feed = gain(),
      gate = gain(0);
    this.input.connect(feed);
    gate.connect(this.wet);
    const dispose = () => {
      for (const o of oscillators) {
        try {
          o.stop();
        } catch {
          /* Ended during disposal. */
        }
      }
      try {
        this.input.disconnect(feed);
      } catch {
        /* Already disposed. */
      }
      nodes.forEach((n) => n.disconnect());
    };
    if (this.graph) {
      const old = this.graph;
      old.gate.gain.cancelScheduledValues(at);
      old.gate.gain.setTargetAtTime(0, at, 0.008);
      if (c instanceof AudioContext) {
        this.retired.add(old.dispose);
        const timer = window.setTimeout(() => {
          old.dispose();
          this.retired.delete(old.dispose);
          this.timers.delete(timer);
        }, 80);
        this.timers.add(timer);
      } else old.dispose();
    }
    this.graph = { gate, dispose };
    gate.gain.setTargetAtTime(1, at, 0.008);
    if (this.slot === "saturationMode") {
      const shaper = node(c.createWaveShaper()),
        tone = node(c.createBiquadFilter()),
        dc = node(c.createBiquadFilter());
      shaper.oversample = mode === "crush" ? "none" : "2x";
      tone.type = "lowpass";
      dc.type = "highpass";
      dc.frequency.value = 15;
      feed.connect(shaper).connect(tone).connect(dc).connect(gate);
      let key = "";
      this.apply = (v, set) => {
        const next = JSON.stringify([
          v.drive,
          v.threshold,
          v.folds,
          v.bias,
          v.bits,
          v.asymmetry,
          v.warmth,
        ]);
        if (key !== next) {
          shaper.curve = curve(mode, v);
          key = next;
        }
        set(tone.frequency, v.tone ?? 20000);
      };
    } else if (this.slot === "modulationMode") {
      const lfo = osc(),
        depth = gain();
      lfo.connect(depth);
      if (mode === "phaser") {
        const filters = Array.from({ length: 4 }, () => {
          const f = node(c.createBiquadFilter());
          f.type = "allpass";
          return f;
        });
        feed.connect(filters[0]);
        filters.forEach((f, i) => {
          if (i < 3) f.connect(filters[i + 1]);
        });
        const phaseMix = gain(0.5),
          phaseDry = gain(0.5);
        filters[3].connect(phaseMix).connect(gate);
        feed.connect(phaseDry).connect(gate);
        const depths = filters.map((f) => {
          const g = gain();
          lfo.connect(g).connect(f.frequency);
          return g;
        });
        this.apply = (v, set) => {
          set(lfo.frequency, v.rate);
          filters.forEach((f, i) => {
            set(f.frequency, v.frequency * (i + 1));
            set(f.Q, v.resonance);
            set(depths[i].gain, v.frequency * (i + 1) * 0.6);
          });
        };
      } else if (mode === "tremolo") {
        const amp = gain();
        feed.connect(amp).connect(gate);
        depth.connect(amp.gain);
        this.apply = (v, set) => {
          set(lfo.frequency, v.rate);
          lfo.type = v.shape > 0.5 ? "square" : "sine";
          set(depth.gain, v.depth * 0.5);
          set(amp.gain, 1 - v.depth * 0.5);
        };
      } else {
        const delays = [node(c.createDelay(0.1)), node(c.createDelay(0.1))];
        const pans = [
          node(c.createStereoPanner()),
          node(c.createStereoPanner()),
        ];
        const regen = gain(0),
          sum = gain(0.5);
        sum.connect(gate);
        delays.forEach((d, i) => feed.connect(d).connect(pans[i]).connect(sum));
        delays[0].connect(regen).connect(delays[0]);
        const negative = gain(-1);
        depth.connect(delays[0].delayTime);
        depth.connect(negative).connect(delays[1].delayTime);
        this.apply = (v, set) => {
          set(lfo.frequency, v.rate);
          set(regen.gain, mode === "flanger" ? v.regen : 0);
          const base =
            mode === "flanger" ? 0.004 : mode === "vibrato" ? 0.012 : 0.02;
          delays.forEach((d) => set(d.delayTime, base));
          set(
            depth.gain,
            mode === "vibrato"
              ? Math.min(
                  0.009,
                  (2 ** (v.cents / 1200) - 1) /
                    (2 * Math.PI * Math.max(0.02, v.rate)),
                )
              : (mode === "flanger" ? 0.003 : 0.008) * v.depth,
          );
          pans.forEach((pan, i) =>
            set(pan.pan, mode === "chorus" ? (i ? 1 : -1) * v.width : 0),
          );
          // Vibrato must move both channels in phase; chorus uses opposite phases.
          set(negative.gain, mode === "chorus" ? -1 : 1);
        };
      }
    } else if (this.slot === "delayMode") {
      const a = node(c.createDelay(2)),
        b = node(c.createDelay(2));
      const feedbackA = gain(0),
        feedbackB = gain(0),
        filterA = node(c.createBiquadFilter()),
        filterB = node(c.createBiquadFilter());
      const shaperA = node(c.createWaveShaper()),
        shaperB = node(c.createWaveShaper());
      const panA = node(c.createStereoPanner()),
        panB = node(c.createStereoPanner());
      feed.connect(a);
      a.connect(panA).connect(gate);
      b.connect(panB).connect(gate);
      a.connect(feedbackA)
        .connect(filterA)
        .connect(shaperA)
        .connect(mode === "pingpong" ? b : a);
      if (mode === "pingpong")
        b.connect(feedbackB).connect(filterB).connect(shaperB).connect(a);
      const taps =
        mode === "multitap"
          ? [node(c.createDelay(2)), node(c.createDelay(2))]
          : [];
      const tapPans = taps.map((tap, i) => {
        const p = node(c.createStereoPanner()),
          amp = gain(0.5);
        p.pan.value = i ? 0.7 : -0.7;
        feed.connect(tap).connect(p).connect(amp).connect(gate);
        return p;
      });
      const wow = osc(),
        wowDepth = gain(0);
      wow.frequency.value = 0.8;
      wow.connect(wowDepth).connect(a.delayTime);
      let tapeAge = -1;
      this.apply = (v, set) => {
        set(a.delayTime, v.time);
        set(b.delayTime, v.time);
        set(feedbackA.gain, v.feedback);
        set(feedbackB.gain, v.feedback);
        [filterA, filterB].forEach((f) => {
          f.type = mode === "dub" ? "bandpass" : "lowpass";
          set(
            f.frequency,
            mode === "dub"
              ? v.frequency
              : mode === "tape"
                ? 9000 - v.age * 7800
                : (v.tone ?? 20000),
          );
          set(f.Q, mode === "dub" ? v.resonance : 0.5);
        });
        if (mode === "tape" && tapeAge !== v.age) {
          const shape = new Float32Array(4096),
            k = 1 + v.age * 3;
          for (let i = 0; i < shape.length; i++)
            shape[i] = Math.tanh(((i * 2) / (shape.length - 1) - 1) * k) / k;
          shaperA.curve = shape;
          shaperB.curve = shape;
          tapeAge = v.age;
        }
        set(wowDepth.gain, mode === "tape" ? v.wow * 0.002 : 0);
        set(panA.pan, mode === "pingpong" ? -v.width : 0);
        set(panB.pan, mode === "pingpong" ? v.width : 1);
        taps.forEach((tap, i) => {
          set(tap.delayTime, Math.min(1.9, v.time * v.spacing * (i + 1)));
          set(tapPans[i].pan, (i ? 1 : -1) * v.width);
        });
      };
    } else {
      const convolver = node(c.createConvolver()),
        pre = node(c.createDelay(0.2)),
        damp = node(c.createBiquadFilter());
      damp.type = "lowpass";
      feed.connect(pre).connect(convolver).connect(damp).connect(gate);
      let key = "";
      this.apply = (v, set) => {
        const next = [
          Math.round(v.decay * 20),
          Math.round((v.early ?? 0) * 30),
          Math.round((v.tension ?? 0) * 30),
          Math.round((v.gate ?? 0) * 30),
        ].join(":");
        if (key !== next) {
          convolver.buffer = impulse(c, mode, v);
          key = next;
        }
        set(pre.delayTime, v.predelay ?? 0);
        set(
          damp.frequency,
          mode === "plate" ? 3000 + v.brightness * 15000 : (v.damping ?? 9000),
        );
      };
    }
  }
  invalidate() {
    this.previous.clear();
  }
  dispose() {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.graph?.dispose();
    for (const dispose of this.retired) dispose();
    this.retired.clear();
    this.input.disconnect();
    this.output.disconnect();
    this.dry.disconnect();
    this.wet.disconnect();
  }
}
/** A true serial, reorderable rack. Each stage has its own dry/wet path and bypass. */
class LegacyEffectRack {
  private stages: Record<FxSlot, FxStage>;
  private order: FxSlot[] = [];
  private out: GainNode;
  constructor(
    context: Context,
    private rackInput: AudioNode,
    output: AudioNode,
  ) {
    this.stages = Object.fromEntries(
      ["saturationMode", "modulationMode", "delayMode", "reverbMode"].map(
        (slot) => [slot, new FxStage(context, slot as FxSlot)],
      ),
    ) as Record<FxSlot, FxStage>;
    this.out = context.createGain();
    this.out.connect(output);
  }
  updateEffects(p: Patch, previous: Patch | undefined, at: number) {
    if (!previous)
      for (const stage of Object.values(this.stages)) stage.invalidate();
    if (this.order.join() !== p.fxOrder.join()) {
      if (this.order.length)
        this.rackInput.disconnect(this.stages[this.order[0]].input);
      for (const stage of Object.values(this.stages)) stage.output.disconnect();
      this.order = [...p.fxOrder];
      this.rackInput.connect(this.stages[this.order[0]].input);
      this.order.forEach((slot, i) =>
        this.stages[slot].output.connect(
          i === 3 ? this.out : this.stages[this.order[i + 1]].input,
        ),
      );
      this.out.gain.setValueAtTime(0, at);
      this.out.gain.linearRampToValueAtTime(1, at + 0.015);
    }
    for (const stage of Object.values(this.stages)) stage.update(p, at);
  }
  scheduleEffects(p: Patch, time: number) {
    for (const stage of Object.values(this.stages)) stage.update(p, time, true);
  }
  disposeEffects() {
    if (this.order.length)
      try {
        this.rackInput.disconnect(this.stages[this.order[0]].input);
      } catch {
        /* External input may already be disconnected. */
      }
    for (const stage of Object.values(this.stages)) stage.dispose();
    this.out.disconnect();
  }
}

/** Existing sounds retain the native path until advanced controls are used. */
export class EffectRack {
  private reporting=false;
  setModulationReporting(enabled:boolean){this.reporting=enabled;this.worklet?.setReporting(enabled);}
  private lfoClock?:Modulator;
  setLfoClock(clock:Modulator){this.lfoClock=clock;}
  private legacy:LegacyEffectRack;private worklet?:WorkletRack;private advanced=false;private ready=false;
  private legacyFeed:GainNode;private legacyOut:GainNode;private advancedOut:GainNode;private patch?:Patch;private tempo=118;
  constructor(private context:Context,private feedInput:AudioNode,output:AudioNode){
    this.legacyFeed=context.createGain();this.legacyOut=context.createGain();this.advancedOut=context.createGain();this.advancedOut.gain.value=0;
    feedInput.connect(this.legacyFeed);this.legacyOut.connect(output);this.advancedOut.connect(output);this.legacy=new LegacyEffectRack(context,this.legacyFeed,this.legacyOut);
  }
  prepareEffects(p:Patch,tempo:number){this.ready=true;this.tempo=tempo;this.updateEffects(p,undefined,this.context.currentTime);}
  private select(p:Patch,at:number){
    const advanced=this.ready&&p.fxVersion===2;
    if(advanced&&!this.worklet){this.worklet=new WorkletRack(this.context,this.feedInput,this.advancedOut,this.lfoClock);this.worklet.setReporting(this.reporting);}
    if(advanced!==this.advanced){
      this.advanced=advanced;
      this.legacyOut.gain.setTargetAtTime(advanced?0:1,at,.008);
      this.legacyFeed.gain.setTargetAtTime(advanced?0:1,at,.008);
      this.advancedOut.gain.setTargetAtTime(advanced?1:0,at,.008);
    }
    return advanced;
  }
  updateEffects(p:Patch,previous:Patch|undefined,at:number){
    this.patch=p;
    if(this.select(p,at))this.worklet!.update(p,at,this.tempo);
    else this.legacy.updateEffects(p,previous,at);
  }
  scheduleEffects(p:Patch,time:number){
    if(this.select(p,time))this.worklet!.update(p,time,this.tempo,true);
    else this.legacy.scheduleEffects(p,time);
  }
  effectNote(id:number,note:number,velocity:number,p:Patch,at:number,seed?:number){if(this.select(p,at))this.worklet!.note(id,note,velocity,p,at,seed);}
  effectRelease(id:number,at:number){this.worklet?.release(id,at);}
  effectRetune(id:number,note:number,at:number){this.worklet?.retune(id,note,at);}
  effectLfoTrigger(at:number,seed?:number){this.worklet?.triggerLfo(at,seed);}
  effectPressure(value:number,at:number,note?:number){this.worklet?.pressure(value,at,note);}
  effectExpression(key:"tempo"|"wheel"|"pressure"|"bend",value:number,at:number){if(key==="tempo")this.tempo=value;this.worklet?.expression(key,value,at);}
  effectPanic(at:number){
    this.worklet?.panic(at,this.patch);
    for(const gain of [this.legacyOut.gain,this.legacyFeed.gain,this.advancedOut.gain])gain.cancelScheduledValues(at);
    if(this.patch){this.advanced=this.ready&&this.patch.fxVersion===2;this.legacyOut.gain.setTargetAtTime(this.advanced?0:1,at,.008);this.legacyFeed.gain.setTargetAtTime(this.advanced?0:1,at,.008);this.advancedOut.gain.setTargetAtTime(this.advanced?1:0,at,.008);}
  }
  get effectReading(){return this.advanced?this.worklet?.reading:undefined;}
  disposeEffects(){this.worklet?.dispose();this.legacy.disposeEffects();this.feedInput.disconnect(this.legacyFeed);this.legacyFeed.disconnect();this.legacyOut.disconnect();this.advancedOut.disconnect();}
}
