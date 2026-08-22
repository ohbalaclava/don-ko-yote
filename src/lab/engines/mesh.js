// Waveguide-mesh engine: simulate the head, do not describe it.
//
// The modal engine is told what the partials are; this one runs the membrane
// as a grid of scattering junctions and lets the partials happen. The payoff is
// the behaviour nobody has to hand-code - hit position, the way a rim strike
// goes thin, and the mesh's own dispersion pulling the high partials off the
// ideal Bessel ratios, which is closer to a real head than a clean mode bank.
//
// The cost is CPU: the mesh runs at its own iteration rate (set by the grid
// radius and the target pitch), so strikes are rendered offline into a buffer
// and cached, exactly like the modal engine.
import { fundamental, airMode, baseDecayFor, modeTable } from '../dsp/membrane.js';
import { normalise, fadeTail, addAttackNoise } from '../dsp/render.js';
import {
  runMesh,
  resample,
  dampOutput,
  addAirMode,
  iterationRate,
  meshFundamental,
  MAX_ITERATIONS,
} from '../dsp/mesh.js';
import { SHARED_PARAMS, velocityGain } from '../params.js';

/** Mesh-only controls, appended to the shared physical set. */
const MESH_PARAMS = [
  {
    key: 'gridRadius',
    label: 'Mesh radius',
    min: 6,
    max: 26,
    step: 1,
    default: 14,
    unit: 'junctions',
    group: 'Mesh',
    hint: 'Grid resolution. Coarse meshes disperse more (inharmonic, gritty); fine ones ring purer and cost more.',
  },
  {
    key: 'pickup',
    label: 'Pickup position',
    min: 0,
    max: 0.95,
    step: 0.01,
    default: 0.4,
    group: 'Mesh',
    hint: 'Where the head is listened to. Near the rim thins the tone the same way a rim strike does.',
  },
];

/** Rendered strikes are expensive here, so the cache is worth more than in modal. */
const CACHE_LIMIT = 24;

/** @type {Map<string, AudioBuffer>} */
const cache = new Map();

/** Parameters that change the rendered waveform; velocity and pan are applied at playback. */
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
  'gridRadius',
  'pickup',
];

/**
 * @param {Record<string, number>} params
 * @param {number} sampleRate
 * @returns {string}
 */
function cacheKey(params, sampleRate) {
  return sampleRate + '|' + RENDER_KEYS.map((k) => Number(params[k] ?? 0).toPrecision(5)).join(',');
}

/**
 * Everything the render needs, derived from the physical parameters. Split out
 * so the readouts can show the mesh's working without rendering anything.
 * @param {Record<string, number>} params
 * @param {number} sampleRate
 */
export function meshPlan(params, sampleRate) {
  const f0 = fundamental(params);
  const gridRadius = Math.round(params.gridRadius);
  const iterRate = iterationRate(f0, gridRadius, sampleRate);
  const decay = baseDecayFor(params.radius, params.damping);
  // exp(-t/tau) < 0.0005 => t > tau * 7.6
  const wanted = Math.ceil(Math.min(3, decay * 7.6) * iterRate);
  const iterations = Math.min(MAX_ITERATIONS, wanted);
  return {
    f0,
    gridRadius,
    iterRate,
    decay,
    iterations,
    truncated: iterations < wanted,
    // Loss per iteration that gives the wanted ring time.
    loss: Math.exp(-1 / (decay * iterRate)),
  };
}

/**
 * Renders (or returns cached) the strike waveform.
 * @param {BaseAudioContext} ctx
 * @param {Record<string, number>} params
 * @returns {AudioBuffer}
 */
export function renderBuffer(ctx, params) {
  const key = cacheKey(params, ctx.sampleRate);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const plan = meshPlan(params, ctx.sampleRate);
  const raw = runMesh({
    gridRadius: plan.gridRadius,
    iterations: plan.iterations,
    loss: plan.loss,
    hitPos: params.hitPos,
    hardness: params.hardness,
    pickup: params.pickup,
  });

  let data = resample(raw, plan.iterRate, ctx.sampleRate, params.glide);
  dampOutput(data, ctx.sampleRate, plan.decay, params.hardness);
  normalise(data);
  addAirMode(data, ctx.sampleRate, airMode(params), params.airMix * 0.8, plan.decay * 1.3);
  // Added after the mesh is normalised so the transient keeps its full
  // bandwidth - the mesh itself is band-limited to its iteration rate.
  if (params.noiseMix > 0) addAttackNoise(data, ctx.sampleRate, params.hardness, params.noiseMix);
  fadeTail(normalise(data), ctx.sampleRate);

  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.copyToChannel(data, 0);
  cache.set(key, buffer);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return buffer;
}

/** Drops every cached buffer. */
export function clearCache() {
  cache.clear();
}

export const mesh = {
  id: 'mesh',
  label: 'Mesh',
  blurb:
    'A 2D waveguide mesh of the head, run offline. Partials and hit-position behaviour emerge from the geometry, dispersion and all.',
  params: [...SHARED_PARAMS, ...MESH_PARAMS],

  /**
   * Schedules one strike.
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {object} opts
   * @param {number} opts.when
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
   * @param {Record<string, number>} params
   * @param {number} sampleRate
   */
  readouts(params, sampleRate) {
    const plan = meshPlan(params, sampleRate);
    const nyquist = plan.iterRate / 2;
    return [
      { label: 'Fundamental', value: plan.f0.toFixed(1) + ' Hz' },
      { label: 'Mesh rate', value: (plan.iterRate / 1000).toFixed(1) + ' kHz' },
      { label: 'Mesh ceiling', value: (nyquist / 1000).toFixed(1) + ' kHz' },
      {
        label: 'Iterations',
        value: plan.iterations + (plan.truncated ? ' (capped)' : ''),
      },
    ];
  },

  /**
   * Ideal-membrane mode frequencies, drawn as a reference. The mesh's own
   * partials drift off these as the grid gets coarser - seeing that gap is the
   * point of showing them.
   * @param {Record<string, number>} params
   * @param {number} sampleRate
   */
  modeMarkers(params, sampleRate) {
    const markers = modeTable(params, sampleRate).map((m) => ({
      freq: m.freq,
      amp: Math.abs(m.amp),
      air: !!m.air,
    }));
    return markers;
  },
};

/** Exposed for the readout tests: cycles per iteration at a grid radius. */
export { meshFundamental };
