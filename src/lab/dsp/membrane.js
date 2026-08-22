// Pure physical model of a circular drum head. No Web Audio, no DOM - every
// export here is a plain function over numbers so it can be unit-tested and
// reused by any of the lab's synthesis engines.
//
// The model is the ideal circular membrane (Bessel modes) with three deliberate
// departures toward what a real taiko does: frequency-dependent damping, a
// coupled shell/air mode, and a post-strike pitch glide (see render.js).

/** Density of cow/horse hide, kg/m^3. Used to turn skin thickness into mass. */
export const SKIN_DENSITY = 1000;

/** Speed of sound in air at room temperature, m/s. */
export const SPEED_OF_SOUND = 343;

/**
 * Empirical factor pulling the shell's air resonance below the rigid-tube
 * value. A closed cylinder would resonate at c/2L, but a taiko is stopped at
 * both ends by compliant heads, and that compliance drags the coupled mode a
 * long way down - a 0.6 m nagado body thumps around 100 Hz, not 286 Hz. Tuned
 * by ear, not derived.
 */
export const AIR_COUPLING = 0.35;

/**
 * Vibration modes of an ideal circular membrane, as the ratio of each Bessel
 * zero j(m,n) to the fundamental j(0,1) = 2.405.
 *
 * `m` is the angular order: the number of nodal *diameters*. It is what makes
 * hit position audible - a strike at dead centre is radially symmetric and so
 * cannot excite any mode with m > 0 (see `modeAmplitude`).
 */
export const MEMBRANE_MODES = [
  { m: 0, n: 1, ratio: 1.0 },
  { m: 1, n: 1, ratio: 1.594 },
  { m: 2, n: 1, ratio: 2.136 },
  { m: 0, n: 2, ratio: 2.296 },
  { m: 3, n: 1, ratio: 2.653 },
  { m: 1, n: 2, ratio: 2.918 },
  { m: 4, n: 1, ratio: 3.156 },
  { m: 2, n: 2, ratio: 3.501 },
  { m: 0, n: 3, ratio: 3.6 },
  { m: 5, n: 1, ratio: 3.652 },
  { m: 3, n: 2, ratio: 4.06 },
  { m: 6, n: 1, ratio: 4.154 },
  { m: 1, n: 3, ratio: 4.23 },
  { m: 4, n: 2, ratio: 4.601 },
  { m: 7, n: 1, ratio: 4.646 },
  { m: 2, n: 3, ratio: 4.832 },
];

/** First zero of J0 - the constant in the fundamental-frequency formula. */
const J01 = 2.405;

/**
 * Bessel function of the first kind, J_m(x), by power series.
 *
 * Only used at setup time (a few dozen calls per parameter change), so the
 * series is fine; it converges quickly over the x < 20 range the mode table
 * needs. Terms are built incrementally to avoid factorial overflow.
 * @param {number} m - Non-negative integer order.
 * @param {number} x
 * @returns {number}
 */
export function besselJ(m, x) {
  if (x === 0) return m === 0 ? 1 : 0;
  const half = x / 2;
  // First term: (x/2)^m / m!
  let term = 1;
  for (let i = 1; i <= m; i++) term *= half / i;
  let sum = term;
  for (let k = 1; k < 40; k++) {
    // t(k) = -t(k-1) * (x/2)^2 / (k * (k + m))
    term *= (-half * half) / (k * (k + m));
    sum += term;
    if (Math.abs(term) < 1e-15) break;
  }
  return sum;
}

/**
 * Fundamental frequency of a circular membrane:
 *
 *   f0 = (j01 / 2*pi*a) * sqrt(T / sigma),  sigma = density * thickness
 *
 * This is the whole point of the pseudo-physical controls - a wider or thicker
 * head drops the pitch, more rope tension raises it, in the right proportions.
 * @param {object} p
 * @param {number} p.radius - Head radius, metres.
 * @param {number} p.tension - Surface tension, N/m.
 * @param {number} p.thickness - Skin thickness, millimetres.
 * @param {number} [p.density=SKIN_DENSITY] - Skin density, kg/m^3.
 * @returns {number} Frequency in Hz.
 */
export function fundamental({ radius, tension, thickness, density = SKIN_DENSITY }) {
  const sigma = density * (thickness / 1000);
  return (J01 / (2 * Math.PI * radius)) * Math.sqrt(tension / sigma);
}

/**
 * The shell's air resonance: the lowest axial mode of the enclosed body,
 * c / 2L, dragged down by AIR_COUPLING for the compliance of the two heads.
 * This is the deep chest thump a bare membrane model misses entirely, and the
 * reason a long odaiko sounds bigger than a shallow head of the same diameter.
 * @param {object} p
 * @param {number} p.depth - Shell length, metres.
 * @returns {number} Frequency in Hz.
 */
export function airMode({ depth }) {
  return (AIR_COUPLING * SPEED_OF_SOUND) / (2 * depth);
}

/**
 * How strongly a strike at `hitPos` excites one mode.
 *
 * The membrane's mode shape is J_m(j(m,n) * r/a) along the radius, so the
 * excitation of a point strike is that shape sampled at the strike radius. At
 * hitPos = 0 every m > 0 mode is nulled (J_m(0) = 0) leaving only the round,
 * axisymmetric modes; toward the rim the higher-m modes come in and the sound
 * thins out into a rim click.
 * @param {{ m: number, ratio: number }} mode
 * @param {number} hitPos - 0 = centre, 1 = rim.
 * @returns {number} Excitation weight. The sign is kept: it is the mode's
 *   starting phase, and it shapes the attack.
 */
export function modeAmplitude(mode, hitPos) {
  return besselJ(mode.m, mode.ratio * J01 * hitPos);
}

/**
 * Decay time for one mode.
 *
 * Real membrane losses (air radiation, internal friction) rise steeply with
 * frequency, so the top modes are gone within a few tens of milliseconds while
 * the fundamental rings on. Getting this slope right is most of the difference
 * between "drum" and "bell".
 * @param {number} freq - Mode frequency, Hz.
 * @param {number} f0 - Fundamental, Hz.
 * @param {number} baseDecay - Decay time of the fundamental, seconds.
 * @param {number} [slope=0.85] - Exponent on the frequency ratio.
 * @returns {number} Decay time in seconds (time to ~1/e).
 */
export function modeDecay(freq, f0, baseDecay, slope = 0.85) {
  return baseDecay * Math.pow(f0 / freq, slope);
}

/**
 * Base decay time of the fundamental, derived from the drum's size and the
 * user's damping control. Bigger heads carry more energy and ring longer;
 * `damping` (0 = open, 1 = heavily muted) scales that down.
 * @param {number} radius - metres
 * @param {number} damping - 0..1
 * @returns {number} seconds
 */
export function baseDecayFor(radius, damping) {
  const size = 0.35 + radius * 2.2; // ~0.72 s at shime size, ~1.45 s at odaiko
  return size * (1 - 0.85 * damping);
}

/**
 * Spectral tilt from the bachi's contact patch.
 *
 * A stick is not a point: it touches a finite area of the head, which spatially
 * low-passes the excitation and so damps the high modes. A hard, small tip
 * couples to a wider band (a sharp click) while a soft, wide one only pushes
 * the low modes (a dull thud). Modelled as a Gaussian roll-off whose corner
 * rises with `hardness`.
 * @param {number} freq - Mode frequency, Hz.
 * @param {number} f0 - Fundamental, Hz.
 * @param {number} hardness - 0 (soft/wide) .. 1 (hard/narrow).
 * @returns {number} Gain multiplier in 0..1.
 */
export function contactTilt(freq, f0, hardness) {
  // The corner runs from ~3x the fundamental (soft) to ~14x (hard), so the
  // control stays meaningful whatever the drum is tuned to.
  const corner = f0 * (3 + 11 * hardness);
  return Math.exp(-Math.pow(freq / corner, 2));
}

/**
 * Builds the full mode table for one strike: every membrane mode plus the
 * shell/air mode, each with its frequency, excitation amplitude and decay.
 * Modes above the Nyquist limit, or too quiet to hear, are dropped.
 * @param {object} p - The shared lab parameter set.
 * @param {number} p.radius - metres
 * @param {number} p.depth - metres
 * @param {number} p.thickness - millimetres
 * @param {number} p.tension - N/m
 * @param {number} p.hitPos - 0 (centre) .. 1 (rim)
 * @param {number} p.damping - 0..1
 * @param {number} p.airMix - 0..1, level of the shell/air mode
 * @param {number} p.hardness - 0..1, bachi hardness (spectral tilt)
 * @param {number} [sampleRate=48000] - Used only to drop inaudible modes.
 * @returns {Array<{ freq: number, amp: number, decay: number, m: number, n: number, air?: boolean }>}
 */
export function modeTable(p, sampleRate = 48000) {
  const f0 = fundamental(p);
  const baseDecay = baseDecayFor(p.radius, p.damping);
  const nyquist = sampleRate / 2;
  const modes = [];

  for (const mode of MEMBRANE_MODES) {
    const freq = f0 * mode.ratio;
    if (freq >= nyquist) continue;
    const amp = modeAmplitude(mode, p.hitPos) * contactTilt(freq, f0, p.hardness ?? 0.5);
    if (Math.abs(amp) < 1e-4) continue;
    modes.push({ freq, amp, decay: modeDecay(freq, f0, baseDecay), m: mode.m, n: mode.n });
  }

  // Shell/air mode: a slow, low resonance sitting under the membrane. It is not
  // position-dependent (the whole enclosed volume moves), so it gets a flat
  // amplitude and a long decay of its own.
  const air = airMode(p);
  if (p.airMix > 0 && air < nyquist) {
    modes.push({ freq: air, amp: p.airMix * 0.8, decay: baseDecay * 1.3, m: -1, n: 0, air: true });
  }

  return modes;
}
