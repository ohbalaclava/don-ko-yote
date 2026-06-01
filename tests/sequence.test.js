import { describe, it, expect, vi } from 'vitest';

// piece.js (imported transitively for isSoundLine) pulls in mithril at module load.
vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

import { expandRepeats, buildSequence, divToSeconds } from '../src/data/sequence.js';

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
