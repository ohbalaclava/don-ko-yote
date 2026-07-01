import { describe, it, expect } from 'vitest';
import {
  JIUCHI_PATTERNS,
  metronomeTicks,
  loopEvents,
  jiuchiPositions,
  resolveJiuchi,
  shiberokuOffset,
  shiberokuTicks,
  jiuchiTicks,
  jiuchiLoop,
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

describe('resolveJiuchi', () => {
  it("'auto' resolves to the piece's jiuchi", () => {
    expect(resolveJiuchi('auto', { jiuchi: 'Shiberoku' })).toBe('Shiberoku');
  });
  it('a named value resolves to itself', () => {
    expect(resolveJiuchi('Gobu Gobu', { jiuchi: 'Shiberoku' })).toBe('Gobu Gobu');
  });
});

describe('shiberokuOffset', () => {
  it('averages the 7:5 split and stays within the straight..swing band', () => {
    for (let b = 0; b < 32; b++) {
      const o = shiberokuOffset(b);
      // 6/12 (straight 6:6) .. 8/12 (swung 8:4), centred on 7/12.
      expect(o).toBeGreaterThanOrEqual(6 / 12 - 1e-9);
      expect(o).toBeLessThanOrEqual(8 / 12 + 1e-9);
    }
    expect(shiberokuOffset(0)).toBeCloseTo(7 / 12, 10);
  });

  it('moves in a wave — neighbouring beats drift by only a little', () => {
    let maxStep = 0;
    for (let b = 0; b < 64; b++) {
      maxStep = Math.max(maxStep, Math.abs(shiberokuOffset(b + 1) - shiberokuOffset(b)));
    }
    // No jumps: a single beat never shifts the off-beat by more than half of
    // the full straight↔swing band.
    expect(maxStep).toBeLessThan(2 / 12 / 2);
  });

  it('is deterministic and periodic', () => {
    expect(shiberokuOffset(8)).toBeCloseTo(shiberokuOffset(0), 10);
    expect(shiberokuOffset(13)).toBe(shiberokuOffset(13));
  });
});

describe('shiberokuTicks', () => {
  it('emits a perfect-time head and one drifting off-beat per beat', () => {
    const ticks = shiberokuTicks(8, 4, { headOnly: false, emphasise: false });
    // beat 0: head at 0, off at 4*offset(0); beat 1: head at 4, off at 4+4*offset(1)
    expect(ticks.map((t) => t.div)).toEqual([
      0,
      4 * shiberokuOffset(0),
      4,
      4 + 4 * shiberokuOffset(1),
    ]);
  });

  it('heads land exactly on the beat (perfect time)', () => {
    const ticks = shiberokuTicks(12, 4, { headOnly: false, emphasise: false });
    expect(
      ticks.filter((t) => Number.isInteger(t.div / 4) && t.div % 4 === 0).map((t) => t.div)
    ).toEqual([0, 4, 8]);
  });

  it('off-beat splits the beat ~7:5 (lands past the half-beat)', () => {
    const ticks = shiberokuTicks(4, 4, { headOnly: false, emphasise: false });
    const off = ticks[1].div;
    expect(off).toBeGreaterThan(2); // past 6:6
    expect(off).toBeLessThan(4); // before the next head
  });

  it('headOnly drops the off-beats', () => {
    const ticks = shiberokuTicks(8, 4, { headOnly: true, emphasise: false });
    expect(ticks.map((t) => t.div)).toEqual([0, 4]);
  });

  it('emphasise accents the head only', () => {
    const ticks = shiberokuTicks(4, 4, { headOnly: false, emphasise: true });
    expect(ticks[0].accent).toBe(true);
    expect(ticks[1].accent).toBe(false);
  });

  it('returns [] for non-positive totalDiv or time', () => {
    expect(shiberokuTicks(0, 4, { headOnly: false, emphasise: false })).toEqual([]);
    expect(shiberokuTicks(8, 0, { headOnly: false, emphasise: false })).toEqual([]);
  });
});

describe('jiuchiTicks', () => {
  it('dispatches Shiberoku to the wave builder', () => {
    expect(jiuchiTicks(8, 4, 'Shiberoku', { headOnly: false, emphasise: false })).toEqual(
      shiberokuTicks(8, 4, { headOnly: false, emphasise: false })
    );
  });

  it('dispatches standard jiuchis to the integer grid', () => {
    expect(jiuchiTicks(8, 4, 'Mitsu-uchi', { headOnly: false, emphasise: false })).toEqual(
      metronomeTicks(8, 4, {
        positions: JIUCHI_PATTERNS['Mitsu-uchi'],
        headOnly: false,
        emphasise: false,
      })
    );
  });

  it('falls back to the beat head for an unknown name', () => {
    expect(jiuchiTicks(8, 4, 'Nonsense', { headOnly: false, emphasise: false })).toEqual(
      metronomeTicks(8, 4, { positions: [1], headOnly: false, emphasise: false })
    );
  });
});

describe('jiuchiLoop', () => {
  const opts = { headOnly: false, emphasise: false };

  it('loops one beat for grid jiuchis', () => {
    expect(jiuchiLoop(4, 'Gobu Gobu', opts)).toEqual({
      ticks: [
        { div: 0, accent: false },
        { div: 2, accent: false },
      ],
      lengthDiv: 4,
    });
    expect(divs(jiuchiLoop(4, 'Mitsu-uchi', opts).ticks)).toEqual([0, 2, 3]);
    const shichisan = jiuchiLoop(3, 'Shichisan', opts);
    expect(divs(shichisan.ticks)).toEqual([0, 2]);
    expect(shichisan.lengthDiv).toBe(3);
  });

  it('headOnly reduces the cycle to a single head tick', () => {
    expect(jiuchiLoop(4, 'Mitsu-uchi', { headOnly: true, emphasise: false }).ticks).toEqual([
      { div: 0, accent: false },
    ]);
  });

  it('emphasise accents the head tick only', () => {
    const { ticks } = jiuchiLoop(4, 'Gobu Gobu', { headOnly: false, emphasise: true });
    expect(ticks.map((t) => t.accent)).toEqual([true, false]);
  });

  it('falls back to the beat head for an unknown name', () => {
    expect(jiuchiLoop(4, 'Nonsense', opts)).toEqual({
      ticks: [{ div: 0, accent: false }],
      lengthDiv: 4,
    });
  });

  it('loops Shiberoku over its full 16-beat wave period', () => {
    const { ticks, lengthDiv } = jiuchiLoop(4, 'Shiberoku', opts);
    expect(lengthDiv).toBe(16 * 4);
    expect(ticks).toHaveLength(32); // head + off-beat per beat
    // Heads exactly on the beat boundaries.
    expect(ticks.filter((t) => t.div % 4 === 0)).toHaveLength(16);
  });

  it('Shiberoku cycle joins seamlessly (wave is periodic at the loop length)', () => {
    const cycle = jiuchiLoop(4, 'Shiberoku', opts);
    // Ticks of beats 16..17 in a longer run equal beats 0..1 of the cycle,
    // shifted by one loop — so tiling the cycle reproduces the wave exactly.
    const long = jiuchiTicks(2 * cycle.lengthDiv, 4, 'Shiberoku', opts);
    const secondPass = long.slice(cycle.ticks.length);
    expect(secondPass).toHaveLength(cycle.ticks.length);
    secondPass.forEach((t, i) => {
      expect(t.div).toBeCloseTo(cycle.ticks[i].div + cycle.lengthDiv, 10);
      expect(t.accent).toBe(cycle.ticks[i].accent);
    });
  });

  it('headOnly Shiberoku still spans the full period', () => {
    const { ticks, lengthDiv } = jiuchiLoop(4, 'Shiberoku', { headOnly: true, emphasise: false });
    expect(lengthDiv).toBe(64);
    expect(divs(ticks)).toEqual(Array.from({ length: 16 }, (_, b) => b * 4));
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
