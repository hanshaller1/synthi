// Focused FM CPU benchmark; no browser/audio device, framework or assertions.
// Measures the actual worklet DSP, excluding Web Audio routing / FX overhead.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

const dir = await mkdtemp(join(tmpdir(), "phase-fm-benchmark-"));
try {
  const outfile = join(dir, "fm.cjs");
  await build({ entryPoints: ["src/fm-worklet.ts"], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "silent" });
  const { fmProcessor } = createRequire(import.meta.url)(outfile);
  let Processor;
  const Base = class { port = { onmessage: null, postMessage() {}, close() {} }; };
  const register = (name, value) => { if (name === "phase-fm-voice") Processor = value; };
  const setupAt = performance.now();
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", fmProcessor)(Base, register, 48000);
  console.log(`FM DSP · Node ${process.version} · 48 kHz · 128 frames · tables ${(performance.now() - setupAt).toFixed(1)} ms`);
  const frames = 96;
  for (const algorithm of [0, 1, 2, 3, 4, 5]) for (const [count, layers, modulated = false] of [[1, 1], [8, 1], [16, 8], [32, 8], [16, 8, true]]) {
    const voices = Array.from({ length: count }, (_, n) => {
      const p = Object.fromEntries(Processor.parameterDescriptors.map((d) => [d.name, new Float32Array([d.defaultValue])]));
      p.active[0] = 1; p.frequency[0] = 110 * 2 ** (n / 12);
      for (const op of [1, 2, 3]) { p[`fm${op}Feedback`][0] = .95; p[`fm${op}Wave`][0] = n % 4; }
      if (modulated) {
        p.fm3Mode[0] = 1;
        for (const name of ["fm1Ratio", "fm2Fine", "fm3Hz", "unisonDetune", "unisonWidth"]) {
          const d = Processor.parameterDescriptors.find((d) => d.name === name);
          p[name] = Float32Array.from({ length: 128 }, (_, i) => d.defaultValue + Math.sin(i / 128 * Math.PI * 2) * (d.maxValue - d.defaultValue) * .15);
        }
      }
      p.fmIndex21[0] = 6; p.fmIndex32[0] = 6; p.fmIndex31[0] = 6;
      return { processor: new Processor({ processorOptions: { algorithm, layers } }), p, out: [[new Float32Array(128), new Float32Array(128)]] };
    });
    for (let block = 0; block < 96; block++) for (const v of voices) v.processor.process([], v.out, v.p);
    const elapsed = [];
    let peak = 0, nonfinite = 0;
    if (modulated) for (const v of voices) v.p.gate[0] = 0;
    for (let pass = 0; pass < 3; pass++) {
      const at = performance.now();
      for (let block = 0; block < frames; block++) for (const v of voices) {
        v.processor.process([], v.out, v.p);
        for (const channel of v.out[0]) for (const sample of channel) {
          if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample)); else nonfinite++;
        }
      }
      elapsed.push(performance.now() - at);
    }
    elapsed.sort((a, b) => a - b);
    const ms = elapsed[1], audioMs = frames * 128 / 48;
    console.log(JSON.stringify({ algorithm: algorithm + 1, voices: count, unison: layers, modulated, release: modulated, operators: count * layers * 3,
      cpuMs: +ms.toFixed(1), maxCpuMs: +elapsed[2].toFixed(1), audioMs, realtimeRatio: +(ms / audioMs).toFixed(3), peak: +peak.toFixed(4), nonfinite }));
  }
} finally { await rm(dir, { recursive: true, force: true }); }
