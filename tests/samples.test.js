import { describe, it, expect } from 'vitest';
import { sampleKey } from '../src/audio/samples.js';

describe('sampleKey', () => {
  describe('Nagado', () => {
    // Centre hits (vowel 'o') → DON sample; hand picks the L/R recording.
    const donCases = [
      ['DON', 'R', 'DON-R'],
      ['DO', 'R', 'DON-R'],
      ['do', 'R', 'DON-R'],
      ['don', 'R', 'DON-R'],
      ['KON', 'L', 'DON-L'],
      ['KO', 'L', 'DON-L'],
      ['ko', 'L', 'DON-L'],
      ['kon', 'L', 'DON-L'],
      ['ro', 'L', 'DON-L'],
      ['ron', 'R', 'DON-R'],
      ["DO'", 'R', 'DON-R'],
    ];

    // Rim hits (any non-'o', non-'i' vowel — ka/ra, and te/ke/ten/ken) → KA sample.
    const kaCases = [
      ['KA', 'R', 'KA-R'],
      ["KA'", 'R', 'KA-R'],
      ['ka', 'L', 'KA-L'],
      ['RA', 'L', 'KA-L'],
      ['ra', 'L', 'KA-L'],
      ['te', 'R', 'KA-R'],
      ['ten', 'R', 'KA-R'],
      ['ke', 'L', 'KA-L'],
      ['ken', 'L', 'KA-L'],
    ];

    // The ki click has its own hand-less recording.
    const kiCases = [
      ['KI', 'B', 'KI'],
      ['ki', 'B', 'KI'],
    ];

    for (const [name, hand, key] of [...donCases, ...kaCases, ...kiCases]) {
      it(`${name} (${hand}) → ${key}`, () => {
        expect(sampleKey({ name, hand }, 'Nagado')).toBe(key);
      });
    }

    it('hand B falls back to the R recording for DON/KA', () => {
      expect(sampleKey({ name: 'DON', hand: 'B' }, 'Nagado')).toBe('DON-R');
      expect(sampleKey({ name: 'KA', hand: 'B' }, 'Nagado')).toBe('KA-R');
    });

    it('returns null for a rest (no hand)', () => {
      expect(sampleKey({ name: 'SU' }, 'Nagado')).toBeNull();
      expect(sampleKey({ name: 'un', hand: null }, 'Nagado')).toBeNull();
    });
  });

  describe('Shime', () => {
    // Every strike syllable maps to the single Shime recording: the high-set
    // syllables (with apostrophe variants normalising onto them), and low-set
    // syllables (DON/ka), which reach a Shime via custom jiuchis.
    const hits = [
      'TEN',
      'KEN',
      'TE',
      'KE',
      'ten',
      'ken',
      'tsu',
      'ku',
      'te',
      'ke',
      're',
      "TE'",
      "tsu'",
      'DON',
      'kon',
      'ka',
      'RA',
    ];
    for (const name of hits) {
      it(`${name} → Shime`, () => {
        expect(sampleKey({ name, hand: 'R' }, 'Shime')).toBe('Shime');
      });
    }

    it('maps the buzz/press zu to its own recording', () => {
      expect(sampleKey({ name: 'zu', hand: 'R' }, 'Shime')).toBe('Shime-zu');
      expect(sampleKey({ name: "zu'", hand: 'R' }, 'Shime')).toBe('Shime-zu');
    });

    it('returns null for a rest', () => {
      expect(sampleKey({ name: 'SU' }, 'Shime')).toBeNull();
    });
  });

  describe('Katsugi', () => {
    it('a strike maps to the front recording by default', () => {
      expect(sampleKey({ name: 'TEN', hand: 'R' }, 'Katsugi')).toBe('Katsugi-front');
      expect(sampleKey({ name: 'ke', hand: 'L' }, 'Katsugi')).toBe('Katsugi-front');
      // Low-set syllables (via custom jiuchis) map like any other strike.
      expect(sampleKey({ name: 'DON', hand: 'R' }, 'Katsugi')).toBe('Katsugi-front');
    });

    it('a back-skin strike maps to the back recording', () => {
      expect(sampleKey({ name: 'TEN', hand: 'R', skin: 'back' }, 'Katsugi')).toBe('Katsugi-back');
    });

    it('maps the buzz/press zu to its own recording for both hands and skins', () => {
      expect(sampleKey({ name: 'zu', hand: 'R' }, 'Katsugi')).toBe('Katsugi-zu');
      expect(sampleKey({ name: 'zu', hand: 'L' }, 'Katsugi')).toBe('Katsugi-zu');
      expect(sampleKey({ name: "zu'", hand: 'R' }, 'Katsugi')).toBe('Katsugi-zu');
      expect(sampleKey({ name: 'zu', hand: 'R', skin: 'back' }, 'Katsugi')).toBe('Katsugi-zu');
    });
  });

  describe('Odaiko', () => {
    it('maps strikes to the L/R recording by hand', () => {
      expect(sampleKey({ name: 'DON', hand: 'R' }, 'Odaiko')).toBe('Odaiko-R');
      expect(sampleKey({ name: 'KON', hand: 'L' }, 'Odaiko')).toBe('Odaiko-L');
      expect(sampleKey({ name: 'do', hand: 'R' }, 'Odaiko')).toBe('Odaiko-R');
    });

    it('falls back to the R recording for hand B / missing', () => {
      expect(sampleKey({ name: 'KI', hand: 'B' }, 'Odaiko')).toBe('Odaiko-R');
    });

    it('returns null for a rest', () => {
      expect(sampleKey({ name: 'SU' }, 'Odaiko')).toBeNull();
    });
  });

  describe('kakegoe calls (taiko-independent)', () => {
    const cases = [
      ['HUP', 'HUP'],
      ['HA', 'HA'],
      ['SO', 'SO'],
      ['RE', 'RE'],
      ['sore', 'sore'],
      ["so're", 'sore'], // swing variant normalises onto the same recording
    ];
    for (const taiko of ['Nagado', 'Shime', 'Katsugi', 'Okedo', 'Odaiko']) {
      for (const [name, key] of cases) {
        it(`${name} on ${taiko} → ${key}`, () => {
          expect(sampleKey({ name }, taiko)).toBe(key);
        });
      }
    }

    it('SO/RE switch to the shorter recording once the duration is trimmed', () => {
      // Full-length call (default 4 straight / 3 swing) → the full recording.
      expect(sampleKey({ name: 'SO', duration: 4 }, 'Shime')).toBe('SO');
      expect(sampleKey({ name: 'RE', duration: 3 }, 'Nagado')).toBe('RE');
      // Trimmed → the short recording. SO uses SO-2 at 2 or below; RE uses RE-1 at 1.
      expect(sampleKey({ name: 'SO', duration: 2 }, 'Katsugi')).toBe('SO-2');
      expect(sampleKey({ name: 'SO', duration: 1 }, 'Odaiko')).toBe('SO-2');
      expect(sampleKey({ name: 'RE', duration: 1 }, 'Shime')).toBe('RE-1');
      // RE at 2 has no dedicated recording, so it keeps the full RE.
      expect(sampleKey({ name: 'RE', duration: 2 }, 'Shime')).toBe('RE');
    });

    it('the bracketed/silent [HU] is not a call', () => {
      expect(sampleKey({ name: '[HU]' }, 'Shime')).toBeNull();
    });

    it('the lowercase strike "re" is not the RE call', () => {
      // re has a hand and is a Shime strike, not the hand-less RE vocal call.
      expect(sampleKey({ name: 're', hand: 'L' }, 'Shime')).toBe('Shime');
    });
  });

  describe('Okedo (borrows Nagado drums)', () => {
    it('resolves drum hits to the Nagado recordings', () => {
      expect(sampleKey({ name: 'DON', hand: 'R' }, 'Okedo')).toBe('DON-R');
      expect(sampleKey({ name: 'ko', hand: 'L' }, 'Okedo')).toBe('DON-L');
      expect(sampleKey({ name: 'KA', hand: 'R' }, 'Okedo')).toBe('KA-R');
      expect(sampleKey({ name: 'ten', hand: 'L' }, 'Okedo')).toBe('KA-L');
      expect(sampleKey({ name: 'ki', hand: 'B' }, 'Okedo')).toBe('KI');
    });

    it('returns null for a rest', () => {
      expect(sampleKey({ name: 'SU' }, 'Okedo')).toBeNull();
    });
  });
});
