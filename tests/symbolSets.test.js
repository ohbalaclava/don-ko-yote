import { describe, it, expect } from 'vitest';
import {
  primaryStrike,
  symbolSetForTaiko,
  taikoGroupsForTime,
  timeForJiuchi,
} from '../src/data/symbolSets.js';

describe('primaryStrike', () => {
  it('is the big hit of the set: TEN for high drums, DON for low', () => {
    expect(primaryStrike('Shime', 4)?.name).toBe('TEN');
    expect(primaryStrike('Nagado', 4)?.name).toBe('DON');
  });

  it('resolves against the set for the given time (swing durations differ)', () => {
    expect(primaryStrike('Shime', 3)).toMatchObject({ name: 'TEN', duration: 3 });
    expect(primaryStrike('Shime', 4)).toMatchObject({ name: 'TEN', duration: 4 });
  });

  it('returns null when the taiko has no set at that time', () => {
    expect(primaryStrike('Nope', 4)).toBeNull();
  });
});

describe('timeForJiuchi', () => {
  it('resolves swing-native Shichisan to time 3', () => {
    expect(timeForJiuchi('Shichisan')).toBe(3);
  });

  it('resolves the straight jiuchis to time 4', () => {
    expect(timeForJiuchi('Gobu Gobu')).toBe(4);
    expect(timeForJiuchi('Mitsu-uchi')).toBe(4);
    expect(timeForJiuchi('Shiberoku')).toBe(4);
  });

  it('returns null for an unknown name', () => {
    expect(timeForJiuchi('Nonsense')).toBeNull();
  });
});

describe('symbolSetForTaiko', () => {
  it('finds a set by taiko at the given (straight) time', () => {
    const set = symbolSetForTaiko('Shime', 4);
    expect(set).toBeTruthy();
    expect(set.time).toBe(4);
    expect(set.taiko.some((t) => t.name === 'Shime')).toBe(true);
  });

  it('finds a low-family taiko at straight time', () => {
    const set = symbolSetForTaiko('Nagado', 4);
    expect(set?.id).toBe('low-straight');
  });

  it('returns null when the taiko has no set at that time', () => {
    expect(symbolSetForTaiko('Nope', 4)).toBeNull();
  });

  it('distinguishes straight from swing', () => {
    expect(symbolSetForTaiko('Shime', 4)?.time).toBe(4);
    expect(symbolSetForTaiko('Shime', 3)?.time).toBe(3);
  });
});

describe('taikoGroupsForTime', () => {
  it('groups straight-time taikos by family', () => {
    const groups = taikoGroupsForTime(4);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.taikos.map((t) => t.name)]));
    expect(byLabel.High).toContain('Shime');
    expect(byLabel.Low).toContain('Nagado');
  });

  it('only includes taikos available at the requested time', () => {
    const swing = taikoGroupsForTime(3);
    const all = swing.flatMap((g) => g.taikos.map((t) => t.name));
    for (const name of all) {
      expect(symbolSetForTaiko(name, 3)).toBeTruthy();
    }
  });

  it('drops empty family groups', () => {
    for (const g of taikoGroupsForTime(4)) expect(g.taikos.length).toBeGreaterThan(0);
  });
});
