import { describe, it, expect, vi } from 'vitest';

// piece.js (imported transitively for isSoundLine) pulls in mithril at module load.
vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

import {
  expandRepeats,
  buildSequence,
  divToSeconds,
  sectionSlice,
  blockRepeatSlice,
  excludeJiuchiLines,
  jiuchiEventsFromLines,
} from '../src/data/sequence.js';
import { KAKEGOE_VOLUME } from '../src/data/kakegoe.js';

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

// ── excludeJiuchiLines ────────────────────────────────────────────────────────

describe('excludeJiuchiLines', () => {
  const jiuchiLine = (id, sounds = []) => ({ ...line(id, sounds), jiuchiId: 'j1' });

  it('returns the array unchanged when nothing is marked', () => {
    const lines = [line('a'), line('b')];
    expect(excludeJiuchiLines(lines)).toBe(lines);
  });

  it('drops jiuchi-marked lines', () => {
    const lines = [jiuchiLine('j'), line('a'), line('b')];
    expect(excludeJiuchiLines(lines).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('drops a block-repeat marker whose members are all marked', () => {
    const lines = [jiuchiLine('a'), jiuchiLine('b'), repeat('m', 2, ['a', 'b']), line('c')];
    expect(excludeJiuchiLines(lines).map((l) => l.id)).toEqual(['c']);
  });

  it('keeps a block-repeat marker with some unmarked members', () => {
    const lines = [jiuchiLine('a'), line('b'), repeat('m', 2, ['a', 'b'])];
    const out = excludeJiuchiLines(lines);
    expect(out.map((l) => l.id)).toEqual(['b', 'm']);
    // The slimmed-down repeat still expands using its remaining member.
    expect(expandRepeats(out).map((l) => l.id)).toEqual(['b', 'b']);
  });

  it('keeps structural rows (headings etc.) untouched', () => {
    const lines = [heading('h'), jiuchiLine('j'), line('a')];
    expect(excludeJiuchiLines(lines).map((l) => l.id)).toEqual(['h', 'a']);
  });
});

// ── jiuchiEventsFromLines ─────────────────────────────────────────────────────

describe('jiuchiEventsFromLines', () => {
  it('drops rests but preserves the full loop length', () => {
    const lines = [line('a', [sound('TEN', 'R', 4), rest(4)])];
    const { events, lengthDiv } = jiuchiEventsFromLines(lines, 4);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'TEN', startDiv: 0, durationDiv: 4 });
    expect(lengthDiv).toBe(8); // trailing rest keeps the loop period
  });

  it('strips per-score identifiers from the captured events', () => {
    const lines = [line('a', [sound('TEN', 'R', 4)])];
    const { events } = jiuchiEventsFromLines(lines, 4);
    expect(events[0]).not.toHaveProperty('lineId');
    expect(events[0]).not.toHaveProperty('soundId');
  });

  it('bakes resolved volumes (emphasis) into the events', () => {
    const lines = [line('a', [sound('te', 'R', 4, { emphasis: true })])];
    const { events } = jiuchiEventsFromLines(lines, 4);
    expect(events[0].volume).toBe(3); // lowercase default 2 × 1.5
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

  it('scales the volume of accented (emphasis) sounds by 1.5×', () => {
    const lines = [
      line('a', [
        sound('te', 'R', 4), // lowercase → default volume 2
        sound('te', 'R', 4, { emphasis: true }), // accented → 2 × 1.5 = 3
        sound('te', 'R', 4, { volume: 3, emphasis: true }), // explicit 3 → 4.5
      ]),
    ];
    const { events } = buildSequence(lines, 4);
    expect(events.map((e) => e.volume)).toEqual([2, 3, 4.5]);
  });

  it('leaves rests unaffected by emphasis (volume stays null)', () => {
    const lines = [line('a', [rest(4)])];
    // A rest carries no hand, so effectiveVolume is null regardless of emphasis.
    lines[0].sounds[0].emphasis = true;
    const { events } = buildSequence(lines, 4);
    expect(events[0].volume).toBeNull();
  });

  it('reflects repeats in the event stream and total duration', () => {
    const lines = [line('a', [sound('TEN', 'R', 4)]), repeat('m', 2, ['a'])];
    const { events, totalDiv } = buildSequence(lines, 4);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.startDiv)).toEqual([0, 4]);
    expect(totalDiv).toBe(8);
  });

  it('makes kakegoe calls audible despite having no hand', () => {
    // HUP/SO etc. carry no hand, so the rest rule would silence them; the builder
    // gives them a fixed volume so the sample voice plays.
    const lines = [line('a', [{ id: 'k', name: 'HUP', duration: 4 }, rest(4)])];
    const { events } = buildSequence(lines, 4);
    expect(events[0].volume).toBe(4);
    expect(events[1].volume).toBeNull(); // a genuine rest is still silent
  });

  it('keeps silent tiles muted even when their text matches a kakegoe word', () => {
    // A silent text tile is always muted, so a user typing "sore" never plays.
    const lines = [
      line('a', [
        { id: 't', name: 'sore', duration: 4, silent: true },
        { id: 'k', name: 'sore', duration: 4 },
      ]),
    ];
    const { events } = buildSequence(lines, 4);
    expect(events[0].volume).toBeNull(); // silent tile stays muted
    expect(events[1].volume).toBe(KAKEGOE_VOLUME); // plain kakegoe still audible
  });

  it('carries the back-skin marker through to the event stream', () => {
    const lines = [line('a', [sound('TEN', 'R', 4, { skin: 'back' }), sound('KEN', 'L', 4)])];
    const { events } = buildSequence(lines, 4);
    expect(events[0].skin).toBe('back');
    expect(events[1].skin).toBeUndefined();
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
