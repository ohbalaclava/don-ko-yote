import { describe, it, expect } from 'vitest';
import {
  renderStrike,
  strikeLength,
  noiseSource,
  normalise,
  fadeTail,
} from '../src/lab/dsp/render.js';
import { modeTable } from '../src/lab/dsp/membrane.js';

const SR = 48000;
const NAGADO = {
  radius: 0.23,
  depth: 0.6,
  thickness: 2.5,
  tension: 11000,
  hitPos: 0.35,
  damping: 0.3,
  airMix: 0.5,
  hardness: 0.5,
};

/** Peak absolute sample over a slice, used to check envelope shape. */
const peak = (buf, from, to) => {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(buf[i]));
  return max;
};

describe('strikeLength', () => {
  it('covers the longest mode', () => {
    expect(strikeLength([{ decay: 0.1 }, { decay: 0.4 }])).toBeGreaterThan(0.4);
  });

  it('is clamped for an undamped monster', () => {
    expect(strikeLength([{ decay: 100 }])).toBeLessThanOrEqual(3);
  });

  it('never returns zero for a silent table', () => {
    expect(strikeLength([])).toBeGreaterThan(0);
  });
});

describe('noiseSource', () => {
  it('is deterministic for a seed and stays in range', () => {
    const a = noiseSource(7);
    const b = noiseSource(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});

describe('normalise', () => {
  it('scales the peak to 1', () => {
    expect(Array.from(normalise(Float32Array.from([0.25, -0.5])))).toEqual([0.5, -1]);
  });

  it('leaves an all-zero buffer alone', () => {
    expect(Array.from(normalise(new Float32Array(4)))).toEqual([0, 0, 0, 0]);
  });
});

describe('fadeTail', () => {
  it('ends at silence', () => {
    const buf = fadeTail(new Float32Array(1000).fill(1), SR);
    expect(buf[999]).toBeLessThan(0.05);
    expect(buf[0]).toBe(1);
  });
});

describe('renderStrike', () => {
  const modes = modeTable(NAGADO, SR);
  const buf = renderStrike(modes, { sampleRate: SR, glide: 0.4 });

  it('produces a finite, full-scale buffer', () => {
    expect(buf.length).toBeGreaterThan(0.1 * SR);
    expect(buf.every(Number.isFinite)).toBe(true);
    expect(peak(buf, 0, buf.length)).toBeCloseTo(1, 5);
  });

  it('decays: the attack is far louder than the tail', () => {
    const attack = peak(buf, 0, Math.floor(0.01 * SR));
    const tail = peak(buf, buf.length - Math.floor(0.01 * SR), buf.length);
    expect(attack).toBeGreaterThan(0.5);
    expect(tail).toBeLessThan(0.05);
  });

  it('is deterministic for the same modes and seed', () => {
    const again = renderStrike(modes, { sampleRate: SR, glide: 0.4 });
    expect(Array.from(again)).toEqual(Array.from(buf));
  });

  it('returns silence for an empty mode table', () => {
    const empty = renderStrike([], { sampleRate: SR });
    expect(peak(empty, 0, empty.length)).toBe(0);
  });

  it('rings longer when the drum is less damped', () => {
    const open = renderStrike(modeTable({ ...NAGADO, damping: 0 }, SR), { sampleRate: SR });
    const muted = renderStrike(modeTable({ ...NAGADO, damping: 0.9 }, SR), { sampleRate: SR });
    expect(open.length).toBeGreaterThan(muted.length);
  });

  it('puts more high-frequency energy in a hard-bachi strike', () => {
    const crossings = (b) => {
      let n = 0;
      for (let i = 1; i < Math.floor(0.02 * SR); i++) if (b[i - 1] < 0 !== b[i] < 0) n++;
      return n;
    };
    const soft = renderStrike(modeTable({ ...NAGADO, hardness: 0 }, SR), {
      sampleRate: SR,
      hardness: 0,
    });
    const hard = renderStrike(modeTable({ ...NAGADO, hardness: 1 }, SR), {
      sampleRate: SR,
      hardness: 1,
    });
    expect(crossings(hard)).toBeGreaterThan(crossings(soft));
  });
});
