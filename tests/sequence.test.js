import { describe, it, expect, vi } from 'vitest';

// piece.js (imported transitively for isSoundLine) pulls in mithril at module load.
vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

import {
  expandRepeats,
  buildSequence,
  divToSeconds,
  sectionSlice,
  blockRepeatSlice,
} from '../src/data/sequence.js';

// ── Fixture helpers ─────────────────────────────────────────────────────────
let nextId = 0;
function sound(name = 'TEN', hand = 'R', duration = 4, extra = {}) {
  return { id: `s${nextId++}`, name, hand, duration, ...extra };
}
function rest(duration = 4) {
  return { id: `r${nextId++}`, name: 'SU', duration }; // no hand → rest
}
function line(id, sounds = []) {
  return { id, sounds };
}
function repeat(id, count, lineIds) {
  return { id, type: 'block-repeat', count, lineIds };
}
function heading(id) {
  return { id, type: 'heading', text: '' };
}

// ── expandRepeats ───────────────────────────────────────────────────────────

describe('expandRepeats', () => {
  it('returns sound lines unchanged when there are no repeats', () => {
    const lines = [line('a'), line('b')];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('returns an empty array for empty input', () => {
    expect(expandRepeats([])).toEqual([]);
  });

  it('drops structural rows (heading / note / divider) from the output', () => {
    const lines = [
      { id: 'h', type: 'heading', text: 'A' },
      line('a'),
      { id: 'n', type: 'note', text: 'x' },
      { id: 'd', type: 'divider' },
      line('b'),
    ];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('unrolls a single-line repeat count times (count = total plays)', () => {
    const lines = [line('a'), repeat('m', 3, ['a']), line('b')];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual(['a', 'a', 'a', 'b']);
  });

  it('unrolls a multi-line block repeat', () => {
    const lines = [line('a'), line('b'), repeat('m', 2, ['a', 'b']), line('c')];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual(['a', 'b', 'a', 'b', 'c']);
  });

  it('unrolls nested block repeats inside-out', () => {
    // outer [a,b,c] ×2 with inner [b] ×3 nested within it.
    const lines = [
      line('a'),
      line('b'),
      repeat('inner', 3, ['b']),
      line('c'),
      repeat('outer', 2, ['a', 'b', 'c']),
    ];
    // one outer pass: a, b×3, c
    const pass = ['a', 'b', 'b', 'b', 'c'];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual([...pass, ...pass]);
  });

  it('handles a single-line repeat nested inside a multi-line block', () => {
    const lines = [line('a'), line('b'), repeat('inner', 2, ['b']), repeat('outer', 2, ['a', 'b'])];
    const pass = ['a', 'b', 'b'];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual([...pass, ...pass]);
  });

  it('keeps a heading inside a repeated block from breaking the range', () => {
    const lines = [
      line('a'),
      { id: 'h', type: 'heading', text: 'mid' },
      line('b'),
      repeat('m', 2, ['a', 'b']),
    ];
    expect(expandRepeats(lines).map((l) => l.id)).toEqual(['a', 'b', 'a', 'b']);
  });
});

// ── buildSequence ─────────────────────────────────────────────────────────────

describe('buildSequence', () => {
  it('accumulates start positions continuously across lines', () => {
    const lines = [
      line('a', [sound('TEN', 'R', 4), sound('te', 'R', 1)]),
      line('b', [sound('KEN', 'L', 4)]),
    ];
    const { events, totalDiv } = buildSequence(lines, 4);
    expect(events.map((e) => e.startDiv)).toEqual([0, 4, 5]);
    expect(events.map((e) => e.durationDiv)).toEqual([4, 1, 4]);
    expect(totalDiv).toBe(9);
  });

  it('includes rests as events with null volume but still advances time', () => {
    const lines = [line('a', [rest(4), sound('TEN', 'R', 4)])];
    const { events } = buildSequence(lines, 4);
    expect(events[0].volume).toBeNull();
    expect(events[1].startDiv).toBe(4);
    expect(events[1].volume).toBe(4); // TEN is uppercase → default full volume
  });

  it('reflects repeats in the event stream and total duration', () => {
    const lines = [line('a', [sound('TEN', 'R', 4)]), repeat('m', 2, ['a'])];
    const { events, totalDiv } = buildSequence(lines, 4);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.startDiv)).toEqual([0, 4]);
    expect(totalDiv).toBe(8);
  });

  it('returns no events for an empty / rests-free score', () => {
    expect(buildSequence([line('a', [])], 4)).toEqual({ events: [], totalDiv: 0 });
  });

  it('plays a single line exactly once even if it is a block-repeat member', () => {
    const a = line('a', [sound('TEN', 'R', 4)]);
    // Passing just the line (no marker in the array) ignores its repeat — the
    // behaviour a single-line "play this line" preview relies on.
    const { events, totalDiv } = buildSequence([a], 4);
    expect(events).toHaveLength(1);
    expect(totalDiv).toBe(4);
  });

  it('tags each event with its line taiko via the resolver', () => {
    const lines = [line('a', [sound('TEN', 'R', 4)]), line('b', [sound('DON', 'R', 4)])];
    const taiko = (l) => (l.id === 'a' ? 'Shime' : 'Nagado');
    const { events } = buildSequence(lines, 4, taiko);
    expect(events.map((e) => e.taiko)).toEqual(['Shime', 'Nagado']);
  });
});

// ── stacks (simultaneous parts) ──────────────────────────────────────────────

function stack(id, parts) {
  return { id, type: 'stack', parts };
}
function part(id, taiko, sounds = []) {
  return { id, taiko, sounds };
}

describe('buildSequence with stacks', () => {
  it('starts every part at the same offset and advances by the longest part', () => {
    const lines = [
      stack('st', [
        part('p1', 'Shime', [sound('TEN', 'R', 4), sound('te', 'R', 2)]), // length 6
        part('p2', 'Nagado', [sound('DON', 'R', 4)]), // length 4
      ]),
      line('after', [sound('KEN', 'L', 4)]),
    ];
    const { events, totalDiv } = buildSequence(lines, 4);
    const byId = Object.fromEntries(events.map((e) => [e.soundId, e]));
    // Both parts begin at div 0.
    expect(byId[lines[0].parts[0].sounds[0].id].startDiv).toBe(0);
    expect(byId[lines[0].parts[1].sounds[0].id].startDiv).toBe(0);
    // The following line starts after the longest part (6), not the sum.
    expect(events.at(-1).startDiv).toBe(6);
    expect(totalDiv).toBe(10);
  });

  it('voices each part with its own taiko (ignoring the line resolver)', () => {
    const lines = [
      stack('st', [
        part('p1', 'Shime', [sound('TEN', 'R', 4)]),
        part('p2', 'Nagado', [sound('DON', 'R', 4)]),
      ]),
    ];
    const { events } = buildSequence(lines, 4, () => 'WRONG');
    expect(events.map((e) => e.taiko).sort()).toEqual(['Nagado', 'Shime']);
  });

  it('unrolls a block-repeat that wraps a stack as a whole unit', () => {
    const lines = [
      stack('st', [
        part('p1', 'Shime', [sound('TEN', 'R', 4)]),
        part('p2', 'Nagado', [sound('DON', 'R', 2)]),
      ]),
      repeat('m', 2, ['st']),
    ];
    const { events, totalDiv } = buildSequence(lines, 4);
    // 2 parts × 2 plays = 4 events; stack span = 4 (longest part) × 2 = 8.
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.startDiv).sort((a, b) => a - b)).toEqual([0, 0, 4, 4]);
    expect(totalDiv).toBe(8);
  });
});

// ── sectionSlice ────────────────────────────────────────────────────────────

describe('sectionSlice', () => {
  it('returns the lines after a heading up to the next heading', () => {
    const lines = [heading('h1'), line('a'), line('b'), heading('h2'), line('c')];
    expect(sectionSlice(lines, 'h1').map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('runs to the end of the list when there is no following heading', () => {
    const lines = [heading('h1'), line('a'), line('b')];
    expect(sectionSlice(lines, 'h1').map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('returns [] for an unknown heading id', () => {
    expect(sectionSlice([line('a')], 'nope')).toEqual([]);
  });

  it('keeps an internal repeat so buildSequence still unrolls it', () => {
    const lines = [
      heading('h1'),
      line('a', [sound('TEN', 'R', 4)]),
      repeat('m', 2, ['a']),
      heading('h2'),
      line('b', [sound('KEN', 'L', 4)]),
    ];
    const { events, totalDiv } = buildSequence(sectionSlice(lines, 'h1'), 4);
    expect(events.map((e) => e.startDiv)).toEqual([0, 4]); // 'a' played twice
    expect(totalDiv).toBe(8);
  });
});

// ── blockRepeatSlice ─────────────────────────────────────────────────────────

describe('blockRepeatSlice', () => {
  it('includes the member lines and the marker so the repeat applies', () => {
    const lines = [
      line('a', [sound('TEN', 'R', 4)]),
      line('b', [sound('KEN', 'L', 4)]),
      repeat('m', 2, ['a', 'b']),
      line('c'),
    ];
    const slice = blockRepeatSlice(lines, 'm');
    expect(slice.map((l) => l.id)).toEqual(['a', 'b', 'm']);
    const { events, totalDiv } = buildSequence(slice, 4);
    expect(events).toHaveLength(4); // a,b played twice
    expect(totalDiv).toBe(16);
  });

  it('returns [] for a missing id or a non-repeat row', () => {
    expect(blockRepeatSlice([line('a')], 'a')).toEqual([]);
    expect(blockRepeatSlice([line('a')], 'nope')).toEqual([]);
  });
});

// ── divToSeconds ────────────────────────────────────────────────────────────

describe('divToSeconds', () => {
  it('converts divisions to seconds at a given tempo', () => {
    // 120 bpm → 0.5s per beat; time=4 → one division = 0.125s.
    expect(divToSeconds(4, 120, 4)).toBeCloseTo(0.5);
    expect(divToSeconds(1, 120, 4)).toBeCloseTo(0.125);
    expect(divToSeconds(3, 180, 3)).toBeCloseTo(1 / 3);
  });
});
