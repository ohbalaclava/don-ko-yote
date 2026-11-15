import { describe, it, expect, vi } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

import { lanesOf, makePart, FORMAT } from '../src/data/piece.js';
import {
  migrateScore,
  normaliseSystems,
  expandGroupsInLines,
  legacyMirror,
} from '../src/data/migrate.js';

function sym(name = 'Don', id = 's1') {
  return { id, name, hand: 'R', duration: 4 };
}

/** A pre-3.0 saved score: no format stamp, no parts, flat `{ id, sounds }` rows. */
function legacyScore(lines) {
  return {
    title: 'Old Song',
    taiko: 'Nagado',
    jiuchi: 'Gobu Gobu',
    beatsPerLine: 8,
    bpm: 120,
    lines,
  };
}

// ── Legacy → parts ────────────────────────────────────────────────────────────

describe('migrateScore on a pre-3.0 score', () => {
  it('creates one part carrying the score taiko', () => {
    const { parts, sets } = migrateScore(legacyScore([{ id: 'l1', sounds: [] }]));
    expect(parts).toHaveLength(1);
    expect(parts[0].taiko).toBe('Nagado');
    expect(sets).toEqual([]);
  });

  it('keeps the row id on the system and gives the lane a fresh one', () => {
    const { lines } = migrateScore(legacyScore([{ id: 'l1', sounds: [sym()] }]));
    expect(lines[0].id).toBe('l1');
    expect(lines[0].lanes).toHaveLength(1);
    expect(lines[0].lanes[0].id).not.toBe('l1');
  });

  it('keeps the sounds, with their ids, in the lane', () => {
    const { lines } = migrateScore(legacyScore([{ id: 'l1', sounds: [sym('Don', 'a')] }]));
    expect(lines[0].lanes[0].sounds).toEqual([sym('Don', 'a')]);
  });

  it('assigns every melody lane to the single part', () => {
    const { parts, lines } = migrateScore(
      legacyScore([
        { id: 'l1', sounds: [] },
        { id: 'l2', sounds: [] },
      ])
    );
    expect(lines.map((l) => l.lanes[0].partId)).toEqual([parts[0].id, parts[0].id]);
  });

  it('drops the legacy sounds key from the system', () => {
    const { lines } = migrateScore(legacyScore([{ id: 'l1', sounds: [sym()] }]));
    expect('sounds' in lines[0]).toBe(false);
  });

  it('keeps a row repeat count on the system', () => {
    const { lines } = migrateScore(legacyScore([{ id: 'l1', sounds: [sym()], repeat: 3 }]));
    expect(lines[0].repeat).toBe(3);
  });

  it('leaves structural rows untouched', () => {
    const heading = { id: 'h1', type: 'heading', text: 'A' };
    const marker = { id: 'b1', type: 'block-repeat', lineIds: ['l1'], count: 2 };
    const { lines } = migrateScore(legacyScore([heading, { id: 'l1', sounds: [] }, marker]));
    expect(lines[0]).toEqual(heading);
    expect(lines[2]).toEqual(marker);
  });

  it('keeps a block-repeat pointing at its system', () => {
    const { lines } = migrateScore(
      legacyScore([
        { id: 'l1', sounds: [] },
        { id: 'b1', type: 'block-repeat', lineIds: ['l1'], count: 2 },
      ])
    );
    const marker = lines.find((l) => l.type === 'block-repeat');
    expect(lines.some((l) => l.id === marker.lineIds[0])).toBe(true);
  });

  it('makes a jiuchi-section definition row a part-less lane', () => {
    const { lines } = migrateScore(
      legacyScore([
        { id: 'm1', type: 'jiuchi-section', taiko: 'Shime' },
        { id: 'd1', sounds: [sym()] },
        { id: 'v1', type: 'divider' },
        { id: 'l1', sounds: [] },
      ])
    );
    expect(lanesOf(lines[1])[0].partId).toBeNull();
    expect(lanesOf(lines[3])[0].partId).not.toBeNull();
  });

  it('expands a legacy group tile into its sounds', () => {
    const group = {
      id: 'g1',
      type: 'group',
      name: 'Roll',
      duration: 8,
      sounds: [sym('Don', 'x'), sym('Ka', 'y')],
    };
    const { lines } = migrateScore(legacyScore([{ id: 'l1', sounds: [group] }]));
    const names = lines[0].lanes[0].sounds.map((s) => s.name);
    expect(names).toEqual(['Don', 'Ka']);
    expect(lines[0].lanes[0].sounds.some((s) => s.type === 'group')).toBe(false);
  });

  it('tolerates a score with no lines at all', () => {
    const { parts, lines } = migrateScore(legacyScore(undefined));
    expect(parts).toHaveLength(1);
    expect(lines).toEqual([]);
  });
});

// ── Format-2 sources ──────────────────────────────────────────────────────────

describe('migrateScore on a 3.0 score', () => {
  function modernScore(parts, lines, sets = []) {
    return { format: FORMAT, taiko: parts[0].taiko, parts, sets, lines };
  }

  it('keeps the stored parts and sets', () => {
    const p = [makePart({ taiko: 'Shime', name: 'Ji' }), makePart({ taiko: 'Nagado' })];
    const sets = [{ id: 'set1', name: 'Player 2' }];
    p[1].setId = 'set1';
    const { parts, sets: outSets } = migrateScore(modernScore(p, [], sets));
    expect(parts.map((x) => x.name)).toEqual(['Ji', '']);
    expect(outSets).toEqual(sets);
  });

  it('is idempotent on an already-migrated score', () => {
    const p = [makePart({ taiko: 'Shime' })];
    const once = migrateScore(
      modernScore(p, [{ id: 'l1', lanes: [{ id: 'a', partId: p[0].id, sounds: [sym()] }] }])
    );
    const twice = migrateScore(modernScore(once.parts, once.lines));
    expect(twice.lines).toEqual(once.lines);
  });

  it('fills a lane for a part that has none', () => {
    const p = [makePart({ taiko: 'Shime' }), makePart({ taiko: 'Nagado' })];
    const { lines } = migrateScore(
      modernScore(p, [{ id: 'l1', lanes: [{ id: 'a', partId: p[0].id, sounds: [] }] }])
    );
    expect(lines[0].lanes).toHaveLength(2);
    expect(lines[0].lanes[1].partId).toBe(p[1].id);
    expect(lines[0].lanes[1].sounds).toEqual([]);
  });

  it('drops a lane whose part is gone', () => {
    const p = [makePart({ taiko: 'Shime' })];
    const { lines } = migrateScore(
      modernScore(p, [
        {
          id: 'l1',
          lanes: [
            { id: 'a', partId: p[0].id, sounds: [] },
            { id: 'b', partId: 'ghost', sounds: [sym()] },
          ],
        },
      ])
    );
    expect(lines[0].lanes).toHaveLength(1);
    expect(lines[0].lanes[0].id).toBe('a');
  });

  it('reorders lanes to match the part order', () => {
    const p = [makePart({ taiko: 'Shime' }), makePart({ taiko: 'Nagado' })];
    const { lines } = migrateScore(
      modernScore(p, [
        {
          id: 'l1',
          lanes: [
            { id: 'b', partId: p[1].id, sounds: [] },
            { id: 'a', partId: p[0].id, sounds: [] },
          ],
        },
      ])
    );
    expect(lines[0].lanes.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('falls back to a legacy migration when parts is empty', () => {
    const { parts, lines } = migrateScore({
      format: FORMAT,
      taiko: 'Odaiko',
      parts: [],
      lines: [{ id: 'l1', sounds: [sym()] }],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].taiko).toBe('Odaiko');
    expect(lines[0].lanes[0].sounds).toHaveLength(1);
  });

  it('drops a malformed set with no id', () => {
    const p = [makePart({ taiko: 'Shime' })];
    const { sets } = migrateScore(modernScore(p, [], [null, { name: 'nameless' }]));
    expect(sets).toEqual([]);
  });
});

// ── normaliseSystems ──────────────────────────────────────────────────────────

describe('normaliseSystems', () => {
  it('exempts a jiuchi-section definition row', () => {
    const parts = [makePart({ taiko: 'Shime' }), makePart({ taiko: 'Nagado' })];
    const lines = normaliseSystems(
      [
        { id: 'm1', type: 'jiuchi-section', taiko: 'Shime' },
        { id: 'd1', lanes: [{ id: 'a', partId: null, sounds: [] }] },
      ],
      parts
    );
    expect(lines[1].lanes).toHaveLength(1);
  });

  it('gives every melody system one lane per part', () => {
    const parts = [makePart({ taiko: 'Shime' }), makePart({ taiko: 'Nagado' })];
    const lines = normaliseSystems(
      [
        { id: 'l1', sounds: [] },
        { id: 'l2', sounds: [] },
      ],
      parts
    );
    expect(lines.map((l) => l.lanes.length)).toEqual([2, 2]);
  });
});

// ── expandGroupsInLines ───────────────────────────────────────────────────────

describe('expandGroupsInLines', () => {
  it('expands groups inside lanes of a system', () => {
    const group = { id: 'g', type: 'group', sounds: [sym('Don', 'x')], duration: 4 };
    const [row] = expandGroupsInLines([
      { id: 'l1', lanes: [{ id: 'a', partId: 'p', sounds: [group] }] },
    ]);
    expect(row.lanes[0].sounds.map((s) => s.name)).toEqual(['Don']);
  });

  it('gives expanded sounds fresh ids', () => {
    const group = { id: 'g', type: 'group', sounds: [sym('Don', 'x')], duration: 4 };
    const [row] = expandGroupsInLines([{ id: 'l1', sounds: [group] }]);
    expect(row.sounds[0].id).not.toBe('x');
  });

  it('leaves a structural row alone', () => {
    const heading = { id: 'h', type: 'heading', text: 'A' };
    expect(expandGroupsInLines([heading])[0]).toBe(heading);
  });
});

// ── legacyMirror ──────────────────────────────────────────────────────────────

describe('legacyMirror', () => {
  it('mirrors part 0 onto a legacy sounds array', () => {
    const lines = legacyMirror([
      {
        id: 'l1',
        lanes: [
          { id: 'a', partId: 'p1', sounds: [sym('Don', 'x')] },
          { id: 'b', partId: 'p2', sounds: [sym('Ka', 'y')] },
        ],
      },
    ]);
    expect(lines[0].sounds.map((s) => s.name)).toEqual(['Don']);
    expect(lines[0].lanes).toHaveLength(2);
  });

  it('leaves structural rows alone', () => {
    const heading = { id: 'h', type: 'heading', text: 'A' };
    expect(legacyMirror([heading])[0]).toBe(heading);
  });

  it('round-trips back through migrateScore to the same lanes', () => {
    const p = [makePart({ taiko: 'Shime' }), makePart({ taiko: 'Nagado' })];
    const lines = [
      {
        id: 'l1',
        lanes: [
          { id: 'a', partId: p[0].id, sounds: [sym('Don', 'x')] },
          { id: 'b', partId: p[1].id, sounds: [sym('Ka', 'y')] },
        ],
      },
    ];
    const exported = {
      format: FORMAT,
      taiko: 'Shime',
      parts: p,
      sets: [],
      lines: legacyMirror(lines),
    };
    const { lines: back } = migrateScore(exported);
    expect(back[0].lanes).toEqual(lines[0].lanes);
  });
});
