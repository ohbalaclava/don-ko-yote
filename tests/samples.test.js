import { describe, it, expect } from 'vitest';
import { sampleKey } from '../src/audio/samples.js';

describe('sampleKey', () => {
  // Centre hits (vowel 'o') → DON sample; hand picks the L/R recording.
  const donCases = [
    ['DON', 'R', 'DON-R'],
    ['DO', 'R', 'DON-R'],
    ['do', 'R', 'DON-R'],
    ['KON', 'L', 'DON-L'],
    ['KO', 'L', 'DON-L'],
    ['ko', 'L', 'DON-L'],
    ['ro', 'L', 'DON-L'],
    ['ron', 'R', 'DON-R'],
    ["DO'", 'R', 'DON-R'],
  ];

  // Rim hits (vowel 'a') → KA sample.
  const kaCases = [
    ['KA', 'R', 'KA-R'],
    ["KA'", 'R', 'KA-R'],
    ['ka', 'L', 'KA-L'],
    ['RA', 'L', 'KA-L'],
    ['ra', 'L', 'KA-L'],
  ];

  // The ki click has its own hand-less recording.
  const kiCases = [
    ['KI', 'B', 'KI'],
    ['ki', 'B', 'KI'],
  ];

  for (const [name, hand, key] of [...donCases, ...kaCases, ...kiCases]) {
    it(`${name} (${hand}) → ${key}`, () => {
      expect(sampleKey({ name, hand })).toBe(key);
    });
  }

  it('hand B falls back to the R recording for DON/KA', () => {
    expect(sampleKey({ name: 'DON', hand: 'B' })).toBe('DON-R');
    expect(sampleKey({ name: 'KA', hand: 'B' })).toBe('KA-R');
  });

  it('returns null for a rest (no hand)', () => {
    expect(sampleKey({ name: 'SU' })).toBeNull();
    expect(sampleKey({ name: 'un', hand: null })).toBeNull();
  });
});
