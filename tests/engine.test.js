import { describe, it, expect } from 'vitest';
import { voiceParams } from '../src/audio/engine.js';

const NAGADO_FREQ = 130; // TAIKO_VOICE.Nagado base frequency

const params = (name, hand = 'R') => voiceParams({ name, hand, volume: 4 }, 'Nagado');

describe('voiceParams rim/centre classification', () => {
  it('classes ka/ki/ra syllables as rim (brighter, noisier, shorter)', () => {
    for (const name of ['KA', 'ka', 'KI', 'ki', 'RA', 'ra']) {
      const p = params(name);
      expect(p.freq, name).toBeCloseTo(NAGADO_FREQ * 1.5, 6);
      expect(p.noiseAmt, name).toBeGreaterThan(1);
    }
  });

  it('keeps left-hand and roll counterparts of centre hits as centre', () => {
    // kon/ko are the left hand of don/do; ken/ke of ten/te; ron/ro/re are rolls;
    // ku/zu/tsu are ghost notes. None of these are rim strikes.
    for (const name of ['KON', 'kon', 'KO', 'ko', 'KEN', 'ken', 'ke', 'ku', 'ron', 'ro', 're']) {
      const p = params(name);
      expect(p.freq, name).toBeCloseTo(NAGADO_FREQ, 6);
      expect(p.noiseAmt, name).toBeLessThan(1);
    }
  });

  it('classes plain centre hits as centre', () => {
    for (const name of ['DON', 'don', 'DO', 'do', 'TEN', 'ten', 'te', 'zu', 'tsu']) {
      expect(params(name).freq, name).toBeCloseTo(NAGADO_FREQ, 6);
    }
  });

  it('pans by hand', () => {
    expect(params('DON', 'L').pan).toBeLessThan(0);
    expect(params('DON', 'R').pan).toBeGreaterThan(0);
    expect(voiceParams({ name: 'SU', volume: 2 }, 'Nagado').pan).toBe(0);
  });
});
