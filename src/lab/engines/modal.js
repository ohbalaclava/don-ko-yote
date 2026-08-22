// Modal synthesis: the physical model itself, rendered.
//
// The mode table from dsp/membrane.js is rendered offline into an AudioBuffer
// and played back as a one-shot. Live oscillator banks were the obvious
// alternative, but a 17-mode bank costs 17 nodes per hit (bad in a fast roll)
// and gives no way to set each mode's starting phase, which is exactly what
// shapes the attack. Rendering also means the analyser can show the strike
// without capturing anything.
//
// Buffers are cached on the parameters that affect the waveform - velocity and
// pan are applied at playback, so changing dynamics never re-renders.
import { modeTable, fundamental, airMode } from '../dsp/membrane.js';
import { renderStrike } from '../dsp/render.js';
import { SHARED_PARAMS, velocityGain } from '../params.js';

/** Most rendered strikes to keep. Small: a slider sweep churns through these fast. */
const CACHE_LIMIT = 32;

/** @type {Map<string, AudioBuffer>} */
const cache = new Map();

/** Parameters that change the rendered waveform. Anything else is applied at playback. */
const RENDER_KEYS = [
  'radius',
  'depth',
  'thickness',
  'tension',
  'damping',
  'hitPos',
  'hardness',
  'glide',
  'noiseMix',
  'airMix',
];

/**
 * Cache key for a parameter set. Values are rounded before hashing so the
 * pointer-move flood from a slider drag does not render a new buffer for
 * differences far below audibility.
 * @param {Record<string, number>} params
 * @param {number} sampleRate
 * @returns {string}
 */
function cacheKey(params, sampleRate) {
  return sampleRate + '|' + RENDER_KEYS.map((k) => Number(params[k] ?? 0).toPrecision(5)).join(',');
}

/**
 * Renders (or returns cached) the strike waveform for these parameters.
 * @param {BaseAudioContext} ctx
 * @param {Record<string, number>} params
 * @returns {AudioBuffer}
 */
export function renderBuffer(ctx, params) {
  const key = cacheKey(params, ctx.sampleRate);
  const hit = cache.get(key);
  if (hit) {
    // Refresh LRU position.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const modes = modeTable(params, ctx.sampleRate);
  const data = renderStrike(modes, {
    sampleRate: ctx.sampleRate,
    glide: params.glide,
    hardness: params.hardness,
    noiseMix: params.noiseMix,
  });
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.copyToChannel(data, 0);

  cache.set(key, buffer);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return buffer;
}

/** Drops every cached buffer (used when the context is replaced). */
export function clearCache() {
  cache.clear();
}

export const modal = {
  id: 'modal',
  label: 'Modal',
  blurb:
    'Bessel modes of a circular membrane plus a shell air mode, rendered offline. Every control is a real physical quantity.',
  params: SHARED_PARAMS,

  /**
   * Schedules one strike.
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {object} opts
   * @param {number} opts.when - AudioContext time.
   * @param {Record<string, number>} opts.params
   */
  strike(ctx, destination, { when, params }) {
    const source = ctx.createBufferSource();
    source.buffer = renderBuffer(ctx, params);

    const gain = ctx.createGain();
    gain.gain.value = velocityGain(params.velocity);

    const panner = ctx.createStereoPanner();
    panner.pan.value = params.pan ?? 0;

    source.connect(gain);
    gain.connect(panner);
    panner.connect(destination);
    source.start(when);
  },

  /**
   * Values the UI shows alongside the sliders, so the physics stays visible.
   * @param {Record<string, number>} params
   * @param {number} sampleRate
   */
  readouts(params, sampleRate) {
    const modes = modeTable(params, sampleRate);
    return [
      { label: 'Fundamental', value: fundamental(params).toFixed(1) + ' Hz' },
      { label: 'Air mode', value: airMode(params).toFixed(1) + ' Hz' },
      { label: 'Active modes', value: String(modes.length) },
      {
        label: 'Ring time',
        value: (modes.length ? Math.max(...modes.map((m) => m.decay)) : 0).toFixed(2) + ' s',
      },
    ];
  },

  /**
   * The mode frequencies, for the spectrum display to mark. Lets you see
   * whether what you hear is what the model intended.
   * @param {Record<string, number>} params
   * @param {number} sampleRate
   */
  modeMarkers(params, sampleRate) {
    return modeTable(params, sampleRate).map((m) => ({
      freq: m.freq,
      amp: Math.abs(m.amp),
      air: !!m.air,
    }));
  },
};
