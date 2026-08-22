// Offline renderer: turns a mode table (see membrane.js) into a one-shot strike
// waveform. Pure maths over Float32Arrays - no Web Audio - so it is testable and
// can run under an OfflineAudioContext, a worker, or plain Node.
//
// Rendering the whole strike up front (rather than running an oscillator bank
// live) buys exact per-mode decay and phase, costs nothing per hit during a fast
// roll, and hands the analyser a buffer it can draw without capturing anything.

/** Longest strike we will ever render, seconds. Keeps a silly damping=0, big-radius setting bounded. */
const MAX_LENGTH = 3.0;

/** Amplitude at which a decaying mode is considered finished. */
const SILENCE = 0.0005;

/**
 * How long the rendered buffer needs to be for these modes to have decayed into
 * silence, plus a little tail for the noise burst.
 * @param {Array<{ decay: number }>} modes
 * @returns {number} seconds
 */
export function strikeLength(modes) {
  let longest = 0;
  for (const mode of modes) longest = Math.max(longest, mode.decay);
  // exp(-t/tau) < SILENCE  =>  t > tau * ln(1/SILENCE); ln(2000) ~ 7.6
  return Math.min(MAX_LENGTH, Math.max(0.08, longest * Math.log(1 / SILENCE)));
}

/**
 * Simple xorshift PRNG so a given seed always renders the same noise burst.
 * Two strikes of "the same" preset should be identical - variation is added
 * deliberately by the engine (see `humanise`), not by the renderer.
 * @param {number} seed
 * @returns {() => number} Generator returning -1..1.
 */
export function noiseSource(seed = 1) {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x / 0x80000000;
  };
}

/**
 * Renders one strike into a mono Float32Array.
 *
 * Each mode is an exponentially decaying sinusoid. Two touches on top of the
 * ideal-membrane maths make it read as a struck drum rather than an additive
 * pad:
 *
 * - **Pitch glide.** A hard strike stretches the head, so the whole mode set
 *   starts sharp and settles as the displacement relaxes. This is the single
 *   most recognisable feature of a big drum hit.
 * - **Attack noise.** The stick-on-skin contact itself is broadband. It is
 *   rendered as a short, bandpass-ish noise burst whose brightness and length
 *   follow the same `hardness` control that tilts the mode amplitudes.
 *
 * @param {Array<{ freq: number, amp: number, decay: number }>} modes
 * @param {object} opts
 * @param {number} opts.sampleRate
 * @param {number} [opts.glide=0] - 0..1, depth of the post-strike pitch drop.
 * @param {number} [opts.hardness=0.5] - 0..1, bachi hardness.
 * @param {number} [opts.noiseMix=0.35] - 0..1, level of the attack transient.
 * @param {number} [opts.seed=1] - PRNG seed for the noise burst.
 * @returns {Float32Array} Normalised to a peak of 1.
 */
export function renderStrike(modes, opts) {
  const { sampleRate, glide = 0, hardness = 0.5, noiseMix = 0.35, seed = 1 } = opts;
  const length = Math.ceil(strikeLength(modes) * sampleRate);
  const out = new Float32Array(length);
  if (!modes.length) return out;

  // Pitch glide: f(t) = f * (1 + g * e^(-t/tau)). Integrating that over t gives
  // the phase, which is what we actually need to step the sinusoid:
  //   phase(t) = 2*pi*f * (t + g*tau*(1 - e^(-t/tau)))
  const glideDepth = 0.6 * glide; // up to +60% at the instant of impact
  const glideTau = 0.035;

  for (const mode of modes) {
    const w = 2 * Math.PI * mode.freq;
    const invDecay = 1 / mode.decay;
    const stop = Math.min(length, Math.ceil(mode.decay * Math.log(1 / SILENCE) * sampleRate));
    for (let i = 0; i < stop; i++) {
      const t = i / sampleRate;
      const phase = w * (t + glideDepth * glideTau * (1 - Math.exp(-t / glideTau)));
      out[i] += mode.amp * Math.exp(-t * invDecay) * Math.sin(phase);
    }
  }

  if (noiseMix > 0) addAttackNoise(out, sampleRate, hardness, noiseMix, seed);

  return fadeTail(normalise(out), sampleRate);
}

/**
 * Adds the stick-contact transient in place: white noise through a one-pole
 * low-pass (opened up by `hardness`) under a very short exponential envelope.
 * @param {Float32Array} out
 * @param {number} sampleRate
 * @param {number} hardness - 0..1
 * @param {number} mix - 0..1
 * @param {number} seed
 */
export function addAttackNoise(out, sampleRate, hardness, mix, seed = 1) {
  const rand = noiseSource(seed);
  // 1.5 kHz (soft, thuddy) up to 9 kHz (hard, clicky).
  const cutoff = 1500 + 7500 * hardness;
  const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  // A soft head also spreads the contact over more time: 12 ms down to 4 ms.
  const decay = 0.012 - 0.008 * hardness;
  const stop = Math.min(out.length, Math.ceil(decay * 8 * sampleRate));
  let lp = 0;
  for (let i = 0; i < stop; i++) {
    lp = a * lp + (1 - a) * rand();
    out[i] += lp * mix * Math.exp(-i / sampleRate / decay);
  }
}

/**
 * Scales a buffer in place so its peak is 1. Level is applied later, per strike,
 * from the velocity control - rendering at full scale keeps the cached buffer
 * reusable across dynamics.
 * @param {Float32Array} buf
 * @returns {Float32Array} The same buffer.
 */
export function normalise(buf) {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > 0) {
    const g = 1 / peak;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
  return buf;
}

/**
 * Applies a short fade-out over the last few milliseconds so a buffer that is
 * truncated (by MAX_LENGTH, or by an aggressive decay cutoff) cannot click.
 * @param {Float32Array} buf
 * @param {number} sampleRate
 * @param {number} [ms=8]
 * @returns {Float32Array} The same buffer.
 */
export function fadeTail(buf, sampleRate, ms = 8) {
  const n = Math.min(buf.length, Math.ceil((ms / 1000) * sampleRate));
  for (let i = 0; i < n; i++) buf[buf.length - n + i] *= 1 - i / n;
  return buf;
}
