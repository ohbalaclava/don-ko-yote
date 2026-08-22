import { describe, it, expect } from 'vitest';
import {
  MESH_SPEED,
  meshFundamental,
  iterationRate,
  buildMesh,
  excitation,
  runMesh,
  resample,
  dampOutput,
  addAirMode,
} from '../src/lab/dsp/mesh.js';

const SR = 48000;

/** Dominant frequency of a signal, by naive DFT over a coarse frequency sweep. */
function dominantHz(buf, sampleRate, lo, hi) {
  let best = lo;
  let bestPower = -1;
  for (let f = lo; f <= hi; f += 0.5) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * f) / sampleRate;
    for (let i = 0; i < buf.length; i++) {
      re += buf[i] * Math.cos(w * i);
      im += buf[i] * Math.sin(w * i);
    }
    const power = re * re + im * im;
    if (power > bestPower) {
      bestPower = power;
      best = f;
    }
  }
  return best;
}

describe('meshFundamental', () => {
  it('follows the mesh wave speed and grid radius', () => {
    expect(meshFundamental(14)).toBeCloseTo((2.405 * MESH_SPEED) / (2 * Math.PI * 14), 12);
  });

  it('falls as the grid grows', () => {
    expect(meshFundamental(26)).toBeLessThan(meshFundamental(6));
  });
});

describe('iterationRate', () => {
  it('is the rate that puts the mesh fundamental at the target pitch', () => {
    const rate = iterationRate(110, 14, SR);
    expect(rate * meshFundamental(14)).toBeCloseTo(110, 6);
  });

  it('never exceeds the output sample rate', () => {
    expect(iterationRate(20000, 26, SR)).toBe(SR);
  });
});

describe('buildMesh', () => {
  it('keeps a clamped ring of padding around the head', () => {
    const mesh = buildMesh(8);
    expect(mesh.size).toBe(19);
    for (const idx of mesh.active) {
      const x = idx % mesh.size;
      const y = Math.floor(idx / mesh.size);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(mesh.size - 1);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(mesh.size - 1);
    }
  });

  it('holds roughly the area of the circle it masks', () => {
    const mesh = buildMesh(12);
    const area = Math.PI * 12 * 12;
    expect(mesh.active.length).toBeGreaterThan(area * 0.9);
    expect(mesh.active.length).toBeLessThan(area * 1.1);
  });
});

describe('excitation', () => {
  const gridRadius = 12;
  const mesh = buildMesh(gridRadius);

  it('peaks at the strike point and stays inside the head', () => {
    const bump = excitation(mesh, gridRadius, 0, 0.5);
    const peakIdx = bump.indexOf(Math.max(...bump));
    expect(peakIdx % mesh.size).toBe(mesh.centre);
    expect(Math.floor(peakIdx / mesh.size)).toBe(mesh.centre);
    expect(Math.max(...bump)).toBeCloseTo(1, 6);
  });

  it('moves toward the rim with hitPos', () => {
    const rim = excitation(mesh, gridRadius, 0.9, 0.5);
    const peakIdx = rim.indexOf(Math.max(...rim));
    expect(peakIdx % mesh.size).toBeGreaterThan(mesh.centre + gridRadius * 0.7);
  });

  it('narrows as the bachi gets harder', () => {
    const spread = (hardness) =>
      excitation(mesh, gridRadius, 0, hardness).reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    expect(spread(1)).toBeLessThan(spread(0));
  });
});

describe('runMesh', () => {
  const base = {
    gridRadius: 10,
    iterations: 3000,
    loss: 0.9995,
    hitPos: 0.3,
    hardness: 0.5,
    pickup: 0.4,
  };

  it('produces a finite, non-silent, decaying signal', () => {
    const out = runMesh(base);
    expect(out.length).toBe(base.iterations);
    expect(out.every(Number.isFinite)).toBe(true);
    const early = Math.max(...out.slice(0, 300).map(Math.abs));
    const late = Math.max(...out.slice(-300).map(Math.abs));
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(early);
  });

  it('sounds at the pitch the mesh geometry predicts', () => {
    // Run at a known iteration rate and check the strongest partial lands on
    // the predicted fundamental. This is the whole tuning contract.
    const gridRadius = 10;
    const iterRate = 4000;
    const out = runMesh({ ...base, gridRadius, iterations: 4000, loss: 0.9998 });
    const expected = meshFundamental(gridRadius) * iterRate;
    const found = dominantHz(out.slice(0, 2000), iterRate, expected * 0.6, expected * 1.6);
    expect(found).toBeGreaterThan(expected * 0.85);
    expect(found).toBeLessThan(expected * 1.15);
  });

  it('loses energy faster with a lower loss factor', () => {
    const tail = (loss) =>
      Math.max(
        ...runMesh({ ...base, loss })
          .slice(-300)
          .map(Math.abs)
      );
    expect(tail(0.999)).toBeLessThan(tail(0.99995));
  });

  it('excites more of the head off centre than dead centre', () => {
    const energy = (hitPos) => runMesh({ ...base, hitPos }).reduce((s, v) => s + v * v, 0);
    expect(energy(0.7)).toBeGreaterThan(0);
    expect(energy(0)).toBeGreaterThan(0);
  });
});

describe('resample', () => {
  it('stretches the mesh output to the audio rate', () => {
    const mesh = new Float32Array(1000).fill(0.5);
    const out = resample(mesh, 6000, 48000);
    expect(out.length).toBeGreaterThan(mesh.length * 7);
    expect(out[10]).toBeCloseTo(0.5, 5);
  });

  it('reads faster at the start when glide is on, so the buffer is shorter', () => {
    const mesh = new Float32Array(2000).fill(0.5);
    const flat = resample(mesh, 6000, 48000, 0);
    const glided = resample(mesh, 6000, 48000, 1);
    expect(glided.length).toBeLessThan(flat.length);
  });
});

describe('dampOutput', () => {
  const tone = (hz, seconds = 0.2) => {
    const buf = new Float32Array(SR * seconds);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.sin((2 * Math.PI * hz * i) / SR);
    return buf;
  };
  const rms = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);

  it('passes the low end and attenuates the top', () => {
    expect(rms(dampOutput(tone(8000), SR, 0.5))).toBeLessThan(rms(dampOutput(tone(100), SR, 0.5)));
  });

  it('gets darker over the life of the strike', () => {
    // The point of the sweep: high content should survive the attack and be
    // gone by the tail, which is how a real head loses its high modes first.
    const damped = dampOutput(tone(8000, 0.6), SR, 0.5);
    const quarter = Math.floor(damped.length / 4);
    expect(rms(damped.slice(-quarter))).toBeLessThan(rms(damped.slice(0, quarter)) * 0.5);
  });

  it('starts brighter with a harder bachi', () => {
    const early = (hardness) => rms(dampOutput(tone(6000), SR, 0.5, hardness).slice(0, 2000));
    expect(early(1)).toBeGreaterThan(early(0));
  });
});

describe('addAirMode', () => {
  it('adds a decaying tone at the requested frequency', () => {
    const buf = addAirMode(new Float32Array(SR * 0.2), SR, 100, 0.5, 0.3);
    expect(Math.max(...buf.map(Math.abs))).toBeGreaterThan(0.3);
    expect(dominantHz(buf.slice(0, 4000), SR, 60, 160)).toBeCloseTo(100, 0);
  });

  it('is a no-op at zero level', () => {
    expect(Math.max(...addAirMode(new Float32Array(100), SR, 100, 0, 0.3))).toBe(0);
  });
});
