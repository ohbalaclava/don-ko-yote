import { describe, it, expect, vi } from 'vitest';

// piece.js (imported transitively for isSoundLine) pulls in mithril at module load.
vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

import {
  expandRepeats,
  buildSequence,
  buildPartSequences,
  divToSeconds,
  sectionSlice,
  blockRepeatSlice,
  excludeJiuchiSections,
  jiuchiRegions,
  jiuchiEventsFromLines,
  jiuchiSectionSlice,
  jiuchiPracticeLoop,
  ALL_JIUCHI_SECTIONS,
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
function divider(id) {
  return { id, type: 'divider' };
}
function jiuchiSection(id, taiko = 'Shime') {
  return { id, type: 'jiuchi-section', taiko };
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

// ── excludeJiuchiSections ──────────────────────────────────────────────────────

describe('excludeJiuchiSections', () => {
  it('returns the array unchanged when there are no jiuchi sections', () => {
    const lines = [line('a'), line('b')];
    expect(excludeJiuchiSections(lines)).toBe(lines);
  });

  it('drops the marker and its definition lines up to the next heading', () => {
    const lines = [jiuchiSection('j'), line('d1'), line('d2'), heading('h'), line('a')];
    expect(excludeJiuchiSections(lines).map((l) => l.id)).toEqual(['h', 'a']);
  });

  it('ends the definition run at a divider', () => {
    const lines = [jiuchiSection('j'), line('d1'), divider('dv'), line('a')];
    expect(excludeJiuchiSections(lines).map((l) => l.id)).toEqual(['dv', 'a']);
  });

  it('runs the definition to the end when there is no following boundary', () => {
    const lines = [line('a'), jiuchiSection('j'), line('d1'), line('d2')];
    expect(excludeJiuchiSections(lines).map((l) => l.id)).toEqual(['a']);
  });

  it('drops a block-repeat marker whose members are all within a definition', () => {
    const lines = [
      jiuchiSection('j'),
      line('d1'),
      line('d2'),
      repeat('m', 2, ['d1', 'd2']),
      heading('h'),
      line('a'),
    ];
    expect(excludeJiuchiSections(lines).map((l) => l.id)).toEqual(['h', 'a']);
  });
});

// ── jiuchiRegions ──────────────────────────────────────────────────────────────

describe('jiuchiRegions', () => {
  it('returns no regions when there are no jiuchi sections', () => {
    expect(jiuchiRegions([line('a', [sound()])], 4)).toEqual([]);
  });

  it('underlays the score after the section, in main-sequence divisions', () => {
    const lines = [
      jiuchiSection('j', 'Shime'),
      line('d', [sound('TEN', 'R', 4)]), // definition: one 4-div loop
      heading('h'),
      line('a', [sound('TEN', 'R', 4)]),
      line('b', [sound('TEN', 'R', 4)]),
    ];
    const regions = jiuchiRegions(lines, 4);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ startDiv: 0, endDiv: 8, lengthDiv: 4, taiko: 'Shime' });
    expect(regions[0].events).toHaveLength(1);
  });

  it('persists across a heading and switches at the next section', () => {
    const lines = [
      line('intro', [sound('TEN', 'R', 4)]), // 4 div before any section
      jiuchiSection('j1', 'Shime'),
      line('d1', [sound('TEN', 'R', 4)]),
      heading('A'),
      line('a', [sound('TEN', 'R', 4)]), // under j1, after a heading
      jiuchiSection('j2', 'Katsugi'),
      line('d2', [sound('TEN', 'R', 4)]),
      heading('B'),
      line('b', [sound('TEN', 'R', 4)]), // under j2
    ];
    const regions = jiuchiRegions(lines, 4);
    expect(regions.map((r) => [r.startDiv, r.endDiv, r.taiko])).toEqual([
      [4, 8, 'Shime'],
      [8, 12, 'Katsugi'],
    ]);
  });

  it('skips a section whose definition has no audible events', () => {
    const lines = [jiuchiSection('j'), heading('h'), line('a', [sound('TEN', 'R', 4)])];
    expect(jiuchiRegions(lines, 4)).toEqual([]);
  });

  it('skips a trailing section with nothing after it to underlay', () => {
    const lines = [line('a', [sound('TEN', 'R', 4)]), jiuchiSection('j'), line('d', [sound()])];
    expect(jiuchiRegions(lines, 4)).toEqual([]);
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

  it("uses the sounds' actual span as the loop length, not whole lines", () => {
    // A marked line holding 5 beats of sounds (time 4 → 20 divisions) in a score
    // whose beatsPerLine is 8: the jiuchi is 5 beats long and repeats every 5
    // beats — the line's unfilled remainder adds nothing.
    const fiveBeats = Array.from({ length: 5 }, () => sound('DON', 'R', 4));
    const { lengthDiv } = jiuchiEventsFromLines([line('a', fiveBeats)], 4);
    expect(lengthDiv).toBe(20);
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

// ── Sparse set lanes (gaps) ──────────────────────────────────────────────────

describe('buildSequence — leading silence', () => {
  it('shifts a sound by its gap and counts the gap in the total', () => {
    const lines = [line('a', [sound('TEN', 'R', 4, { gap: 8 })])];
    const { events, totalDiv } = buildSequence(lines, 4);
    expect(events[0].startDiv).toBe(8);
    expect(totalDiv).toBe(12);
  });

  it('is the typed-rest sequence minus the rest event', () => {
    const gapped = buildSequence([line('a', [sound('TEN', 'R', 4, { gap: 4 })])], 4);
    const rested = buildSequence([line('b', [rest(4), sound('TEN', 'R', 4)])], 4);
    expect(gapped.totalDiv).toBe(rested.totalDiv);
    expect(gapped.events).toHaveLength(1);
    expect(gapped.events[0].startDiv).toBe(rested.events[1].startDiv);
    expect(rested.events[0].volume).toBeNull(); // the only extra event
  });

  it('keeps a lane of nothing but blank space and one strike in step', () => {
    // Two lanes of one set: whatever lane A plays, lane B's strike is at div 12.
    const lines = [
      {
        id: 'l1',
        lanes: [
          {
            id: 'a',
            partId: 'p1',
            sounds: [sound('TEN', 'R', 4), sound('te', 'R', 1, { gap: 2 })],
          },
          { id: 'b', partId: 'p2', sounds: [sound('KEN', 'L', 4, { gap: 12 })] },
        ],
      },
    ];
    const b = buildSequence(lines, 4, 'p2');
    expect(b.events.map((e) => e.startDiv)).toEqual([12]);
    expect(b.totalDiv).toBe(16); // the system spans the longer lane
    expect(buildSequence(lines, 4, 'p1').events.map((e) => e.startDiv)).toEqual([0, 6]);
  });

  it('counts a gap in a jiuchi definition loop and in the region it underlays', () => {
    const lines = [
      jiuchiSection('j', 'Shime'),
      line('d', [sound('TEN', 'R', 4), sound('TEN', 'R', 4, { gap: 4 })]), // 12-div loop
      heading('h'),
      line('a', [sound('TEN', 'R', 4, { gap: 4 })]),
    ];
    const regions = jiuchiRegions(lines, 4);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ startDiv: 0, endDiv: 8, lengthDiv: 12 });
    expect(regions[0].events.map((e) => e.startDiv)).toEqual([0, 8]);
  });
});

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

// ── jiuchiSectionSlice ───────────────────────────────────────────────────────

describe('jiuchiSectionSlice', () => {
  it('returns the definition lines after the marker, excluding the marker', () => {
    const lines = [jiuchiSection('j1'), line('a'), line('b'), heading('h2'), line('c')];
    expect(jiuchiSectionSlice(lines, 'j1').map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('stops at a divider or the next jiuchi-section marker', () => {
    const lines = [jiuchiSection('j1'), line('a'), divider('d'), line('b')];
    expect(jiuchiSectionSlice(lines, 'j1').map((l) => l.id)).toEqual(['a']);
  });

  it('runs to the end when nothing closes the definition', () => {
    const lines = [jiuchiSection('j1'), line('a'), line('b')];
    expect(jiuchiSectionSlice(lines, 'j1').map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('returns [] for an unknown or non-section id', () => {
    expect(jiuchiSectionSlice([line('a')], 'nope')).toEqual([]);
    expect(jiuchiSectionSlice([heading('h1'), line('a')], 'h1')).toEqual([]);
  });

  it('plays once through with no looping via buildSequence', () => {
    const lines = [
      jiuchiSection('j1'),
      line('a', [sound('TEN', 'R', 4)]),
      line('b', [sound('KEN', 'L', 4)]),
      heading('h2'),
      line('c', [sound('DON', 'R', 4)]),
    ];
    const { events, totalDiv } = buildSequence(jiuchiSectionSlice(lines, 'j1'), 4);
    expect(events.map((e) => e.name)).toEqual(['TEN', 'KEN']);
    expect(totalDiv).toBe(8);
  });
});

// ── jiuchiPracticeLoop ───────────────────────────────────────────────────────

describe('jiuchiPracticeLoop', () => {
  it('returns one section rhythm, every event tagged with the section taiko', () => {
    const lines = [
      jiuchiSection('j1', 'Nagado'),
      line('a', [sound('DON', 'R', 4), sound('KA', 'L', 4)]),
      heading('h2'),
      line('c', [sound('TEN', 'R', 4)]),
    ];
    const loop = jiuchiPracticeLoop(lines, 'j1', 4);
    expect(loop.events.map((e) => e.name)).toEqual(['DON', 'KA']);
    expect(loop.events.map((e) => e.taiko)).toEqual(['Nagado', 'Nagado']);
    expect(loop.lengthDiv).toBe(8);
  });

  it('keeps trailing rests in the loop period but not in the events', () => {
    const lines = [jiuchiSection('j1'), line('a', [sound('TEN', 'R', 4), rest(4)])];
    const loop = jiuchiPracticeLoop(lines, 'j1', 4);
    expect(loop.events).toHaveLength(1);
    expect(loop.lengthDiv).toBe(8);
  });

  it('chains every section in score order for ALL_JIUCHI_SECTIONS', () => {
    const lines = [
      jiuchiSection('j1', 'Shime'),
      line('a', [sound('TEN', 'R', 4), sound('TSU', 'L', 4)]),
      heading('h'),
      line('body', [sound('DON', 'R', 4)]),
      jiuchiSection('j2', 'Nagado'),
      line('b', [sound('DON', 'R', 4)]),
    ];
    const loop = jiuchiPracticeLoop(lines, ALL_JIUCHI_SECTIONS, 4);
    expect(loop.events.map((e) => [e.name, e.taiko, e.startDiv])).toEqual([
      ['TEN', 'Shime', 0],
      ['TSU', 'Shime', 4],
      ['DON', 'Nagado', 8], // offset by the first section's length, on its own taiko
    ]);
    expect(loop.lengthDiv).toBe(12);
  });

  it('keeps a rest-only section as authored silence when chaining', () => {
    const lines = [
      jiuchiSection('j1'),
      line('a', [rest(4)]),
      divider('d'),
      jiuchiSection('j2'),
      line('b', [sound('TEN', 'R', 4)]),
    ];
    const loop = jiuchiPracticeLoop(lines, ALL_JIUCHI_SECTIONS, 4);
    expect(loop.events.map((e) => e.startDiv)).toEqual([4]);
    expect(loop.lengthDiv).toBe(8);
  });

  it('skips a section with no definition lines when chaining', () => {
    const lines = [
      jiuchiSection('j1'),
      divider('d'),
      jiuchiSection('j2'),
      line('b', [sound('TEN', 'R', 4)]),
    ];
    const loop = jiuchiPracticeLoop(lines, ALL_JIUCHI_SECTIONS, 4);
    expect(loop.events.map((e) => e.startDiv)).toEqual([0]);
    expect(loop.lengthDiv).toBe(4);
  });

  it('returns null without a usable source', () => {
    const lines = [jiuchiSection('j1'), line('a', [sound('TEN', 'R', 4)])];
    expect(jiuchiPracticeLoop(lines, null, 4)).toBeNull(); // nothing selected
    expect(jiuchiPracticeLoop(lines, 'gone', 4)).toBeNull(); // section removed since
    expect(jiuchiPracticeLoop([heading('h1'), line('a')], 'h1', 4)).toBeNull(); // not a marker
    expect(jiuchiPracticeLoop([line('a')], ALL_JIUCHI_SECTIONS, 4)).toBeNull(); // no sections
  });

  it('returns null when nothing in the source is audible', () => {
    expect(jiuchiPracticeLoop([jiuchiSection('j1'), line('a')], 'j1', 4)).toBeNull();
    expect(jiuchiPracticeLoop([jiuchiSection('j1'), line('a', [rest(4)])], 'j1', 4)).toBeNull();
    expect(
      jiuchiPracticeLoop([jiuchiSection('j1'), line('a', [rest(4)])], ALL_JIUCHI_SECTIONS, 4)
    ).toBeNull();
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

// ── buildPartSequences ──────────────────────────────────────────────────────

describe('buildPartSequences', () => {
  const parts = [
    { id: 'p1', taiko: 'Nagado', volume: 1 },
    { id: 'p2', taiko: 'Shime', volume: 1 },
  ];
  /** One system, one lane per part, with differing lane lengths. */
  const lines = [
    {
      id: 'l1',
      lanes: [
        { id: 'a', partId: 'p1', sounds: [sound('DON'), sound('KA')] },
        { id: 'b', partId: 'p2', sounds: [sound('TEN')] },
      ],
    },
  ];

  it('returns one stream per part, carrying its taiko', () => {
    const { streams } = buildPartSequences(lines, parts, 4);
    expect(streams.map((s) => [s.partId, s.taiko])).toEqual([
      ['p1', 'Nagado'],
      ['p2', 'Shime'],
    ]);
  });

  it('gives each stream only its own part events', () => {
    const { streams } = buildPartSequences(lines, parts, 4);
    expect(streams[0].events.map((e) => e.name)).toEqual(['DON', 'KA']);
    expect(streams[1].events.map((e) => e.name)).toEqual(['TEN']);
  });

  it('starts every part at the same division, the system span being the longest lane', () => {
    const { streams, totalDiv } = buildPartSequences(lines, parts, 4);
    expect(streams.map((s) => s.events[0].startDiv)).toEqual([0, 0]);
    expect(totalDiv).toBe(8);
  });

  it('matches buildSequence for a single part', () => {
    const solo = [{ id: 'l1', lanes: [{ id: 'a', partId: 'p1', sounds: [sound('DON')] }] }];
    const one = buildPartSequences(solo, [parts[0]], 4);
    const direct = buildSequence(solo, 4);
    expect(one.streams).toHaveLength(1);
    expect(one.streams[0].events).toEqual(direct.events);
    expect(one.totalDiv).toBe(direct.totalDiv);
  });

  it('falls back to one part-less stream when there are no parts', () => {
    const { streams } = buildPartSequences(lines, [], 4);
    expect(streams).toHaveLength(1);
    expect(streams[0].partId).toBeNull();
    expect(streams[0].events.map((e) => e.name)).toEqual(['DON', 'KA']);
  });
});
