import { describe, it, expect } from 'vitest';
import {
  TINT_HUES,
  tileTint,
  tileTintCss,
  tileBorderCss,
  tileTintPdfRgb,
} from '../src/tileColor.js';

describe('tileTint', () => {
  it('maps each hand × skin combo to its hue', () => {
    expect(tileTint({ name: 'DON', hand: 'R', volume: 4 })).toMatchObject(TINT_HUES['R-front']);
    expect(tileTint({ name: 'DON', hand: 'R', skin: 'back', volume: 4 })).toMatchObject(
      TINT_HUES['R-back']
    );
    expect(tileTint({ name: 'DON', hand: 'L', volume: 4 })).toMatchObject(TINT_HUES['L-front']);
    expect(tileTint({ name: 'DON', hand: 'L', skin: 'back', volume: 4 })).toMatchObject(
      TINT_HUES['L-back']
    );
  });

  it('returns null for sounds without a single committed hand', () => {
    expect(tileTint({ name: 'DON', hand: 'B', volume: 4 })).toBeNull();
    expect(tileTint({ name: 'SU' })).toBeNull(); // rest — no hand
    expect(tileTint({ name: '', silent: true })).toBeNull();
    expect(tileTint({ name: 'SU', skin: 'back' })).toBeNull(); // skin alone never tints
  });

  it('ramps alpha from 0.08 (vol 1) to 0.50 (vol 8)', () => {
    expect(tileTint({ name: 'DON', hand: 'R', volume: 1 }).alpha).toBeCloseTo(0.08);
    expect(tileTint({ name: 'DON', hand: 'R', volume: 8 }).alpha).toBeCloseTo(0.5);
    const alphas = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (volume) => tileTint({ name: 'DON', hand: 'R', volume }).alpha
    );
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeGreaterThan(alphas[i - 1]);
  });

  it('falls back to casing-derived volume when the sound has none', () => {
    // effectiveVolume: uppercase → 4, lowercase → 2
    expect(tileTint({ name: 'TEN', hand: 'R' }).alpha).toBeCloseTo(0.08 + 3 * 0.06);
    expect(tileTint({ name: 'te', hand: 'R' }).alpha).toBeCloseTo(0.08 + 1 * 0.06);
  });
});

describe('tileTintCss', () => {
  it('formats the tint as rgba()', () => {
    expect(tileTintCss({ name: 'DON', hand: 'R', volume: 4 })).toBe('rgba(239,68,68,0.26)');
  });

  it('passes null through', () => {
    expect(tileTintCss({ name: 'SU' })).toBeNull();
  });
});

describe('tileBorderCss', () => {
  it('uses the tint hue at a stronger alpha, capped at 0.9', () => {
    // vol 4: tint alpha 0.26 → border 0.61
    expect(tileBorderCss({ name: 'DON', hand: 'R', volume: 4 })).toBe('rgba(239,68,68,0.61)');
    // vol 8: tint alpha 0.50 → 0.85, under the cap
    expect(tileBorderCss({ name: 'DON', hand: 'R', volume: 8 })).toBe('rgba(239,68,68,0.85)');
  });

  it('passes null through', () => {
    expect(tileBorderCss({ name: 'SU' })).toBeNull();
  });
});

describe('tileTintPdfRgb', () => {
  it('pre-blends the alpha onto white', () => {
    // R-front at vol 4: alpha 0.26 → each channel = round(c*0.26 + 255*0.74)
    expect(tileTintPdfRgb({ name: 'DON', hand: 'R', volume: 4 })).toEqual({
      r: Math.round(239 * 0.26 + 255 * 0.74),
      g: Math.round(68 * 0.26 + 255 * 0.74),
      b: Math.round(68 * 0.26 + 255 * 0.74),
    });
  });

  it('passes null through', () => {
    expect(tileTintPdfRgb({ name: 'DON', hand: 'B', volume: 4 })).toBeNull();
  });
});
