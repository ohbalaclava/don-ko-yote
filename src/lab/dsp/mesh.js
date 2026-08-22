// 2D digital waveguide mesh: the membrane simulated directly rather than
// decomposed into modes.
//
// A rectangular grid of scattering junctions over a circular mask, with the
// rim clamped to zero (a rigid termination). Each junction updates from its
// four neighbours:
//
//   p[n+1] = 0.5 * (pN + pS + pE + pW) - p[n-1]
//
// The wave speed on such a mesh is 1/sqrt(2) grid units per iteration, which
// fixes the relationship between grid radius, iteration rate and pitch (see
// `iterationRate`). Everything the modal engine has to be told - mode ratios,
// hit-position weighting, the way a rim strike goes thin - falls out of the
// geometry instead. What it also brings, and modal cannot, is the mesh's own
// direction-dependent dispersion: the high partials drift off the ideal Bessel
// ratios, which is closer to what a real head does.

/** Wave speed on a rectangular 2D mesh, in grid units per iteration. */
export const MESH_SPEED = Math.SQRT1_2;

/** First zero of J0 - the same constant the modal model uses. */
const J01 = 2.405;

/** Hard ceiling on iterations per render, so a big drum cannot lock the tab. */
export const MAX_ITERATIONS = 60000;

/**
 * Fundamental of a circular mesh of this grid radius, in cycles per iteration.
 * @param {number} gridRadius - Radius in junctions.
 * @returns {number}
 */
export function meshFundamental(gridRadius) {
  return (J01 * MESH_SPEED) / (2 * Math.PI * gridRadius);
}

/**
 * Iterations per second needed for the mesh to sound at `f0`.
 *
 * This is the mesh's tuning knob: the grid fixes the *ratios* of the partials,
 * and the iteration rate slides the whole set to the pitch the physical
 * parameters asked for. Clamped to the output rate - past that the mesh would
 * need to run faster than we can represent.
 * @param {number} f0 - Target fundamental, Hz.
 * @param {number} gridRadius
 * @param {number} sampleRate - Output rate, the ceiling.
 * @returns {number} Iterations per second.
 */
export function iterationRate(f0, gridRadius, sampleRate) {
  return Math.min(sampleRate, f0 / meshFundamental(gridRadius));
}

/**
 * Builds the circular mask and neighbour geometry for a grid radius.
 * Junctions outside the circle are never updated and stay at zero, which is
 * exactly a rigid rim.
 * @param {number} gridRadius
 * @returns {{ size: number, centre: number, active: Int32Array }} `active` is
 *   the flat indices of the junctions inside the head, in scan order.
 */
export function buildMesh(gridRadius) {
  const size = gridRadius * 2 + 3; // one clamped ring of padding on each side
  const centre = (size - 1) / 2;
  const active = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const dx = x - centre;
      const dy = y - centre;
      if (Math.sqrt(dx * dx + dy * dy) <= gridRadius) active.push(y * size + x);
    }
  }
  return { size, centre, active: Int32Array.from(active) };
}

/**
 * Initial displacement of the head: a raised-cosine bump centred on the strike
 * point. Its width is the bachi's contact patch - a hard, narrow tip excites
 * the high modes, a soft wide one only pushes the low ones. This is the mesh's
 * equivalent of the modal engine's `contactTilt`, but it emerges from the
 * geometry rather than being applied as a filter.
 * @param {{ size: number, centre: number, active: Int32Array }} mesh
 * @param {number} gridRadius
 * @param {number} hitPos - 0 (centre) .. 1 (rim)
 * @param {number} hardness - 0 (soft/wide) .. 1 (hard/narrow)
 * @returns {Float32Array} Displacement per junction, peak 1.
 */
export function excitation(mesh, gridRadius, hitPos, hardness) {
  const { size, centre, active } = mesh;
  const hx = centre + hitPos * gridRadius * 0.97; // stay just inside the rim
  const hy = centre;
  const width = Math.max(1.2, gridRadius * (0.4 - 0.3 * hardness));
  const out = new Float32Array(size * size);
  for (let i = 0; i < active.length; i++) {
    const idx = active[i];
    const dx = (idx % size) - hx;
    const dy = Math.floor(idx / size) - hy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < width) out[idx] = 0.5 * (1 + Math.cos((Math.PI * d) / width));
  }
  return out;
}

/**
 * Runs the mesh and returns the signal at the pickup point, one sample per
 * iteration.
 *
 * Loss is applied per iteration as a flat multiplier, which decays every mode
 * at the same rate. Real membrane losses rise with frequency; rather than
 * filtering at every junction (four times the work per sample), the caller
 * applies a decaying low-pass to this output - see `dampOutput`.
 *
 * @param {object} opts
 * @param {number} opts.gridRadius
 * @param {number} opts.iterations
 * @param {number} opts.loss - Per-iteration amplitude multiplier (just under 1).
 * @param {number} opts.hitPos - 0..1
 * @param {number} opts.hardness - 0..1
 * @param {number} opts.pickup - 0..1, pickup distance from centre.
 * @returns {Float32Array} `iterations` samples.
 */
export function runMesh({ gridRadius, iterations, loss, hitPos, hardness, pickup }) {
  const mesh = buildMesh(gridRadius);
  const { size, centre, active } = mesh;

  // Zero initial velocity: the head starts displaced and is released, so the
  // previous frame is the same shape as the current one.
  let prev = excitation(mesh, gridRadius, hitPos, hardness);
  let curr = Float32Array.from(prev);
  let next = new Float32Array(size * size);

  // Pickup sits off the strike axis so it does not land on the same nodal
  // lines the strike excites, which would flatten the timbre.
  const angle = (2 * Math.PI) / 3;
  const pr = pickup * gridRadius * 0.9;
  const px = Math.round(centre + pr * Math.cos(angle));
  const py = Math.round(centre + pr * Math.sin(angle));
  const pickIdx = py * size + px;

  const out = new Float32Array(iterations);
  for (let n = 0; n < iterations; n++) {
    for (let i = 0; i < active.length; i++) {
      const idx = active[i];
      const sum = curr[idx - 1] + curr[idx + 1] + curr[idx - size] + curr[idx + size];
      next[idx] = loss * (0.5 * sum - prev[idx]);
    }
    const spare = prev;
    prev = curr;
    curr = next;
    next = spare;
    out[n] = curr[pickIdx];
  }
  return out;
}

/**
 * Resamples the mesh output from its iteration rate to the audio sample rate,
 * with the pitch glide applied as a time-varying read speed.
 *
 * Doing the glide here rather than in the mesh is the cheap way to get it: a
 * real head is stretched by the blow and relaxes, and reading the mesh faster
 * at the start of the strike is exactly that, without having to modulate the
 * wave speed of every junction.
 * @param {Float32Array} mesh - Mesh output, one sample per iteration.
 * @param {number} iterRate - Mesh iterations per second.
 * @param {number} sampleRate - Output rate.
 * @param {number} [glide=0] - 0..1, depth of the initial pitch lift.
 * @returns {Float32Array}
 */
export function resample(mesh, iterRate, sampleRate, glide = 0) {
  const depth = 0.6 * glide;
  const tau = 0.035;
  const base = iterRate / sampleRate;
  const length = Math.floor((mesh.length / base) * (1 - depth * 0.5)) || 1;
  const out = new Float32Array(length);
  let read = 0;
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(read);
    if (idx + 1 >= mesh.length) break;
    const frac = read - idx;
    out[i] = mesh[idx] * (1 - frac) + mesh[idx + 1] * frac;
    read += base * (1 + depth * Math.exp(-(i / sampleRate) / tau));
  }
  return out;
}

/**
 * Applies a low-pass whose cutoff falls over the life of the strike, in place.
 *
 * The mesh loses every mode at the same rate, but a real head loses its high
 * modes first - that difference is most of what separates a drum from a bell.
 * Sweeping the cutoff down is a coarse stand-in for per-mode damping, and it is
 * far cheaper than filtering inside the mesh loop.
 * @param {Float32Array} buf
 * @param {number} sampleRate
 * @param {number} decay - Ring time of the strike, seconds.
 * @param {number} [hardness=0.5] - 0..1, sets how bright the attack starts.
 * @returns {Float32Array} The same buffer.
 */
export function dampOutput(buf, sampleRate, decay, hardness = 0.5) {
  const startHz = 2000 + 9000 * hardness;
  const endHz = 180;
  let lp = 0;
  for (let i = 0; i < buf.length; i++) {
    const t = i / sampleRate;
    const cutoff = endHz + (startHz - endHz) * Math.exp(-t / (decay * 0.35));
    const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    lp = a * lp + (1 - a) * buf[i];
    buf[i] = lp;
  }
  return buf;
}

/**
 * Adds the shell's air resonance under the membrane signal, in place.
 * @param {Float32Array} buf
 * @param {number} sampleRate
 * @param {number} freq - Air mode frequency, Hz.
 * @param {number} level - 0..1.
 * @param {number} decay - Ring time, seconds.
 * @returns {Float32Array} The same buffer.
 */
export function addAirMode(buf, sampleRate, freq, level, decay) {
  if (!(level > 0)) return buf;
  const w = (2 * Math.PI * freq) / sampleRate;
  for (let i = 0; i < buf.length; i++) {
    buf[i] += level * Math.exp(-i / sampleRate / decay) * Math.sin(w * i);
  }
  return buf;
}
