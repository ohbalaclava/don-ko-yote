// Impulse-response generation for the lab's room reverb.
//
// Pure: no Web Audio, so it is unit-testable and the caller decides what to do
// with the channels. A taiko is nearly always heard in a room, and a dry strike
// judged in isolation flatters engines with a short unnatural tail - the reverb
// is here so engines are compared under something like listening conditions.

/** Longest tail the lab will build, in seconds. Keeps IR rendering cheap. */
export const MAX_SECONDS = 6;

/** Level the tail is considered to have died at (-60 dB). */
const T60 = 0.001;

/**
 * Deterministic noise in [-1, 1). Seeded so an IR is reproducible and the two
 * channels can be decorrelated by seeding them differently.
 * @param {number} seed
 * @returns {() => number}
 */
export function noiseSource(seed) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x | 0) / 0x80000000;
  };
}

/**
 * Renders one channel of an exponentially-decaying noise tail.
 *
 * The tail is lowpassed by a one-pole whose cutoff falls as the tail decays:
 * real rooms lose high frequencies fastest (air absorption plus soft surfaces),
 * and a flat-spectrum noise tail reads as a metallic hiss instead of a room.
 *
 * @param {object} opts
 * @param {number} opts.sampleRate
 * @param {number} opts.seconds - Time to -60 dB.
 * @param {number} opts.predelay - Silence before the tail, in seconds.
 * @param {number} opts.damping - 0 = bright and open, 1 = dark and soft.
 * @param {number} opts.seed
 * @returns {Float32Array}
 */
export function tailChannel({ sampleRate, seconds, predelay, damping, seed }) {
  const pre = Math.max(0, Math.round(predelay * sampleRate));
  const body = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(pre + body);
  const noise = noiseSource(seed);
  const tau = seconds / Math.log(1 / T60);
  // Cutoff sweeps from open down to muffled over the life of the tail; a higher
  // damping both starts darker and arrives at the floor sooner.
  const startHz = 12000 - 9000 * damping;
  const endHz = 400 + 600 * (1 - damping);
  const sweepTau = seconds * (0.5 - 0.3 * damping);
  // A few ms of build-up: an IR that starts at full level clicks on convolution.
  const rise = Math.max(1, Math.round(0.004 * sampleRate));
  let lp = 0;

  for (let i = 0; i < body; i++) {
    const t = i / sampleRate;
    const hz = endHz + (startHz - endHz) * Math.exp(-t / sweepTau);
    const a = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
    lp += a * (noise() - lp);
    const envelope = Math.exp(-t / tau) * Math.min(1, i / rise);
    out[pre + i] = lp * envelope;
  }
  return out;
}

/**
 * Builds a stereo impulse response. The channels use different noise seeds so
 * the tail is decorrelated and reads as a space rather than a centred blur.
 *
 * @param {object} opts
 * @param {number} opts.sampleRate
 * @param {number} [opts.seconds] - Time to -60 dB; clamped to MAX_SECONDS.
 * @param {number} [opts.predelay]
 * @param {number} [opts.damping]
 * Normalised by ENERGY, not by peak: convolution sums the whole response, so a
 * peak-normalised noise tail comes out roughly sqrt(N) times too loud and the
 * wet level would swing wildly with room size. Unit energy per channel means a
 * wet gain of 0.5 really is half the dry level, whatever the room.
 *
 * @returns {Float32Array[]} Two channels, energy-normalised together.
 */
export function impulseResponse({ sampleRate, seconds = 1.2, predelay = 0.012, damping = 0.5 }) {
  const length = Math.min(MAX_SECONDS, Math.max(0.05, seconds));
  const channels = [1, 2].map((n) =>
    tailChannel({ sampleRate, seconds: length, predelay, damping, seed: n * 2654435761 })
  );

  let energy = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) energy += ch[i] * ch[i];
  if (energy > 0) {
    // One shared gain for both channels, so the stereo image is preserved.
    const g = 1 / Math.sqrt(energy / channels.length);
    for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  }
  return channels;
}
