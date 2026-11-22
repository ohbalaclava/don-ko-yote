import { describe, it, expect, vi } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

import {
  alignDiv,
  setIdForLane,
  setLanes,
  setCursor,
  setStream,
  setConflicts,
  setBlankSpans,
  restsForGap,
} from '../src/data/sets.js';
import { HIGH_STRAIGHT } from '../src/data/symbols-high-straight.js';
import { HIGH_SWING } from '../src/data/symbols-high-swing.js';
import { LOW_STRAIGHT } from '../src/data/symbols-low-straight.js';
import { LOW_SWING } from '../src/data/symbols-low-swing.js';

let n = 0;
/** A sound with an auto id; `gap` is omitted when 0, as the mutators write it. */
function s(name, hand, duration, gap = 0) {
  return { id: `s${++n}`, name, hand, duration, ...(gap && { gap }) };
}

/** A system of lanes, one per `partId`, each with the given sounds. */
function system(spec) {
  return {
    id: 'L1',
    lanes: Object.entries(spec).map(([partId, sounds], i) => ({
      id: `lane${i}`,
      partId: partId === 'null' ? null : partId,
      sounds,
    })),
  };
}

/** `[['p1','A'], ['p2',null]]` → parts p1 in set A, p2 independent. */
function parts(spec) {
  return spec.map(([id, setId]) => ({ id, name: id, taiko: 'Shime', setId }));
}

// ── Membership ────────────────────────────────────────────────────────────────

describe('setIdForLane', () => {
  const ps = parts([
    ['p1', 'A'],
    ['p2', null],
  ]);

  it('returns the part’s set', () => {
    expect(setIdForLane(ps, { partId: 'p1' })).toBe('A');
  });

  it('returns null for an independent part', () => {
    expect(setIdForLane(ps, { partId: 'p2' })).toBe(null);
  });

  it('returns null for a jiuchi definition lane and for nothing at all', () => {
    expect(setIdForLane(ps, { partId: null })).toBe(null);
    expect(setIdForLane(ps, undefined)).toBe(null);
  });

  it('returns null for a part that no longer exists', () => {
    expect(setIdForLane(ps, { partId: 'gone' })).toBe(null);
  });
});

describe('setLanes', () => {
  it('collects a set whose parts are not consecutive, in part order', () => {
    const ps = parts([
      ['p1', 'A'],
      ['p2', null],
      ['p3', 'A'],
    ]);
    const sys = system({ p1: [], p2: [], p3: [] });
    expect(setLanes(sys, ps, 'A').map((l) => l.partId)).toEqual(['p1', 'p3']);
  });

  it('orders by part order, not by lane order within the system', () => {
    const ps = parts([
      ['p1', 'A'],
      ['p2', 'A'],
    ]);
    const sys = system({ p2: [], p1: [] });
    expect(setLanes(sys, ps, 'A').map((l) => l.partId)).toEqual(['p1', 'p2']);
  });

  it('is empty for an unknown or absent set', () => {
    const ps = parts([['p1', 'A']]);
    const sys = system({ p1: [] });
    expect(setLanes(sys, ps, 'B')).toEqual([]);
    expect(setLanes(sys, ps, null)).toEqual([]);
  });
});

// ── Shared cursor ─────────────────────────────────────────────────────────────

describe('setCursor', () => {
  const ps = parts([
    ['p1', 'A'],
    ['p2', 'A'],
    ['p3', null],
  ]);

  it('is the longest lane of the set, gaps included', () => {
    const sys = system({
      p1: [s('TEN', 'R', 4)],
      p2: [s('KEN', 'L', 4, 8)],
      p3: [s('TEN', 'R', 4, 40)],
    });
    expect(setCursor(sys, ps, 'A')).toBe(12);
  });

  it('is 0 when every lane of the set is empty', () => {
    expect(setCursor(system({ p1: [], p2: [] }), ps, 'A')).toBe(0);
  });

  it('ignores a jiuchi definition lane', () => {
    const sys = system({ null: [s('TEN', 'R', 4, 20)], p1: [s('TEN', 'R', 4)] });
    expect(setCursor(sys, ps, 'A')).toBe(4);
  });
});

// ── The playing path ──────────────────────────────────────────────────────────

describe('setStream', () => {
  const ps = parts([
    ['p1', 'A'],
    ['p2', 'A'],
  ]);

  it('merges the set’s lanes onto one timeline, ordered by start', () => {
    const sys = system({
      p1: [s('TEN', 'R', 4), s('TEN', 'R', 4, 4)],
      p2: [s('KEN', 'L', 4, 4)],
    });
    expect(setStream(sys, ps, 'A').map((e) => [e.partId, e.startDiv])).toEqual([
      ['p1', 0],
      ['p2', 4],
      ['p1', 8],
    ]);
  });

  it('breaks ties in part order', () => {
    const sys = system({ p2: [s('KEN', 'L', 4)], p1: [s('TEN', 'R', 4)] });
    expect(setStream(sys, ps, 'A').map((e) => e.partId)).toEqual(['p1', 'p2']);
  });

  it('skips rests, kakegoe and silenced sounds but keeps their time', () => {
    const sys = system({
      p1: [s('SU', undefined, 2), s('HUP', undefined, 4), { ...s('TEN', 'R', 4), silent: true }],
      p2: [s('KEN', 'L', 4, 10)],
    });
    const stream = setStream(sys, ps, 'A');
    expect(stream).toHaveLength(1);
    expect(stream[0]).toMatchObject({ partId: 'p2', hand: 'L', startDiv: 10, durationDiv: 4 });
  });

  it('exposes only the public shape', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [] });
    expect(Object.keys(setStream(sys, ps, 'A')[0]).sort()).toEqual([
      'durationDiv',
      'hand',
      'partId',
      'soundId',
      'startDiv',
    ]);
  });
});

// ── Aligning to the cursor ────────────────────────────────────────────────────

describe('alignDiv', () => {
  const ps = parts([
    ['p1', 'A'],
    ['p2', 'A'],
    ['p3', null],
  ]);
  /** The lane of part `p` in a system built by `system()`. */
  const laneOf = (sys, p) => sys.lanes.find((l) => l.partId === p);

  it('targets the other drum’s previous strike', () => {
    const b = s('KEN', 'L', 4, 4);
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [b], p3: [] });
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, b.id)).toBe(0);
  });

  it('takes the latest strike before it, not the first', () => {
    const b = s('KEN', 'L', 4, 8);
    const sys = system({ p1: [s('TEN', 'R', 4), s('TEN', 'R', 4)], p2: [b], p3: [] });
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, b.id)).toBe(4);
  });

  it('never moves a sound back past its own lane’s previous sound', () => {
    // p1 strikes on 0 and 8; p2 plays 0-4 then 8-12, so the second p2 sound could
    // only align to 8 — which is where it already is.
    const b = s('KEN', 'L', 4, 4);
    const sys = system({
      p1: [s('TEN', 'R', 4), s('TEN', 'R', 4, 4)],
      p2: [s('KEN', 'L', 4), b],
      p3: [],
    });
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, b.id)).toBe(null);
  });

  it('returns null when the only earlier strike is inside its own lane', () => {
    const b = s('KEN', 'L', 4);
    const sys = system({ p1: [], p2: [s('TEN', 'R', 4), b], p3: [] });
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, b.id)).toBe(null);
  });

  it('returns null for an already aligned strike, a rest and an independent part', () => {
    const together = s('KEN', 'L', 4);
    const rest = s('SU', null, 4, 4);
    const solo = s('KEN', 'L', 4);
    const sys = system({
      p1: [s('TEN', 'R', 4)],
      p2: [together, rest],
      p3: [solo],
    });
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, together.id)).toBe(null);
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, rest.id)).toBe(null);
    expect(alignDiv(sys, ps, laneOf(sys, 'p3').id, solo.id)).toBe(null);
  });

  it('returns null for an unknown lane or sound', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [s('KEN', 'L', 4, 4)], p3: [] });
    expect(alignDiv(sys, ps, 'nope', 'nope')).toBe(null);
    expect(alignDiv(sys, ps, laneOf(sys, 'p2').id, 'nope')).toBe(null);
  });
});

// ── Two hands ─────────────────────────────────────────────────────────────────

describe('setConflicts', () => {
  const ps = parts([
    ['p1', 'A'],
    ['p2', 'A'],
    ['p3', 'A'],
  ]);
  const kinds = (sys, p = ps) => setConflicts(sys, p).map((c) => c.kind);

  it('is clean for two different hands together', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [s('KEN', 'L', 4)], p3: [] });
    expect(setConflicts(sys, ps)).toEqual([]);
  });

  it('flags the same hand twice on one division', () => {
    const a = s('TEN', 'R', 4);
    const b = s('TEN', 'R', 4);
    const sys = system({ p1: [a], p2: [b], p3: [] });
    expect(setConflicts(sys, ps)).toEqual([{ soundIds: [a.id, b.id], div: 0, kind: 'same-hand' }]);
  });

  it('flags a hand that is still mid-stroke as hand-busy', () => {
    const sys = system({
      p1: [s('TEN', 'R', 4)],
      p2: [s('te', 'R', 1, 2)],
      p3: [],
    });
    expect(kinds(sys)).toEqual(['hand-busy']);
  });

  it('is clean when one strike ends exactly where the next begins', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [s('TEN', 'R', 4, 4)], p3: [] });
    expect(setConflicts(sys, ps)).toEqual([]);
  });

  it('flags three strikes sounding at once, whatever the hands', () => {
    const sys = system({
      p1: [s('TEN', 'R', 4)],
      p2: [s('KEN', 'L', 4)],
      p3: [s('te', 'R', 1, 2)],
    });
    const out = setConflicts(sys, ps);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('too-many');
    expect(out[0].soundIds).toHaveLength(3);
  });

  it('accepts a two-stick KI alone but not alongside anything', () => {
    const alone = system({ p1: [s('KI', 'B', 3)], p2: [], p3: [] });
    expect(setConflicts(alone, ps)).toEqual([]);

    const withOther = system({ p1: [s('KI', 'B', 3)], p2: [s('KO', 'L', 1)], p3: [] });
    expect(kinds(withOther)).toEqual(['same-hand']);
  });

  it('never looks across set boundaries', () => {
    const split = parts([
      ['p1', 'A'],
      ['p2', 'B'],
      ['p3', null],
    ]);
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [s('TEN', 'R', 4)], p3: [s('TEN', 'R', 4)] });
    expect(setConflicts(sys, split)).toEqual([]);
  });

  it('reports each clash once, ordered by division', () => {
    const sys = system({
      p1: [s('TEN', 'R', 4), s('KEN', 'L', 4)],
      p2: [s('TEN', 'R', 4), s('KEN', 'L', 4)],
      p3: [],
    });
    expect(setConflicts(sys, ps).map((c) => [c.div, c.kind])).toEqual([
      [0, 'same-hand'],
      [4, 'same-hand'],
    ]);
  });

  it('is empty for a score with no sets at all', () => {
    const solo = parts([['p1', null]]);
    const sys = system({ p1: [s('TEN', 'R', 4), s('TEN', 'R', 4)] });
    expect(setConflicts(sys, solo)).toEqual([]);
  });
});

// ── Materialising blanks ──────────────────────────────────────────────────────

describe('setBlankSpans', () => {
  const ps = parts([
    ['p1', 'A'],
    ['p2', 'A'],
    ['p3', null],
  ]);

  it('finds no hole in a set whose lanes interlock', () => {
    const sys = system({ p1: [s('TEN', 'R', 4), s('TEN', 'R', 4, 4)], p2: [s('KEN', 'L', 4, 4)] });
    expect(setBlankSpans(sys, ps, 'A')).toEqual([]);
  });

  it('reports a span no lane of the set plays through', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [s('KEN', 'L', 4, 12)] });
    expect(setBlankSpans(sys, ps, 'A')).toEqual([{ startDiv: 4, divs: 8 }]);
  });

  it('reports a set that starts late as a hole at the head', () => {
    const sys = system({ p1: [s('TEN', 'R', 4, 8)], p2: [] });
    expect(setBlankSpans(sys, ps, 'A')).toEqual([{ startDiv: 0, divs: 8 }]);
  });

  it('excludes trailing silence — the cursor is the set’s last sound', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [s('KEN', 'L', 4, 4)] });
    expect(setBlankSpans(sys, ps, 'A')).toEqual([]);
  });

  it('counts a rest as played: authored silence is not a hole', () => {
    const sys = system({ p1: [s('TEN', 'R', 4), s('SU', null, 8)], p2: [s('KEN', 'L', 4, 12)] });
    expect(setBlankSpans(sys, ps, 'A')).toEqual([]);
  });

  it('ignores lanes outside the set, and has nothing to say about no set', () => {
    const sys = system({ p1: [s('TEN', 'R', 4)], p2: [], p3: [s('TEN', 'R', 4, 12)] });
    expect(setBlankSpans(sys, ps, 'A')).toEqual([]);
    expect(setBlankSpans(sys, ps, null)).toEqual([]);
  });
});

describe('restsForGap', () => {
  const names = (out) => out.map((x) => x.name);
  const total = (out) => out.reduce((t, x) => t + x.duration, 0);

  it('numbers whole beats by their position in the system', () => {
    const out = restsForGap(HIGH_STRAIGHT, 4, 12, 4);
    expect(names(out)).toEqual(['2', '3', '4']);
    expect(out.every((x) => x.implicit && x.duration === 4)).toBe(true);
  });

  it('falls back to the neutral face past beat 8', () => {
    expect(names(restsForGap(HIGH_STRAIGHT, 28, 12, 4))).toEqual(['8', '—', '—']);
  });

  it('fills a sub-beat remainder with the set’s own rests', () => {
    expect(names(restsForGap(HIGH_STRAIGHT, 0, 7, 4))).toEqual(['1', 'SU', "s'"]);
    expect(total(restsForGap(HIGH_STRAIGHT, 0, 7, 4))).toBe(7);
  });

  it('fills a mid-beat lead-in before numbering beats', () => {
    const out = restsForGap(HIGH_STRAIGHT, 2, 10, 4);
    expect(names(out)).toEqual(['SU', '2', '3']);
    expect(total(out)).toBe(10);
  });

  it('composes a sub-beat gap in each symbol set and always totals the gap', () => {
    for (const set of [HIGH_STRAIGHT, HIGH_SWING, LOW_STRAIGHT, LOW_SWING]) {
      for (let divs = 1; divs <= 3 * set.time; divs++) {
        const out = restsForGap(set, 0, divs, set.time);
        expect(total(out), `${set.id} gap ${divs}`).toBe(divs);
      }
    }
  });

  it('is empty for no gap', () => {
    expect(restsForGap(HIGH_STRAIGHT, 0, 0, 4)).toEqual([]);
    expect(restsForGap(HIGH_STRAIGHT, 0, -4, 4)).toEqual([]);
  });
});
