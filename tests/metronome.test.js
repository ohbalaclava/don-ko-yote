import { describe, it, expect } from 'vitest';
import {
  JIUCHI_PATTERNS,
  metronomeTicks,
  loopEvents,
  jiuchiPositions,
} from '../src/data/metronome.js';

const divs = (ticks) => ticks.map((t) => t.div);

describe('jiuchiPositions', () => {
  it("'auto' follows the piece's jiuchi", () => {
    expect(jiuchiPositions('auto', { jiuchi: 'Mitsu-uchi' })).toEqual(
      JIUCHI_PATTERNS['Mitsu-uchi']
    );
  });

  it('resolves a named standard jiuchi', () => {
    expect(jiuchiPositions('Gobu Gobu', { jiuchi: 'Shichisan' })).toEqual(
      JIUCHI_PATTERNS['Gobu Gobu']
    );
  });

  it('falls back to the beat head for an unknown name', () => {
    expect(jiuchiPositions('Nonsense', { jiuchi: 'Nonsense' })).toEqual([1]);
  });
});

describe('loopEvents', () => {
  const pattern = [
    { startDiv: 0, name: 'DON' },
    { startDiv: 2, name: 'ka' },
  ];

  it('tiles the pattern every lengthDiv divisions', () => {
    const out = loopEvents(8, pattern, 4);
    expect(out.map((e) => e.div)).toEqual([0, 2, 4, 6]);
    expect(out.map((e) => e.name)).toEqual(['DON', 'ka', 'DON', 'ka']);
  });

  it('truncates the final repetition at totalDiv', () => {
    // Third tile starts at 8; its second event (div 10) falls past totalDiv 10.
    const out = loopEvents(10, pattern, 4);
    expect(out.map((e) => e.div)).toEqual([0, 2, 4, 6, 8]);
  });

  it('replaces startDiv with the absolute div, keeping other fields', () => {
    const out = loopEvents(4, [{ startDiv: 1, name: 'ka', volume: 2 }], 4);
    expect(out).toEqual([{ div: 1, name: 'ka', volume: 2 }]);
  });

  it('returns [] for a non-positive loop length or total', () => {
    expect(loopEvents(8, pattern, 0)).toEqual([]);
    expect(loopEvents(0, pattern, 4)).toEqual([]);
  });
});

describe('metronomeTicks', () => {
  it('ticks once per beat head when headOnly is set', () => {
    // 2 beats of 4 divisions each.
    const ticks = metronomeTicks(8, 4, { positions: [1, 3], headOnly: true, emphasise: false });
    expect(divs(ticks)).toEqual([0, 4]);
  });

  it('places ticks on the jiuchi subdivisions when not head-only', () => {
    // Mitsu-uchi = 1,3,4 over 2 straight beats (time 4): divs 0,2,3 then 4,6,7.
    const ticks = metronomeTicks(8, 4, {
      positions: JIUCHI_PATTERNS['Mitsu-uchi'],
      headOnly: false,
      emphasise: false,
    });
    expect(divs(ticks)).toEqual([0, 2, 3, 4, 6, 7]);
  });

  it('handles swing time (Shichisan = 1 & 3 of a 3-division beat)', () => {
    const ticks = metronomeTicks(6, 3, {
      positions: JIUCHI_PATTERNS.Shichisan,
      headOnly: false,
      emphasise: false,
    });
    expect(divs(ticks)).toEqual([0, 2, 3, 5]);
  });

  it('accents only beat heads when emphasise is set', () => {
    const ticks = metronomeTicks(8, 4, {
      positions: JIUCHI_PATTERNS['Gobu Gobu'], // [1, 3]
      headOnly: false,
      emphasise: true,
    });
    // Heads (div 0, 4) accented; off-beats (div 2, 6) not.
    expect(ticks).toEqual([
      { div: 0, accent: true },
      { div: 2, accent: false },
      { div: 4, accent: true },
      { div: 6, accent: false },
    ]);
  });

  it('excludes ticks at or past totalDiv (the end boundary)', () => {
    // 5 divisions, straight beat: beat 0 full, beat 1 only div 4 exists.
    const ticks = metronomeTicks(5, 4, { positions: [1, 3], headOnly: false, emphasise: false });
    expect(divs(ticks)).toEqual([0, 2, 4]);
  });

  it('skips subdivision positions beyond the time signature', () => {
    // Mitsu-uchi's position 4 does not exist in a 3-division (swing) beat.
    const ticks = metronomeTicks(3, 3, {
      positions: JIUCHI_PATTERNS['Mitsu-uchi'], // [1, 3, 4]
      headOnly: false,
      emphasise: false,
    });
    expect(divs(ticks)).toEqual([0, 2]);
  });

  it('returns no ticks for an empty or invalid sequence', () => {
    expect(metronomeTicks(0, 4, { positions: [1], headOnly: true, emphasise: false })).toEqual([]);
    expect(metronomeTicks(8, 0, { positions: [1], headOnly: true, emphasise: false })).toEqual([]);
  });
});
