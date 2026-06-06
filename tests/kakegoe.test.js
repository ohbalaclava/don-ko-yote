import { describe, it, expect } from 'vitest';
import { isKakegoe, baseSyllable, KAKEGOE_VOLUME } from '../src/data/kakegoe.js';

describe('baseSyllable', () => {
  it('strips articulation marks but keeps case', () => {
    expect(baseSyllable("TE'")).toBe('TE');
    expect(baseSyllable("so're")).toBe('sore');
    expect(baseSyllable('[HU]')).toBe('HU');
    expect(baseSyllable('')).toBe('');
    expect(baseSyllable(undefined)).toBe('');
  });
});

describe('isKakegoe', () => {
  for (const name of ['HUP', 'HA', 'SO', 'RE', 'sore', "so're"]) {
    it(`recognises ${name}`, () => expect(isKakegoe(name)).toBe(true));
  }

  it('does not match strike syllables or silent forms', () => {
    expect(isKakegoe('re')).toBe(false); // lowercase strike, not the RE call
    expect(isKakegoe('TEN')).toBe(false);
    expect(isKakegoe('[HU]')).toBe(false);
    expect(isKakegoe('SU')).toBe(false);
    expect(isKakegoe('')).toBe(false);
  });
});

describe('KAKEGOE_VOLUME', () => {
  it('is an audible volume in range', () => {
    expect(KAKEGOE_VOLUME).toBeGreaterThanOrEqual(1);
    expect(KAKEGOE_VOLUME).toBeLessThanOrEqual(8);
  });
});
