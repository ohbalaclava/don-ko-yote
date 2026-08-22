// The lab's shared parameter vocabulary.
//
// Every engine consumes the SAME keys, so switching engine is a true A/B of the
// synthesis method rather than of two different control sets. The UI builds its
// sliders from these specs, so adding a control means adding a spec here (or an
// engine-specific one in the engine module), never editing the UI.

/**
 * @typedef {object} ParamSpec
 * @property {string} key - Property name on the parameter object.
 * @property {string} label - Slider label.
 * @property {number} min
 * @property {number} max
 * @property {number} step
 * @property {number} default
 * @property {string} [unit] - Shown next to the value.
 * @property {'linear'|'log'} [scale] - Slider travel mapping. Log for ranges
 *   spanning orders of magnitude (tension), so the low end stays controllable.
 * @property {string} group - Section heading in the UI.
 * @property {string} [hint] - One-line explanation shown under the control.
 */

/** @type {ParamSpec[]} */
export const SHARED_PARAMS = [
  {
    key: 'radius',
    label: 'Head radius',
    min: 0.06,
    max: 0.6,
    step: 0.005,
    default: 0.23,
    unit: 'm',
    group: 'Geometry',
    hint: 'Shime ~0.17, nagado ~0.23, odaiko ~0.5. Bigger = lower and longer.',
  },
  {
    key: 'depth',
    label: 'Shell depth',
    min: 0.05,
    max: 1.2,
    step: 0.01,
    default: 0.6,
    unit: 'm',
    group: 'Geometry',
    hint: 'Sets the body air resonance - the chest thump under the head tone.',
  },
  {
    key: 'thickness',
    label: 'Skin thickness',
    min: 0.4,
    max: 6,
    step: 0.05,
    default: 2.5,
    unit: 'mm',
    group: 'Membrane',
    hint: 'Mass per area. Thicker skin drops the pitch and dulls the attack.',
  },
  {
    key: 'tension',
    label: 'Skin tension',
    min: 500,
    max: 60000,
    step: 1,
    default: 11000,
    unit: 'N/m',
    scale: 'log',
    group: 'Membrane',
    hint: 'A shime is roped far tighter than a nagado. Pitch goes as its square root.',
  },
  {
    key: 'damping',
    label: 'Damping',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    group: 'Membrane',
    hint: '0 = wide open, 1 = heavily muted.',
  },
  {
    key: 'hitPos',
    label: 'Hit position',
    min: 0,
    max: 0.95,
    step: 0.01,
    default: 0.3,
    group: 'Excitation',
    hint: '0 = dead centre (round DON), 1 = rim (thin KA). Nothing else changes.',
  },
  {
    key: 'hardness',
    label: 'Bachi hardness',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    group: 'Excitation',
    hint: 'Contact patch: soft and wide (thud) to hard and narrow (click).',
  },
  {
    key: 'glide',
    label: 'Pitch glide',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    group: 'Excitation',
    hint: 'The head is stretched by the blow and relaxes - pitch starts sharp.',
  },
  {
    key: 'noiseMix',
    label: 'Attack noise',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    group: 'Excitation',
    hint: 'Level of the broadband stick-on-skin transient.',
  },
  {
    key: 'airMix',
    label: 'Body/air mix',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    group: 'Output',
    hint: 'How much of the shell resonance sits under the membrane modes.',
  },
  {
    key: 'velocity',
    label: 'Velocity',
    min: 1,
    max: 8,
    step: 1,
    default: 4,
    group: 'Output',
    hint: "Matches the app's 1-8 volume scale (4 = a normal accent).",
  },
  {
    key: 'reverbMix',
    label: 'Reverb',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.18,
    group: 'Output',
    hint: 'Wet level of the room. Listening effect only - the scopes stay dry.',
  },
  {
    key: 'reverbSize',
    label: 'Room size',
    min: 0.1,
    max: 6,
    step: 0.05,
    default: 1.2,
    unit: 's',
    group: 'Output',
    hint: 'Tail length to -60 dB. A dojo is ~1 s, a hall ~3 s.',
  },
  {
    key: 'reverbDamping',
    label: 'Room damping',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    group: 'Output',
    hint: '0 = bright and stony, 1 = soft and absorbent.',
  },
  {
    key: 'pan',
    label: 'Pan',
    min: -1,
    max: 1,
    step: 0.05,
    default: 0,
    group: 'Output',
    hint: 'Left/right hand placement.',
  },
];

/** Order the UI renders groups in. */
export const PARAM_GROUPS = ['Geometry', 'Membrane', 'Excitation', 'Output'];

/**
 * Builds a plain parameter object from a list of specs, using each default.
 * @param {ParamSpec[]} specs
 * @returns {Record<string, number>}
 */
export function defaultsFor(specs) {
  return Object.fromEntries(specs.map((spec) => [spec.key, spec.default]));
}

/**
 * Clamps a value into a spec's range and snaps it to the spec's step, so a
 * hand-edited preset JSON cannot push an engine outside what it can render.
 * @param {ParamSpec} spec
 * @param {number} value
 * @returns {number}
 */
export function clampParam(spec, value) {
  const v = Number.isFinite(value) ? value : spec.default;
  return Math.min(spec.max, Math.max(spec.min, v));
}

/**
 * Maps a 0..1 slider position to a parameter value, honouring `scale`.
 * @param {ParamSpec} spec
 * @param {number} t - 0..1
 * @returns {number}
 */
export function fromSlider(spec, t) {
  if (spec.scale === 'log') {
    const value = spec.min * Math.pow(spec.max / spec.min, t);
    return Math.round(value);
  }
  const raw = spec.min + t * (spec.max - spec.min);
  // Snap to the step so the readout does not show 0.23000000000000004.
  return Math.round(raw / spec.step) * spec.step;
}

/**
 * Inverse of `fromSlider`: parameter value to a 0..1 slider position.
 * @param {ParamSpec} spec
 * @param {number} value
 * @returns {number} 0..1
 */
export function toSlider(spec, value) {
  const v = clampParam(spec, value);
  if (spec.scale === 'log') {
    return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
  }
  return (v - spec.min) / (spec.max - spec.min);
}

/**
 * Peak gain for a velocity on the app's 1-8 scale. Deliberately the same curve
 * as `voiceParams` in src/audio/engine.js (~+4 dB per step, anchored so a
 * typical accent at 4 lands at 0.5) so a synth ported back into the app keeps
 * the dynamics the scores were written against.
 * @param {number} velocity - 1..8
 * @returns {number}
 */
export function velocityGain(velocity) {
  const v = Math.min(8, Math.max(1, velocity));
  return 0.5 * Math.pow(1.6, v - 4);
}

/**
 * Formats a value for the slider readout: enough decimals to see the step move,
 * no more.
 * @param {ParamSpec} spec
 * @param {number} value
 * @returns {string}
 */
export function formatValue(spec, value) {
  if (spec.scale === 'log' || spec.step >= 1) return String(Math.round(value));
  const decimals = spec.step >= 0.1 ? 1 : spec.step >= 0.01 ? 2 : 3;
  return value.toFixed(decimals);
}
