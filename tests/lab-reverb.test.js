import { describe, it, expect } from 'vitest';
import { impulseResponse, tailChannel, noiseSource, MAX_SECONDS } from '../src/lab/dsp/reverb.js';

const SR = 48000;
const rms = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);

describe('noiseSource', () => {
  it('stays inside [-1, 1)', () => {
    const noise = noiseSource(7);
    for (let i = 0; i < 20000; i++) {
      const v = noise();
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic per seed and different across seeds', () => {
    const a = noiseSource(3);
    const b = noiseSource(3);
    const c = noiseSource(4);
    const first = a();
    expect(b()).toBe(first);
    expect(c()).not.toBe(first);
  });
});

describe('tailChannel', () => {
  const build = (opts = {}) =>
    tailChannel({ sampleRate: SR, seconds: 1, predelay: 0.01, damping: 0.5, seed: 1, ...opts });

  it('is silent through the predelay', () => {
    const ir = build({ predelay: 0.02 });
    expect(rms(ir.slice(0, Math.round(0.02 * SR)))).toBe(0);
  });

  it('is finite and bounded', () => {
    const ir = build();
    for (let i = 0; i < ir.length; i++) expect(Number.isFinite(ir[i])).toBe(true);
    expect(Math.max(...ir)).toBeLessThan(1);
  });

  it('decays to near silence by the end', () => {
    const ir = build();
    const tenth = Math.floor(ir.length / 10);
    expect(rms(ir.slice(-tenth))).toBeLessThan(rms(ir.slice(tenth, tenth * 2)) * 0.05);
  });

  it('starts from zero so convolution does not click', () => {
    const ir = build({ predelay: 0 });
    expect(Math.abs(ir[0])).toBeLessThan(Math.abs(ir[Math.round(0.004 * SR)]) * 0.2);
  });

  it('makes a longer room ring longer', () => {
    const short = build({ seconds: 0.5 });
    const long = build({ seconds: 3 });
    expect(long.length).toBeGreaterThan(short.length);
    // Sample both at the same wall-clock point, well inside the short tail.
    const at = Math.round(0.4 * SR);
    const window = Math.round(0.05 * SR);
    expect(rms(long.slice(at, at + window))).toBeGreaterThan(rms(short.slice(at, at + window)));
  });

  it('damping darkens the tail', () => {
    // A darker tail is more correlated sample to sample, so successive-sample
    // differences shrink - a cheap proxy for spectral centroid.
    const roughness = (b) => {
      let sum = 0;
      for (let i = 1; i < b.length; i++) sum += (b[i] - b[i - 1]) ** 2;
      return Math.sqrt(sum / b.length) / rms(b);
    };
    expect(roughness(build({ damping: 0.95 }))).toBeLessThan(roughness(build({ damping: 0.05 })));
  });
});

describe('impulseResponse', () => {
  it('returns two decorrelated channels', () => {
    const [left, right] = impulseResponse({ sampleRate: SR, seconds: 1 });
    expect(left.length).toBe(right.length);
    // Skip the predelay, where both channels are legitimately zero.
    const from = Math.round(0.05 * SR);
    let same = 0;
    for (let i = from; i < left.length; i++) if (left[i] === right[i]) same++;
    expect(same).toBeLessThan((left.length - from) * 0.01);
  });

  it('energy-normalises each channel to unity', () => {
    const channels = impulseResponse({ sampleRate: SR, seconds: 1 });
    for (const ch of channels) {
      const energy = ch.reduce((s, v) => s + v * v, 0);
      expect(energy).toBeGreaterThan(0.5);
      expect(energy).toBeLessThan(2);
    }
  });

  it('holds the wet level roughly steady as the room grows', () => {
    // Convolving white noise with the IR should land near the same level for a
    // small and a large room - that is the whole point of energy normalisation.
    const energyOf = (seconds) =>
      impulseResponse({ sampleRate: SR, seconds })[0].reduce((s, v) => s + v * v, 0);
    const small = energyOf(0.4);
    const large = energyOf(4);
    expect(Math.abs(large - small)).toBeLessThan(0.25);
  });

  it('clamps absurd room sizes', () => {
    const [ch] = impulseResponse({ sampleRate: SR, seconds: 100 });
    expect(ch.length).toBeLessThanOrEqual(Math.round((MAX_SECONDS + 0.05) * SR));
  });

  it('survives a zero-length room', () => {
    const [ch] = impulseResponse({ sampleRate: SR, seconds: 0 });
    expect(ch.length).toBeGreaterThan(0);
    for (let i = 0; i < ch.length; i++) expect(Number.isFinite(ch[i])).toBe(true);
  });
});
