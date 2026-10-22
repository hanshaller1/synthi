/** Bundled, deterministic synthesis resources. No network or third-party sample licenses required. */
export const WAVETABLE_TYPES = [
  "Analog",
  "Digital",
  "Formant",
  "Harmonic",
  "Metal",
  "Organ",
  "Chiptune",
  "Texture",
];
const tableNames = [
  ["Vintage saw", "Pulse atlas", "Triangle drift", "Super stack"],
  ["Glass logic", "Folded sine", "Phase mirror", "Digital teeth"],
  ["Vowel choir", "Talking wire", "Nasal reed", "Breath vowels"],
  ["Odd harmonics", "Even ladder", "Spectral comb", "Hollow bell"],
  ["Steel bloom", "Copper edge", "Chrome plate", "Rust circuit"],
  ["Drawbar tone", "Rotary pipes", "Cathedral", "Reed organ"],
  ["8-bit pulse", "Arcade ramp", "Console tri", "Pixel noise"],
  ["Spectral dust", "Air prism", "Fractal edge", "Ice cluster"],
];
export const WAVETABLES = tableNames.flatMap((names, family) =>
  names.map((name, variant) => ({
    id: family * 4 + variant,
    name,
    family: WAVETABLE_TYPES[family],
    variant,
  })),
);
export function wavetableSpectrum(
  index: number,
  position: number,
  warp = 0,
  formant = 0,
  brightness = 0.5,
) {
  const family = Math.floor(index / 4),
    variant = index % 4;
  const real = new Float32Array(129),
    imag = new Float32Array(129);
  for (let n = 1; n < imag.length; n++) {
    const odd = n % 2,
      v = variant + 1,
      morph = position;
    let a = 0;
    if (family === 0)
      a =
        ((variant === 1
          ? Math.sin(Math.PI * n * (0.1 + morph * 0.8))
          : variant === 2
            ? (odd * Math.sin((n * Math.PI) / 2)) / n
            : 1) /
          n) *
        (0.2 + morph * 0.8 + (n === 1 ? 1 - morph : 0));
    else if (family === 1)
      a =
        (Math.sin(n * (0.3 + morph * 1.8) * v) * Math.cos(n * n * 0.013 * v)) /
        n ** 0.8;
    else if (family === 2)
      a =
        (0.2 / n +
          Math.exp(
            -(
              ((n - (3 + morph * 12) * (0.6 + v * 0.23)) / (1.2 + morph * 2)) **
              2
            ),
          ) *
            0.8 +
          Math.exp(-(((n - 14 - v * 3 + morph * 9) / 3) ** 2)) * 0.35) /
        Math.sqrt(n);
    else if (family === 3)
      a =
        ((variant === 0
          ? odd
          : variant === 1
            ? 1 - odd
            : variant === 2
              ? n % (v + 1) === 1
                ? 1
                : 0.08
              : Math.sin(n * 0.9) ** 2) *
          (1 - morph * 0.6) +
          morph * Math.sin(n * v + 0.4)) /
        n;
    else if (family === 4)
      a =
        (Math.sin(n * n * (0.12 + morph * 0.5) * v) *
          (0.2 + Math.sin(n * 1.73) ** 2)) /
        n ** (0.5 + morph);
    else if (family === 5)
      a =
        ([1, 2, 3, 4, 6, 8, 12, 16].includes(n)
          ? 0.3 + Math.cos(n * 0.3 * v + morph * Math.PI) ** 2
          : 0.02) /
        n ** 0.65;
    else if (family === 6)
      a =
        (variant === 0
          ? Math.sin(n * Math.PI * (0.125 + morph * 0.5))
          : variant === 1
            ? 1
            : variant === 2
              ? odd / n
              : Math.sin(n * n * 9.13)) / n;
    else
      a =
        (Math.sin(n * n * (v * 0.71 + morph)) * Math.cos(n * (0.2 + morph))) /
        n ** (0.3 + v * 0.18);
    const focus = Math.exp(
      -(((n - (2 + formant * 42)) / (2 + formant * 8)) ** 2),
    );
    a *=
      n ** ((brightness - 0.5) * 1.8) *
      (1 - formant * 0.6 + formant * focus * 2);
    const phase = warp * n * n * 0.07;
    real[n] = a * Math.sin(phase);
    imag[n] = a * Math.cos(phase);
  }
  return { real, imag };
}
export const SAMPLE_CATEGORIES = [
  "Kick",
  "Hat",
  "Percussion",
  "Tom",
  "Ride",
  "Shaker",
  "Rimshot",
  "Snare",
  "FX",
  "Chord",
  "Lead",
  "Bass",
  "Acid",
  "Piano",
  "Stab",
  "Pad",
];
const sampleNames = [
  ["Sub anchor", "Punch circuit", "Dust kick", "Rubber foot"],
  ["Closed silver", "Open air", "Digital tick", "Soft brush"],
  ["Wood clave", "Metal conga", "Glass drop", "Bongo skin"],
  ["Low tom", "Mid tom", "High tom", "Electro tom"],
  ["Dark ride", "Bell ride", "Bright ride", "Broken cymbal"],
  ["Sand shaker", "Seed pod", "Cabasa", "Noise shake"],
  ["Dry rim", "Wood rim", "Metal rim", "Wide rim"],
  ["Analog snap", "White snare", "Brush snare", "Clap snare"],
  ["Riser", "Laser fall", "Impact", "Alien chatter"],
  ["Minor velvet", "Major glass", "Seventh keys", "Fifth brass"],
  ["Saw lead", "Pulse lead", "FM lead", "Reed lead"],
  ["Round sub", "Reese bass", "Pluck bass", "FM bass"],
  ["Resonant saw", "Rubber acid", "Square acid", "Liquid acid"],
  ["Felt keys", "Bright piano", "Electric tine", "Toy piano"],
  ["Brass stab", "Chord stab", "Organ stab", "Digital stab"],
  ["Warm horizon", "Glass pad", "Choir mist", "String cloud"],
];
export type SampleDescriptor = {
  id: string;
  name: string;
  category: string;
  variant: number;
  root: number;
  duration: number;
  granular: boolean;
};
export const SAMPLER_SAMPLES: SampleDescriptor[] = sampleNames.flatMap(
  (names, group) =>
    names.map((name, variant) => ({
      id: `sample-${group}-${variant}`,
      name,
      category: SAMPLE_CATEGORIES[group],
      variant,
      root:
        group === 0 || group === 3 || group === 11 || group === 12 ? 36 : 60,
      duration:
        group === 15
          ? 4
          : group === 8
            ? 2.5
            : group >= 9
              ? 2
              : group === 4
                ? 2
                : group === 5
                  ? 0.7
                  : 1,
      granular: false,
    })),
);
const grainNames = [
  ["Air tunnel", "Ocean foam", "Rain glass", "Wind chimes"],
  ["Choir cloud", "Vowel drift", "Breath reed", "Whisper field"],
  ["Piano particles", "String shimmer", "Harmonic dust", "Glass harmonica"],
  ["Steel scrape", "Copper bell", "Chain scatter", "Clockwork"],
  ["Digital swarm", "Bit crystals", "Modem chorus", "Circuit rain"],
  ["Wood grains", "Brush rhythm", "Seed rattle", "Drum fragments"],
  ["Sub fog", "Resonant wire", "Acid trails", "FM clusters"],
  ["Tape shimmer", "Broken orbit", "Ice drone", "Spectral sunrise"],
];
export const GRANULAR_SAMPLES: SampleDescriptor[] = grainNames.flatMap(
  (names, group) =>
    names.map((name, variant) => ({
      id: `grain-${group}-${variant}`,
      name,
      category: [
        "Nature",
        "Vocal",
        "Tonal",
        "Metal",
        "Digital",
        "Rhythmic",
        "Bass",
        "Atmosphere",
      ][group],
      variant,
      root: 60,
      duration: 4,
      granular: true,
    })),
);
export const SAMPLE_LIBRARY = [...SAMPLER_SAMPLES, ...GRANULAR_SAMPLES];
const tau = Math.PI * 2;
const sine = (f: number, t: number) => Math.sin(tau * f * t);
/** Render playable sample PCM on demand; every entry has a distinct synthesis recipe. */
export function sampleData(descriptor: SampleDescriptor, sampleRate: number) {
  const d = new Float32Array(Math.ceil(descriptor.duration * sampleRate));
  const v = descriptor.variant,
    group = descriptor.granular
      ? Number(descriptor.id.split("-")[1])
      : SAMPLE_CATEGORIES.indexOf(descriptor.category);
  const f = 440 * 2 ** ((descriptor.root - 69) / 12);
  let seed = 12347 + group * 431 + v * 7919,
    low = 0,
    high = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sampleRate;
    seed = (seed * 16807) % 2147483647;
    const noise = seed / 1073741823.5 - 1;
    low += 0.045 * (noise - low);
    high = noise - low;
    let y = 0;
    if (descriptor.granular) {
      const cycle = 0.5 + 0.5 * sine(0.15 + v * 0.09, t);
      if (group === 0)
        y =
          low * (0.4 + cycle) +
          sine(300 + 70 * v, t) *
            Math.exp(-((t % (0.31 + v * 0.13)) * 45)) *
            0.35;
      else if (group === 1)
        for (let n = 1; n <= 18; n++)
          y +=
            (sine(f * n + sine(0.3, t) * n, t) / n) *
            (Math.exp(-(((n - 4 - cycle * (3 + v)) / 2) ** 2)) +
              Math.exp(-(((n - 12) / 3) ** 2)) * 0.5);
      else if (group === 2)
        for (let n = 1; n < 9; n++)
          y +=
            (sine(f * (n + v * 0.002 * n * n), t) *
              Math.exp(-(t % (0.6 + v * 0.2)) * (n * 0.4 + 1))) /
            n;
      else if (group === 3)
        for (let n = 1; n < 8; n++)
          y +=
            (sine((117 + v * 53) * n * 1.413, t) *
              Math.exp(-(t % (0.19 + n * 0.027)) * 18)) /
            n;
      else if (group === 4)
        y =
          sine(f * 0.5, t + sine(61 + v * 41, t) * (0.001 + cycle * 0.006)) *
            0.55 +
          Math.round(noise * (2 + v * 2)) / 16;
      else if (group === 5)
        y =
          high * Math.exp(-(t % (0.11 + v * 0.037)) * 65) * 0.65 +
          sine(140 + v * 35, t) * Math.exp(-(t % 0.41) * 28);
      else if (group === 6)
        y =
          sine(65 + v * 17, t + sine(45 + v * 23, t) * cycle * 0.004) * 0.7 +
          sine(200 + v * 39, t) * 0.1;
      else
        for (let n = 1; n < 12; n++)
          y +=
            (sine(f * (n % 3 === 0 ? 1.5 : 1) * (1 + n * 0.001 * (v + 1)), t) *
              sine(0.03 + n * 0.013, t + n)) /
            12;
      y *= Math.min(1, t * 15, (descriptor.duration - t) * 15);
    } else if (group === 0) {
      const decay = 4 + v * 2,
        pitchDrop =
          ((130 + v * 40) / (30 + v * 8)) * (1 - Math.exp(-t * (30 + v * 8)));
      y =
        Math.tanh(
          (sine(38 + v * 6, t) * 0.4 +
            Math.sin(tau * ((38 + v * 6) * t + pitchDrop)) * 0.6) *
            (1 + v * 0.7),
        ) *
          Math.exp(-t * decay) +
        high * Math.exp(-t * 160) * 0.3;
    } else if (group === 1 || group === 4 || group === 5) {
      const decay =
        group === 4
          ? 2.3 + v
          : group === 5
            ? 15 + v * 3
            : v === 1
              ? 6
              : 30 + v * 12;
      y = high * 0.45;
      for (let n = 0; n < 6; n++)
        y += Math.sign(sine((1531 + n * 773) * (1 + v * 0.13), t)) * 0.05;
      y *= Math.exp(-t * decay);
      if (group === 5) y *= 0.3 + Math.abs(sine(18 + v * 7, t));
    } else if (group === 2 || group === 3 || group === 6) {
      const freq =
        group === 3
          ? 70 * 2 ** (v / 2)
          : group === 6
            ? 650 + v * 270
            : 180 + v * 110;
      y =
        (sine(freq, t) +
          sine(freq * 1.48, t) * 0.45 +
          noise * (group === 6 ? 0.7 : 0.15)) *
        Math.exp(-t * (group === 6 ? 70 : 9 + v * 2));
    } else if (group === 7) {
      const clap =
        v === 3
          ? Math.exp(-(t % 0.013) * 170) * Math.exp(-t * 14)
          : Math.exp(-t * (12 + v * 3));
      y =
        high * clap * 0.65 +
        (sine(160 + v * 23, t) + sine(310 + v * 41, t) * 0.3) *
          Math.exp(-t * 25) *
          0.5;
    } else if (group === 8) {
      y =
        v === 0
          ? high * (t / descriptor.duration) ** 2 +
            sine(200 + t * t * 600, t) * 0.2
          : v === 1
            ? sine(40 + 1800 * Math.exp(-t * 9), t) * Math.exp(-t * 4)
            : v === 2
              ? low * Math.exp(-t * 4) * 3 + sine(40, t) * Math.exp(-t * 2)
              : sine(200 + sine(4, t) * 170, t) * sine(33, t) * Math.exp(-t);
    } else {
      const chord =
        group === 9 || group === 14
          ? v === 0
            ? [0, 3, 7]
            : v === 1
              ? [0, 4, 7]
              : v === 2
                ? [0, 3, 7, 10]
                : [0, 7, 12]
          : [0];
      for (const interval of chord) {
        const root = f * 2 ** (interval / 12),
          envelope =
            group === 15
              ? Math.min(1, t * 3) * Math.exp(-t * 0.45)
              : Math.exp(
                  -t *
                    (group === 14
                      ? 7
                      : group === 11 || group === 12
                        ? 2.8
                        : 1.8),
                );
        let tone = 0;
        if (group === 13)
          for (let n = 1; n < 9; n++)
            tone +=
              (sine(root * n * (1 + n * n * 0.00004 * (v + 1)), t) / n ** 1.3) *
              Math.exp(-t * n * (0.7 + v * 0.2));
        else if (v === 2 && group !== 12)
          tone = sine(
            root,
            t + sine(root * 2.01, t) * 0.0015 * Math.exp(-t * 2),
          );
        else
          for (let n = 1; n < 17; n++) {
            const cutoff =
              group === 12
                ? 2 + 13 * Math.exp(-t * (4 + v))
                : group === 11
                  ? 3 + v * 2
                  : group === 15
                    ? 6
                    : 12;
            tone +=
              (sine(root * n * (group === 15 ? 1 + v * 0.0003 : 1), t) / n) *
              (v === 1 || v === 3 ? n % 2 : 1) *
              Math.exp(-n / cutoff);
          }
        y += (tone * envelope) / chord.length;
      }
    }
    d[i] =
      y * Math.min(1, t * 1000) * Math.min(1, (descriptor.duration - t) * 100);
  }
  let peak = 0;
  for (const x of d) peak = Math.max(peak, Math.abs(x));
  const scale = 0.85 / Math.max(0.1, peak);
  for (let i = 0; i < d.length; i++) d[i] *= scale;
  return d;
}
