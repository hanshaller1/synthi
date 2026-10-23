/** Pure shared coefficient/transfer-function code. The complete factory is also
 * embedded in AudioWorklet, so the response display cannot drift to another model. */
export function createFilterDsp() {
  type Complex = [number, number];
  type Coeff = [number, number, number, number, number];
  type Settings = {
    native?: boolean; type: string; mode: string; character: number; frequency: number; resonance: number; detune: number; note: number;
    baseWidthEnabled: number; baseWidthBase: number; baseWidthWidth: number;
    filterPeakGain: number; filterMorph: number; filterCompensation: number; filterMix: number; filterKeytrack: number; drivePosition: number; drive: number;
    polarity: number; combFeedback: number; combDamping: number; combMix: number; combMode: number; combGain: number; combKeytrack: number; combFine: number; combSpread: number; combHighpass: number; combSaturation: number; combInterpolation: number;
  };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
  const scale = (a: Complex, v: number): Complex => [a[0] * v, a[1] * v];
  const div = (a: Complex, b: Complex): Complex => { const d = Math.max(1e-24, b[0] * b[0] + b[1] * b[1]); return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const pow = (a: Complex, n: number): Complex => { let v: Complex = [1, 0]; for (let i = 0; i < n; i++) v = mul(v, a); return v; };
  const choose = (n: number, k: number) => { let v = 1; for (let i = 1; i <= k; i++) v *= (n - i + 1) / i; return v; };
  const safe = (v: number) => !Number.isFinite(v) ? 0 : Math.abs(v) <= 8 ? v : Math.sign(v) * (8 + 8 * Math.tanh((Math.abs(v) - 8) / 8));
  function mode(p: Settings) {
    const name = p.type === "multimode" ? p.mode : p.type;
    return { name: name.startsWith("lp") ? "lowpass" : name.startsWith("hp") ? "highpass" : name === "bp" ? "bandpass" : name === "peak" ? "peaking" : name === "morph" ? "morph" : name,
      stages: Number(name.match(/[2468]$/)?.[0] ?? (name === "morph" ? 4 : 2)) / 2 };
  }
  function coefficients(type: string, hz: number, q: number, gain: number, sr: number, legacy = false, bpGain = 1, out: Coeff = [0, 0, 0, 0, 0]): Coeff {
    const w = 2 * Math.PI * clamp(hz, 5, sr * (legacy ? .5 : .499)) / sr, c = Math.cos(w), s = Math.sin(w);
    const physicalQ = legacy && (type === "lowpass" || type === "highpass") ? 10 ** (q / 20) : Math.max(.0001, q);
    const alpha = s / (2 * physicalQ);
    let a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha, b0: number, b1: number, b2: number;
    if (type === "lowpass") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === "highpass") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else if (type === "bandpass") { b0 = alpha * bpGain; b1 = 0; b2 = -b0; }
    else if (type === "notch") { b0 = 1; b1 = -2 * c; b2 = 1; }
    else { const A = 10 ** (gain / 40); b0 = 1 + alpha * A; b1 = -2 * c; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * c; a2 = 1 - alpha / A; }
    out[0] = b0 / a0; out[1] = b1 / a0; out[2] = b2 / a0; out[3] = a1 / a0; out[4] = a2 / a0; return out;
  }
  function transfer(b: Coeff, z: Complex): Complex {
    const z2 = mul(z, z);
    return div(add([b[0], 0], add(scale(z, b[1]), scale(z2, b[2]))), add([1, 0], add(scale(z, b[3]), scale(z2, b[4]))));
  }
  const onePole = (g: number, z: Complex): Complex => div(scale(add([1, 0], z), g), add([1, 0], scale(z, -(1 - 2 * g))));
  function width(p: Settings, sr: number) {
    const low = p.baseWidthBase <= 10.00001 ? 0 : clamp(p.baseWidthBase, 10, sr * .49);
    const high = p.baseWidthWidth >= 11.99999 ? sr / 2 : Math.min(sr / 2, Math.max(10, p.baseWidthBase) * 2 ** p.baseWidthWidth);
    return { low, high, loG: low ? Math.tan(Math.PI * low / sr) / (1 + Math.tan(Math.PI * low / sr)) : 0,
      hiG: high >= sr * .499 ? 1 : Math.tan(Math.PI * high / sr) / (1 + Math.tan(Math.PI * high / sr)) };
  }
  function frequency(p: Settings, sr: number, channel = 0) {
    const cents = p.detune + (p.note - 60) * 100 * (p.type === "comb" ? p.combKeytrack : p.filterKeytrack) + (p.type === "comb" ? p.combFine + (channel ? 1 : -1) * p.combSpread / 2 : 0);
    return clamp(p.frequency * 2 ** (cents / 1200), 20, sr * (p.type === "comb" ? .45 : p.native ? .5 : .499));
  }
  function stageQ(p: Settings, stage: number, stages: number, type: string) {
    const r = clamp(p.resonance / 20, 0, 1);
    if (p.character === 0) return type === "peaking" ? 1.2 : .0001 + p.resonance / stages;
    const base = p.character === 1 ? 1 / (2 * Math.cos((2 * stage + 1) * Math.PI / (4 * stages))) : Math.SQRT1_2;
    return Math.min(24, base * (stage === stages - 1 ? 1 + 10 * r : 1));
  }
  function ladder(p: Settings, sr: number) {
    const n = mode(p).stages * 2, g = Math.tan(Math.PI * frequency(p, sr) / sr), G = g / (1 + g);
    const critical = n > 2 ? 1 / Math.cos(Math.PI / n) ** n : 4;
    const k = critical * .94 * (p.character === 4 ? Math.sqrt(clamp(p.resonance / 20, 0, 1)) : clamp(p.resonance / 20, 0, 1));
    return { n, G, k, compensation: 1 + k * p.filterCompensation };
  }
  function interpolation(f: number, hd: boolean, out: number[] = []): number[] {
    if (hd) { out[0] = -f * (1 - f) * (2 - f) / 6; out[1] = (1 + f) * (1 - f) * (2 - f) / 2; out[2] = (1 + f) * f * (2 - f) / 2; out[3] = -(1 + f) * f * (1 - f) / 6; }
    else { out[0] = 1 - f; out[1] = f; }
    out.length = hd ? 4 : 2; return out;
  }
  function mainResponse(p: Settings, hz: number, sr: number): Complex {
    const m = mode(p), w = 2 * Math.PI * hz / sr, z: Complex = [Math.cos(w), -Math.sin(w)];
    const fc = frequency(p, sr), stages = m.stages;
    let lp: Complex = [1, 0], bp: Complex = [1, 0], hp: Complex = [1, 0];
    if ((p.character === 2 || p.character === 4) && m.name !== "peaking" && m.name !== "notch") {
      const l = ladder(p, sr), H = onePole(l.G, z), inverse = add([1, 0], scale(H, -1));
      const denominator = add([1, 0], scale(pow(H, l.n), l.k));
      lp = div(pow(H, l.n), denominator); hp = div(pow(inverse, l.n), denominator);
      bp = div(scale(mul(pow(H, stages), pow(inverse, stages)), 2 ** stages), denominator);
      lp = scale(lp, l.compensation); hp = scale(hp, l.compensation); bp = scale(bp, l.compensation);
    } else {
      const calc = (type: string): Complex => {
        let out: Complex = [1, 0];
        for (let stage = 0; stage < stages; stage++) {
          const q = stageQ(p, stage, stages, type), gain = p.filterPeakGain / stages;
          const boost = p.character ? 10 ** (p.resonance / (20 * stages)) : 1;
          out = mul(out, transfer(coefficients(type, fc, q, gain, sr, p.character === 0, type === "bandpass" ? boost : 1), z));
        }
        return scale(out, 1 + p.filterCompensation * p.resonance / 80);
      };
      if (m.name !== "morph") return calc(m.name);
      lp = calc("lowpass"); bp = calc("bandpass"); hp = calc("highpass");
    }
    if (m.name === "lowpass") return lp;
    if (m.name === "highpass") return hp;
    if (m.name === "bandpass") return bp;
    const morph = clamp(p.filterMorph * 2, 0, 2);
    return morph <= 1 ? add(scale(lp, 1 - morph), scale(bp, morph)) : add(scale(bp, 2 - morph), scale(hp, morph - 1));
  }
  function response(p: Settings, hz: number, sr: number, channel = 0): Complex {
    const w = 2 * Math.PI * hz / sr, z: Complex = [Math.cos(w), -Math.sin(w)];
    let wet: Complex;
    if (p.type === "comb") {
      const delay = sr / frequency(p, sr, channel), whole = Math.floor(delay), frac = delay - whole, hd = p.combInterpolation >= .5;
      let D: Complex = [0, 0];
      interpolation(frac, hd).forEach((weight, j) => D = add(D, scale([Math.cos(w * (whole + j - (hd ? 1 : 0))), -Math.sin(w * (whole + j - (hd ? 1 : 0)))], weight)));
      const alpha = 1 - Math.exp(-2 * Math.PI * Math.max(100, Math.min(sr * .45, p.combDamping)) / sr);
      let F = div([alpha, 0], add([1, 0], scale(z, -(1 - alpha))));
      if (p.combMode < .5 && p.combHighpass > 0) { const g = Math.tan(Math.PI * Math.min(sr * .45, p.combHighpass) / sr); F = mul(F, add([1, 0], scale(onePole(g / (1 + g), z), -1))); }
      const loop = mul(D, F), signed = p.combFeedback * p.polarity;
      wet = p.combMode >= .5 ? scale(add([1, 0], scale(loop, signed)), 1 / (1 + p.combFeedback)) : div([1 - p.combFeedback, 0], add([1, 0], scale(loop, -signed)));
      wet = add([1 - p.combMix, 0], scale(wet, p.combMix * 10 ** (p.combGain / 20)));
    } else wet = mainResponse(p, hz, sr);
    const mixed = add([1 - p.filterMix, 0], scale(wet, p.filterMix));
    const bw = width(p, sr);
    let B: Complex = [1, 0];
    if (bw.low) B = mul(B, add([1, 0], scale(onePole(bw.loG, z), -1)));
    if (bw.high < sr * .499) B = mul(B, onePole(bw.hiG, z));
    return mul(mixed, add([1 - p.baseWidthEnabled, 0], scale(B, p.baseWidthEnabled)));
  }
  class Core {
    sr: number;
    rings: Float64Array[];
    mask: number;
    position = 0;
    bw = Array.from({ length: 2 }, () => new Float64Array(2));
    states = Array.from({ length: 2 }, () => Array.from({ length: 3 }, () => new Float64Array(8)));
    ladderStates = [new Float64Array(8), new Float64Array(8)];
    low = [0, 0]; high = [0, 0];
    coeff: Coeff[][] = Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => [0, 0, 0, 0, 0] as Coeff));
    values = new Float64Array(3);
    combWeights = [[0, 0, 0, 0], [0, 0, 0, 0]];
    combHz = [NaN, NaN]; combWhole = [0, 0]; combHd = -1;
    damping = NaN; alpha = 0; highpass = NaN; highG = 0; resonanceGain = NaN; combAmplitude = 1;
    base = NaN; bandWidth = NaN;
    type = ""; modeName = ""; lastHz = NaN; lastRes = NaN; lastPeak = NaN; lastCharacter = NaN;
    lastCompensation = NaN; bandpassBoost = 1;
    postGain = NaN; postDrive = 1; postNormalization = 1;
    hpWeights = new Float64Array(9); bpWeights = new Float64Array(9); ladderWeights = new Float64Array(8);
    svf = Array.from({ length: 4 }, () => new Float64Array(4));
    topology = { name: "lowpass", stages: 1 };
    p!: Settings;
    bwConfig = { low: 0, high: 0, loG: 0, hiG: 1 };
    ladderConfig = { n: 4, G: .1, k: 0, compensation: 1 };
    constructor(sr: number) { this.sr = sr; let size = 1; while (size < sr / 20 + 8) size *= 2; this.rings = [new Float64Array(size), new Float64Array(size)]; this.mask = size - 1; }
    configure(p: Settings) {
      this.p = p;
      if (this.postGain !== p.drive) { this.postGain = p.drive; this.postDrive = 1 + p.drive * 14; this.postNormalization = Math.tanh(this.postDrive); }
      if (this.base !== p.baseWidthBase || this.bandWidth !== p.baseWidthWidth) {
        this.base = p.baseWidthBase; this.bandWidth = p.baseWidthWidth; this.bwConfig = width(p, this.sr);
      }
      if (p.type === "comb") {
        if (this.damping !== p.combDamping) { this.damping = p.combDamping; this.alpha = 1 - Math.exp(-2 * Math.PI * Math.max(100, Math.min(this.sr * .45, p.combDamping)) / this.sr); }
        if (this.highpass !== p.combHighpass) { this.highpass = p.combHighpass; const g = Math.tan(Math.PI * Math.min(this.sr * .45, p.combHighpass) / this.sr); this.highG = g / (1 + g); }
        if (this.resonanceGain !== p.combGain) { this.resonanceGain = p.combGain; this.combAmplitude = 10 ** (p.combGain / 20); }
        for (let ch = 0; ch < 2; ch++) {
          const hz = frequency(p, this.sr, ch);
          if (this.combHz[ch] !== hz || this.combHd !== p.combInterpolation) {
            this.combHz[ch] = hz; const delay = this.sr / hz, whole = Math.floor(delay); this.combWhole[ch] = whole;
            interpolation(delay - whole, p.combInterpolation >= .5, this.combWeights[ch]);
          }
        }
        this.combHd = p.combInterpolation; return;
      }
      if (this.type !== p.type || this.modeName !== p.mode) {
        this.type = p.type; this.modeName = p.mode; this.topology = mode(p); this.lastHz = NaN;
        const m = this.topology, n = m.stages * 2;
        for (let i = 0; i <= n; i++) { this.hpWeights[i] = choose(n, i) * (-1) ** i; this.bpWeights[i] = i >= m.stages ? choose(m.stages, i - m.stages) * (-1) ** (i - m.stages) * 2 ** m.stages : 0; }
      }
      const m = this.topology, hz = frequency(p, this.sr);
      if (hz === this.lastHz && p.resonance === this.lastRes && p.filterPeakGain === this.lastPeak && p.character === this.lastCharacter && p.filterCompensation === this.lastCompensation) return;
      this.lastHz = hz; this.lastRes = p.resonance; this.lastPeak = p.filterPeakGain; this.lastCharacter = p.character; this.lastCompensation = p.filterCompensation;
      const g = Math.tan(Math.PI * hz / this.sr);
      this.bandpassBoost = 10 ** (p.resonance / (20 * m.stages));
      if (p.character === 2 || p.character === 4) {
        this.ladderConfig = ladder(p, this.sr);
        const l = this.ladderConfig;
        for (let i = 0; i < l.n; i++) this.ladderWeights[i] = (1 - l.G) * l.G ** (l.n - i - 1);
      }
      for (let i = 0; i < m.stages; i++) {
        if (p.character === 3) { const k = 1 / stageQ(p, i, m.stages, m.name), a1 = 1 / (1 + g * (g + k)); const values = this.svf[i]; values[0] = k; values[1] = a1; values[2] = g * a1; values[3] = g * g * a1; }
        if ((p.character === 2 || p.character === 4) && m.name !== "peaking" && m.name !== "notch") continue;
        const banks = m.name === "morph" ? 3 : 1;
        for (let bank = 0; bank < banks; bank++) {
          const type = m.name === "morph" ? bank === 0 ? "lowpass" : bank === 1 ? "bandpass" : "highpass" : m.name;
          coefficients(type, hz, stageQ(p, i, m.stages, type), p.filterPeakGain / m.stages, this.sr, p.character === 0, type === "bandpass" && p.character ? 10 ** (p.resonance / (20 * m.stages)) : 1, this.coeff[bank][i]);
        }
      }
    }
    reset() { this.rings.forEach((r) => r.fill(0)); this.low.fill(0); this.high.fill(0); this.bw.forEach((v) => v.fill(0)); this.ladderStates.forEach((v) => v.fill(0)); this.states.forEach((v) => v.forEach((s) => s.fill(0))); }
    channel(input: number, ch: number) {
      const p = this.p, b = this.bwConfig, state = this.bw[ch];
      let x = input, v = x;
      if (b.low) { const out = b.loG * (v - state[0]) + state[0]; state[0] = 2 * out - state[0]; v -= out; }
      if (b.high < this.sr * .499) { const out = b.hiG * (v - state[1]) + state[1]; state[1] = 2 * out - state[1]; v = out; }
      x += (v - x) * p.baseWidthEnabled;
      let y: number;
      if (p.type === "comb") {
        const whole = this.combWhole[ch], hd = p.combInterpolation >= .5, ring = this.rings[ch], weights = this.combWeights[ch];
        let delayed = 0; for (let j = 0; j < weights.length; j++) delayed += ring[(this.position - whole - j + (hd ? 1 : 0)) & this.mask] * weights[j];
        this.low[ch] += this.alpha * (delayed - this.low[ch]);
        let feedback = this.low[ch];
        if (p.combMode < .5 && p.combHighpass > 0) {
          const low = this.highG * (feedback - this.high[ch]) + this.high[ch];
          this.high[ch] = 2 * low - this.high[ch]; feedback -= low;
        }
        if (p.combMode < .5 && p.combSaturation > 0) { const drive = 1 + p.combSaturation * 12; feedback = Math.tanh(feedback * drive) / drive; }
        const wet = p.combMode >= .5 ? (x + p.polarity * p.combFeedback * feedback) / (1 + p.combFeedback) : (1 - p.combFeedback) * x + p.polarity * p.combFeedback * feedback;
        ring[this.position] = safe(p.combMode >= .5 ? x : wet);
        y = (1 - p.combMix) * x + p.combMix * wet * this.combAmplitude;
      } else {
        const m = this.topology;
        if ((p.character === 2 || p.character === 4) && m.name !== "peaking" && m.name !== "notch") {
          const l = this.ladderConfig, states = this.ladderStates[ch];
          let S = 0; for (let i = 0; i < l.n; i++) S += states[i] * this.ladderWeights[i];
          let u = (x - l.k * S) / (1 + l.k * l.G ** l.n);
          const strength = p.character === 4 ? u >= 0 ? 1.4 : 1.1 : 1;
          u = Math.tanh(u * strength) / strength;
          let current = u, hp = u, bp = 0;
          for (let i = 0; i < l.n; i++) { const out = l.G * (current - states[i]) + states[i]; states[i] = safe(2 * out - states[i]); current = out;
            hp += this.hpWeights[i + 1] * out;
            bp += this.bpWeights[i + 1] * out;
          }
          const morph = clamp(p.filterMorph * 2, 0, 2);
          y = m.name === "lowpass" ? current : m.name === "highpass" ? hp : m.name === "bandpass" ? bp : morph <= 1 ? current * (1 - morph) + bp * morph : bp * (2 - morph) + hp * (morph - 1);
          y *= l.compensation;
        } else {
          const values = this.values, banks = m.name === "morph" ? 3 : 1;
          for (let bank = 0; bank < banks; bank++) {
            const chain = this.coeff[bank];
            let value = x; const state = this.states[ch][bank];
            for (let i = 0; i < m.stages; i++) { const c = chain[i], offset = i * 2;
              if (p.character === 3 && m.name !== "peaking") {
                const [k, a1, a2, a3] = this.svf[i], v3 = value - state[offset + 1];
                const bp = a1 * state[offset] + a2 * v3, lp = state[offset + 1] + a2 * state[offset] + a3 * v3;
                state[offset] = safe(2 * bp - state[offset]); state[offset + 1] = safe(2 * lp - state[offset + 1]);
                const hp = value - k * bp - lp, type = m.name === "morph" ? bank === 0 ? "lowpass" : bank === 1 ? "bandpass" : "highpass" : m.name;
                value = type === "lowpass" ? lp : type === "highpass" ? hp : type === "bandpass" ? k * bp * this.bandpassBoost : lp + hp;
              } else {
                const out = c[0] * value + state[offset];
                state[offset] = safe(c[1] * value - c[3] * out + state[offset + 1]); state[offset + 1] = safe(c[2] * value - c[4] * out); value = out;
              }
            }
            values[bank] = value;
          }
          const morph = clamp(p.filterMorph * 2, 0, 2);
          y = m.name === "morph" ? morph <= 1 ? values[0] * (1 - morph) + values[1] * morph : values[1] * (2 - morph) + values[2] * (morph - 1) : values[0];
          y *= 1 + p.filterCompensation * p.resonance / 80;
        }
      }
      let out = x + (y - x) * p.filterMix;
      if (p.drivePosition >= .5 && p.drive >= .005) { out = Math.tanh(out * this.postDrive) / this.postNormalization; }
      return safe(out);
    }
  }
  return { Core, response, mainResponse, coefficients, frequency, mode, width, mul, add, scale, div, pow, transfer, onePole };
}
export type FilterDspSettings = Parameters<ReturnType<typeof createFilterDsp>["response"]>[0];
