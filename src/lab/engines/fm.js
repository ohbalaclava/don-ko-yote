// FM synthesis: the cheap reference point.
//
// Two operators plus the same attack-noise idea, all live nodes - no rendering,
// no cache. It cannot reproduce the inharmonic mode structure of a real head,
// so hit position and skin thickness are mapped heuristically rather than
// modelled; the interest is whether the extra realism of `modal` is actually
// audible or whether a punchy FM hit passes just as well in a score.
import { fundamental, airMode } from '../dsp/membrane.js';
import { SHARED_PARAMS, velocityGain } from '../params.js';

/** FM-only controls, appended to the shared physical set. */
const FM_PARAMS = [
  {
    key: 'fmRatio',
    label: 'Modulator ratio',
    min: 0.2,
    max: 6,
    step: 0.01,
    default: 1.59,
    group: 'FM',
    hint: 'Non-integer ratios give the inharmonic clang a drum head has. 1.59 is the first real membrane mode.',
  },
  {
    key: 'fmIndex',
    label: 'Modulation index',
    min: 0,
    max: 20,
    step: 0.1,
    default: 6,
    group: 'FM',
    hint: 'Attack brightness. Falls away fast, like the high modes of a real hit.',
  },
  {
    key: 'fmIndexDecay',
    label: 'Index decay',
    min: 0.005,
    max: 0.4,
    step: 0.005,
    default: 0.06,
    unit: 's',
    group: 'FM',
    hint: 'How quickly the clang collapses into the body tone.',
  },
];

let noiseBuffer = null;

/** One second of white noise, shared by every FM strike. */
function getNoiseBuffer(ctx) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

export const fm = {
  id: 'fm',
  label: 'FM',
  blurb:
    'Two-operator FM with pitch and index envelopes. Physical controls are mapped onto it heuristically - a fast, cheap comparison.',
  params: [...SHARED_PARAMS, ...FM_PARAMS],

  /**
   * Schedules one strike.
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {object} opts
   * @param {number} opts.when
   * @param {Record<string, number>} opts.params
   */
  strike(ctx, destination, { when, params }) {
    const f0 = fundamental(params);
    const decay = (0.35 + params.radius * 2.2) * (1 - 0.85 * params.damping);
    const gain = velocityGain(params.velocity);

    const panner = ctx.createStereoPanner();
    panner.pan.value = params.pan ?? 0;
    panner.connect(destination);

    // Carrier: the body tone, with the same stretched-head pitch glide the
    // modal engine renders.
    const carrier = ctx.createOscillator();
    carrier.frequency.setValueAtTime(f0 * (1 + 0.6 * params.glide), when);
    carrier.frequency.exponentialRampToValueAtTime(f0, when + 0.035);

    // Modulator: index scaled by hit position, since a rim hit is where a real
    // head goes inharmonic and bright.
    const modulator = ctx.createOscillator();
    modulator.frequency.value = f0 * params.fmRatio;
    const modDepth = ctx.createGain();
    const index = params.fmIndex * (0.5 + params.hitPos) * (0.5 + params.hardness);
    modDepth.gain.setValueAtTime(f0 * index, when);
    modDepth.gain.exponentialRampToValueAtTime(f0 * 0.01, when + params.fmIndexDecay);
    modulator.connect(modDepth);
    modDepth.connect(carrier.frequency);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(gain, when);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    carrier.connect(bodyGain);
    bodyGain.connect(panner);

    // A sub sine standing in for the shell's air mode.
    if (params.airMix > 0) {
      const sub = ctx.createOscillator();
      sub.frequency.value = airMode(params);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(gain * params.airMix * 0.8, when);
      subGain.gain.exponentialRampToValueAtTime(0.0001, when + decay * 1.3);
      sub.connect(subGain);
      subGain.connect(panner);
      sub.start(when);
      sub.stop(when + decay * 1.3 + 0.05);
    }

    // Attack transient, brightened by the same hardness control.
    if (params.noiseMix > 0) {
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500 + 7500 * params.hardness;
      const noiseGain = ctx.createGain();
      const noiseDecay = 0.012 - 0.008 * params.hardness;
      noiseGain.gain.setValueAtTime(gain * params.noiseMix * 1.4, when);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + noiseDecay * 6);
      noise.connect(lp);
      lp.connect(noiseGain);
      noiseGain.connect(panner);
      noise.start(when);
      noise.stop(when + noiseDecay * 8);
    }

    carrier.start(when);
    modulator.start(when);
    carrier.stop(when + decay + 0.05);
    modulator.stop(when + decay + 0.05);
  },

  /** @param {Record<string, number>} params */
  readouts(params) {
    const f0 = fundamental(params);
    return [
      { label: 'Carrier', value: f0.toFixed(1) + ' Hz' },
      { label: 'Modulator', value: (f0 * params.fmRatio).toFixed(1) + ' Hz' },
      { label: 'Sub (air)', value: airMode(params).toFixed(1) + ' Hz' },
      {
        label: 'Peak index',
        value: (params.fmIndex * (0.5 + params.hitPos) * (0.5 + params.hardness)).toFixed(1),
      },
    ];
  },

  /** @param {Record<string, number>} params */
  modeMarkers(params) {
    const f0 = fundamental(params);
    return [
      { freq: f0, amp: 1, air: false },
      { freq: f0 * params.fmRatio, amp: 0.6, air: false },
      { freq: airMode(params), amp: params.airMix, air: true },
    ];
  },
};
