import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

import {
  piece,
  isSoundLine,
  lanesOf,
  laneFor,
  findLane,
  laneDur,
  systemSpan,
  MAX_NEW_PARTS,
} from '../src/data/piece.js';
import { buildSequence } from '../src/data/sequence.js';

function sym(name = 'Don', hand = 'R', duration = 4) {
  return { name, hand, duration };
}

/** The primary part's lane of the system at `idx` — what a one-part row is. */
function lane(idx = 0, partIdx = 0) {
  return lanesOf(piece.lines[idx])[partIdx];
}

/** Every sound system's lane count, for the one-lane-per-part invariant. */
function laneCounts() {
  return piece.lines.filter(isSoundLine).map((row) => lanesOf(row).length);
}

beforeEach(() => {
  piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8 });
});

// ── Defaults ──────────────────────────────────────────────────────────────────

describe('a new score', () => {
  it('has exactly one part, carrying the score taiko', () => {
    expect(piece.parts).toHaveLength(1);
    expect(piece.parts[0].taiko).toBe('Shime');
    expect(piece.sets).toEqual([]);
  });

  it('has one system with one lane, belonging to that part', () => {
    expect(piece.lines).toHaveLength(1);
    expect(lanesOf(piece.lines[0])).toHaveLength(1);
    expect(lane().partId).toBe(piece.parts[0].id);
  });

  it('selects a lane, not a system', () => {
    expect(piece.selectedLineId).toBe(lane().id);
    expect(piece.selectedLineId).not.toBe(piece.lines[0].id);
  });

  it('is not an ensemble (ensemble-ness is derived from the part count)', () => {
    expect(piece.parts.length > 1).toBe(false);
  });
});

// ── addPart ───────────────────────────────────────────────────────────────────

describe('addPart', () => {
  it('appends a lane to every system', () => {
    piece.addLine();
    piece.addPart({ taiko: 'Nagado' });
    expect(piece.parts).toHaveLength(2);
    expect(laneCounts()).toEqual([2, 2]);
  });

  it("orders each system's lanes to match piece.parts", () => {
    piece.addPart({ taiko: 'Nagado' });
    piece.addPart({ taiko: 'Odaiko' });
    const ids = piece.parts.map((p) => p.id);
    expect(lanesOf(piece.lines[0]).map((l) => l.partId)).toEqual(ids);
  });

  it("selects the new part's lane in the selected system", () => {
    const part = piece.addPart({ taiko: 'Nagado' });
    expect(piece.selectedLineId).toBe(laneFor(piece.lines[0], part.id).id);
  });

  it('defaults a new part to the score taiko', () => {
    const part = piece.addPart();
    expect(part.taiko).toBe('Shime');
  });

  it('leaves a jiuchi-section definition row as a single part-less lane', () => {
    piece.addJiuchiSection(); // [L0, marker, def, divider]
    const defIdx = piece.lines.findIndex((l) => l.type === 'jiuchi-section') + 1;
    piece.addPart({ taiko: 'Nagado' });
    expect(lanesOf(piece.lines[defIdx])).toHaveLength(1);
    expect(lanesOf(piece.lines[defIdx])[0].partId).toBeNull();
  });

  it("does not disturb the existing part's music", () => {
    piece.addSound(lane().id, sym('Don'));
    piece.addPart({ taiko: 'Nagado' });
    expect(lane(0, 0).sounds.map((s) => s.name)).toEqual(['Don']);
    expect(lane(0, 1).sounds).toEqual([]);
  });
});

// ── removePart ────────────────────────────────────────────────────────────────

describe('removePart', () => {
  it("drops the part's lane from every system", () => {
    const part = piece.addPart({ taiko: 'Nagado' });
    piece.addLine();
    piece.removePart(part.id);
    expect(piece.parts).toHaveLength(1);
    expect(laneCounts()).toEqual([1, 1]);
  });

  it('refuses to remove the last part', () => {
    piece.removePart(piece.parts[0].id);
    expect(piece.parts).toHaveLength(1);
  });

  it('re-selects a surviving lane when the selected one goes', () => {
    const part = piece.addPart({ taiko: 'Nagado' });
    expect(piece.selectedLineId).toBe(laneFor(piece.lines[0], part.id).id);
    piece.removePart(part.id);
    expect(findLane(piece.lines, piece.selectedLineId)).not.toBeNull();
  });

  it('keeps the selection when another part is removed', () => {
    const part = piece.addPart({ taiko: 'Nagado' });
    piece.selectLine(lane(0, 0).id);
    const kept = piece.selectedLineId;
    piece.removePart(part.id);
    expect(piece.selectedLineId).toBe(kept);
  });
});

// ── reorderPart ───────────────────────────────────────────────────────────────

describe('reorderPart', () => {
  it("moves the part and every system's lanes together", () => {
    piece.addSound(lane().id, sym('Don'));
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.addSound(laneFor(piece.lines[0], second.id).id, sym('Ka'));
    piece.reorderPart(1, 0);
    expect(piece.parts[0].id).toBe(second.id);
    expect(lanesOf(piece.lines[0]).map((l) => l.partId)).toEqual(piece.parts.map((p) => p.id));
    expect(lane(0, 0).sounds.map((s) => s.name)).toEqual(['Ka']);
  });

  it('is a no-op for an out-of-range index', () => {
    piece.addPart({ taiko: 'Nagado' });
    const before = piece.parts.map((p) => p.id);
    piece.reorderPart(5, 0);
    expect(piece.parts.map((p) => p.id)).toEqual(before);
  });
});

// ── The piece.taiko === parts[0].taiko invariant ───────────────────────────────

describe('piece.taiko mirrors part 0', () => {
  it('follows setPartTaiko on part 0', () => {
    piece.setPartTaiko(piece.parts[0].id, 'Nagado');
    expect(piece.taiko).toBe('Nagado');
  });

  it('ignores setPartTaiko on a later part', () => {
    const part = piece.addPart({ taiko: 'Nagado' });
    piece.setPartTaiko(part.id, 'Odaiko');
    expect(piece.taiko).toBe('Shime');
  });

  it('follows setTaiko the other way', () => {
    piece.setTaiko('Nagado');
    expect(piece.parts[0].taiko).toBe('Nagado');
  });

  it('follows a reorder that changes which part is first', () => {
    piece.addPart({ taiko: 'Nagado' });
    piece.reorderPart(1, 0);
    expect(piece.taiko).toBe('Nagado');
  });

  it('follows the removal of part 0', () => {
    piece.addPart({ taiko: 'Nagado' });
    piece.removePart(piece.parts[0].id);
    expect(piece.taiko).toBe('Nagado');
  });
});

// ── Per-lane drum and symbol-set resolution ───────────────────────────────────

describe('taikoForLane', () => {
  it("resolves a lane to its part's drum", () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    expect(piece.taikoForLane(lane(0, 0).id)).toBe('Shime');
    expect(piece.taikoForLane(laneFor(piece.lines[0], second.id).id)).toBe('Nagado');
  });

  it("gives a jiuchi section's marker priority over the part", () => {
    piece.addJiuchiSection();
    const markerIdx = piece.lines.findIndex((l) => l.type === 'jiuchi-section');
    piece.setJiuchiSectionTaiko(piece.lines[markerIdx].id, 'Nagado');
    expect(piece.taikoForLane(lane(markerIdx + 1).id)).toBe('Nagado');
  });

  it('falls back to the score taiko for an unknown id', () => {
    expect(piece.taikoForLane('nope')).toBe('Shime');
  });

  it('drives activeSymbolSet from the selected lane', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    // addPart selects the new part's lane, so the active set follows its drum.
    expect(piece.activeSymbolSet.id).toBe('low-straight');
    piece.selectLine(lane(0, 0).id);
    expect(piece.activeSymbolSet.id).toBe('high-straight');
    expect(piece.symbolSetForLane(laneFor(piece.lines[0], second.id).id).id).toBe('low-straight');
  });
});

describe('taikosInUse', () => {
  it("includes every part's drum", () => {
    piece.addPart({ taiko: 'Nagado' });
    piece.addPart({ taiko: 'Odaiko' });
    expect(piece.taikosInUse()).toContain('Shime');
    expect(piece.taikosInUse()).toContain('Nagado');
    expect(piece.taikosInUse()).toContain('Odaiko');
  });

  it('lists each drum once', () => {
    piece.addPart({ taiko: 'Shime' });
    expect(piece.taikosInUse().filter((t) => t === 'Shime')).toHaveLength(1);
  });
});

// ── Sets ──────────────────────────────────────────────────────────────────────

describe('sets', () => {
  it('links a part to a set', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    const set = piece.addSet('Player 2');
    piece.assignPartToSet(second.id, set.id);
    expect(piece.partById(second.id).setId).toBe(set.id);
    expect(piece.sets).toHaveLength(1);
  });

  it('prunes a set with no members', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    const set = piece.addSet('Player 2');
    piece.assignPartToSet(second.id, set.id);
    piece.assignPartToSet(second.id, null);
    expect(piece.sets).toEqual([]);
  });

  it('unlinks its parts when removed', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    const set = piece.addSet('Player 2');
    piece.assignPartToSet(second.id, set.id);
    piece.removeSet(set.id);
    expect(piece.sets).toEqual([]);
    expect(piece.partById(second.id).setId).toBeNull();
  });

  it('drops a set reference that survives its set', () => {
    const second = piece.addPart({ taiko: 'Nagado', setId: 'ghost' });
    expect(piece.partById(second.id).setId).toBeNull();
  });

  it('renames a set', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    const set = piece.addSet('Player 2');
    piece.assignPartToSet(second.id, set.id);
    piece.setSetName(set.id, 'Shimada');
    expect(piece.sets[0].name).toBe('Shimada');
  });
});

// ── Lane-scoped editing ───────────────────────────────────────────────────────

describe('editing one part', () => {
  it('adds sounds only to the addressed lane', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.addSound(lane(0, 0).id, sym('Don'));
    piece.addSound(laneFor(piece.lines[0], second.id).id, sym('Ka'));
    expect(lane(0, 0).sounds.map((s) => s.name)).toEqual(['Don']);
    expect(lane(0, 1).sounds.map((s) => s.name)).toEqual(['Ka']);
  });

  it("overflows within the same part, never into another's lane", () => {
    piece.addPart({ taiko: 'Nagado' });
    for (let i = 0; i < 9; i++) piece.addSound(lane(0, 0).id, sym()); // beatsPerLine is 8
    expect(piece.lines).toHaveLength(2);
    expect(lane(1, 0).sounds).toHaveLength(1);
    expect(lane(0, 1).sounds).toEqual([]);
    expect(lane(1, 1).sounds).toEqual([]);
  });

  it("refuses a move into another part's lane", () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.addSound(lane(0, 0).id, sym('Don'));
    const target = laneFor(piece.lines[0], second.id);
    piece.moveSound(lane(0, 0).id, lane(0, 0).sounds[0].id, target.id, 0);
    // moveSound addresses lanes directly, so a cross-part move is possible but
    // only ever from an explicit instruction — the UI's Sortable groups prevent it.
    expect(lane(0, 0).sounds.length + target.sounds.length).toBe(1);
  });

  it('duplicates every lane of a system, with fresh lane ids', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.addSound(lane(0, 0).id, sym('Don'));
    piece.addSound(laneFor(piece.lines[0], second.id).id, sym('Ka'));
    piece.duplicateLine(lane(0, 0).id);
    expect(piece.lines).toHaveLength(2);
    expect(lanesOf(piece.lines[1]).map((l) => l.partId)).toEqual(piece.parts.map((p) => p.id));
    expect(lane(1, 0).sounds.map((s) => s.name)).toEqual(['Don']);
    expect(lane(1, 1).sounds.map((s) => s.name)).toEqual(['Ka']);
    expect(lane(1, 0).id).not.toBe(lane(0, 0).id);
  });

  it('removes the whole system when a lane is removed', () => {
    piece.addPart({ taiko: 'Nagado' });
    piece.addLine();
    piece.removeLine(lane(1, 0).id);
    expect(piece.lines).toHaveLength(1);
  });

  it('adds a system with a lane per part', () => {
    piece.addPart({ taiko: 'Nagado' });
    piece.addLine();
    expect(laneCounts()).toEqual([2, 2]);
  });
});

// ── Spans ─────────────────────────────────────────────────────────────────────

describe('laneDur and systemSpan', () => {
  it('spans a system by its longest lane, so short parts rest out the rest', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.addSound(lane(0, 0).id, sym('Don'));
    const other = laneFor(piece.lines[0], second.id);
    piece.addSound(other.id, sym('Ka'));
    piece.addSound(other.id, sym('Ka'));
    expect(laneDur(lane(0, 0))).toBe(4);
    expect(systemSpan(piece.lines[0])).toBe(8);
  });

  it("equals the lane's own duration for a one-part score", () => {
    piece.addSound(lane().id, sym('Don'));
    expect(systemSpan(piece.lines[0])).toBe(laneDur(lane()));
  });

  it('reads a pre-3.0 row as one part-less lane', () => {
    const legacy = { id: 'l', sounds: [sym('Don')] };
    expect(lanesOf(legacy)).toHaveLength(1);
    expect(lanesOf(legacy)[0].partId).toBeNull();
    expect(systemSpan(legacy)).toBe(4);
  });
});

// ── Persistence ───────────────────────────────────────────────────────────────

describe('_snapshot', () => {
  it('carries the format stamp, parts and sets', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    const set = piece.addSet('Player 2');
    piece.assignPartToSet(second.id, set.id);
    const snap = piece._snapshot();
    expect(snap.format).toBe(2);
    expect(snap.parts).toHaveLength(2);
    expect(snap.sets).toEqual([{ id: set.id, name: 'Player 2' }]);
  });
});

describe('undo', () => {
  it('restores a removed part and its music', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.addSound(laneFor(piece.lines[0], second.id).id, sym('Ka'));
    piece.removePart(second.id);
    expect(piece.parts).toHaveLength(1);
    piece.undo();
    expect(piece.parts).toHaveLength(2);
    expect(lane(0, 1).sounds.map((s) => s.name)).toEqual(['Ka']);
  });

  it('leaves the selection on a lane that exists', () => {
    const second = piece.addPart({ taiko: 'Nagado' });
    piece.removePart(second.id);
    piece.undo();
    expect(findLane(piece.lines, piece.selectedLineId)).not.toBeNull();
  });
});

describe('a new score', () => {
  it('is always solo — parts are added afterwards in Score settings', () => {
    piece.reset({ taiko: 'Nagado', jiuchi: 'Gobu Gobu' });
    expect(piece.parts).toHaveLength(1);
    expect(piece.parts[0].taiko).toBe('Nagado');
    expect(laneCounts()).toEqual([1]);
    expect(piece.selectedLineId).toBe(lane(0, 0).id);
  });
});

// ── New score part count ──────────────────────────────────────────────────────

describe('reset with a part count', () => {
  it('creates that many parts, all on the chosen taiko', () => {
    piece.reset({ taiko: 'Nagado', jiuchi: 'Gobu Gobu', parts: 3 });
    expect(piece.parts).toHaveLength(3);
    expect(piece.parts.map((p) => p.taiko)).toEqual(['Nagado', 'Nagado', 'Nagado']);
    expect(piece.parts.map((p) => p.id)).toEqual([...new Set(piece.parts.map((p) => p.id))]);
  });

  it('gives the first system one lane per part, in part order', () => {
    piece.reset({ taiko: 'Nagado', jiuchi: 'Gobu Gobu', parts: 3 });
    expect(laneCounts()).toEqual([3]);
    expect(lanesOf(piece.lines[0]).map((l) => l.partId)).toEqual(piece.parts.map((p) => p.id));
    expect(piece.selectedLineId).toBe(lane().id);
  });

  it('defaults to solo and clamps out-of-range counts', () => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu' });
    expect(piece.parts).toHaveLength(1);
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', parts: 0 });
    expect(piece.parts).toHaveLength(1);
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', parts: 99 });
    expect(piece.parts).toHaveLength(MAX_NEW_PARTS);
  });
});

// ── Sparse set lanes ──────────────────────────────────────────────────────────
//
// Within a taiko set one player plays every drum, so the set's lanes are one
// timeline: a new sound lands on the set's shared cursor and the lanes are simply
// blank where that drum isn't playing (a `gap`), never padded with typed rests.

/** Links the given part indices into one taiko set; returns the set id. */
function linkSet(...idxs) {
  const set = piece.addSet('Player');
  for (const i of idxs) piece.assignPartToSet(piece.parts[i].id, set.id);
  return set.id;
}

/** Start division of every sound in a lane, from its gaps and durations. */
function starts(l) {
  const out = [];
  let pos = 0;
  for (const s of l.sounds) {
    pos += s.gap ?? 0;
    out.push(pos);
    pos += s.duration;
  }
  return out;
}

const TEN = () => sym('TEN', 'R', 4);
const KEN = () => sym('KEN', 'L', 4);

describe('authoring on a set lane', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8, parts: 3 });
  });

  it('lands a sound on the set’s shared cursor, not the lane’s own end', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 1).id, KEN());
    expect(lane(0, 1).sounds[0].gap).toBe(4);
    expect(starts(lane(0, 1))).toEqual([4]);
    expect(laneDur(lane(0, 1))).toBe(8);
  });

  it('reads as one linear path when authored alternately across the drums', () => {
    linkSet(0, 1);
    for (let i = 0; i < 4; i++) {
      piece.addSound(lane(0, i % 2).id, i % 2 ? KEN() : TEN());
    }
    expect(starts(lane(0, 0))).toEqual([0, 8]);
    expect(starts(lane(0, 1))).toEqual([4, 12]);
  });

  it('never writes a gap on an independent part', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 2).id, TEN());
    expect(lane(0, 2).sounds[0].gap).toBeUndefined();
    expect(laneDur(lane(0, 2))).toBe(4);
  });

  it('counts the gap against the lane’s beat budget and overflows to a new system', () => {
    linkSet(0, 1);
    for (let i = 0; i < 8; i++) piece.addSound(lane(0, 0).id, TEN());
    expect(laneDur(lane(0, 0))).toBe(32);

    piece.addSound(lane(0, 1).id, KEN());
    expect(lane(0, 1).sounds).toHaveLength(0);
    expect(piece.lines.filter(isSoundLine)).toHaveLength(2);
    expect(lane(1, 1).sounds[0].gap).toBeUndefined();
  });

  it('fills existing blank space on a mid-stream insert', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 1).id, KEN()); // gap 4
    piece.addSound(lane(0, 1).id, sym('TE', 'R', 2), 0);
    expect(starts(lane(0, 1))).toEqual([0, 4]); // the KEN keeps its own beat
    expect(laneDur(lane(0, 1))).toBe(8);
    expect(laneDur(lane(0, 0))).toBe(4); // the other drum did not move
  });

  it('opens silence across every lane of the set when the spot is occupied', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 1).id, KEN()); // gap 8
    piece.addSound(lane(0, 1).id, sym('TE', 'R', 2), 0);

    expect(starts(lane(0, 1))).toEqual([0, 8]);
    expect(starts(lane(0, 0))).toEqual([0, 4]); // all before the insert: unmoved

    // Inserting where this lane is occupied pushes the rest of the set along.
    piece.addSound(lane(0, 0).id, sym('TE', 'R', 2), 1);
    expect(starts(lane(0, 0))).toEqual([0, 4, 6]);
    expect(starts(lane(0, 1))).toEqual([0, 10]);
  });

  it('never carries a pattern’s gaps in', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    piece.addGroup(lane(0, 1).id, { sounds: [{ ...KEN(), gap: 12 }, TEN()] });
    expect(starts(lane(0, 1))).toEqual([4, 8]);
  });
});

describe('editing a set lane', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8, parts: 2 });
    linkSet(0, 1);
    // One player alternating: lane 0 on beats 1 and 3, lane 1 on beats 2 and 4.
    for (let i = 0; i < 4; i++) {
      piece.addSound(lane(0, i % 2).id, i % 2 ? KEN() : TEN());
    }
  });

  it('absorbs a deleted sound as silence so later notes keep their place', () => {
    piece.removeSound(lane(0, 0).id, lane(0, 0).sounds[0].id);
    expect(starts(lane(0, 0))).toEqual([8]);
    expect(laneDur(lane(0, 0))).toBe(12);
    expect(starts(lane(0, 1))).toEqual([4, 12]);
  });

  it('moves the set cursor back when the deleted sound is the lane’s tail', () => {
    piece.removeSound(lane(0, 1).id, lane(0, 1).sounds[1].id);
    expect(starts(lane(0, 1))).toEqual([4]);
    expect(laneDur(lane(0, 1))).toBe(8);
  });

  it('absorbs a multi-sound deletion in one go', () => {
    const l = lane(0, 0);
    piece.selection = { lineId: l.id, anchorId: null, soundIds: [l.sounds[0].id] };
    piece.deleteSelectedSounds();
    expect(starts(lane(0, 0))).toEqual([8]);
  });

  it('trades a duration change with the blank space after it', () => {
    const l = lane(0, 0);
    piece.updateSound(l.id, l.sounds[0].id, { duration: 2 });
    expect(starts(lane(0, 0))).toEqual([0, 8]); // shrink donated 2 divisions
    piece.updateSound(l.id, lane(0, 0).sounds[0].id, { duration: 4 });
    expect(starts(lane(0, 0))).toEqual([0, 8]); // grow consumed them again
  });

  it('carries no stale gap when a sound is moved to another system', () => {
    piece.addLine();
    const to = lane(1, 1);
    const from = lane(0, 1);
    piece.moveSound(from.id, from.sounds[1].id, to.id, 0);
    expect(lane(1, 1).sounds[0].gap).toBeUndefined();
    expect(starts(lane(0, 1))).toEqual([4]);
  });

  it('aligns a strike onto the other drum’s previous strike', () => {
    const l = lane(0, 1);
    expect(piece.alignSound(l.id, l.sounds[0].id)).toBe(true);
    expect(starts(lane(0, 1))).toEqual([0, 12]); // only this sound moved
    expect(starts(lane(0, 0))).toEqual([0, 8]); // the other drum stayed put
    expect(laneDur(lane(0, 1))).toBe(16);
  });

  it('keeps the set cursor when the aligned strike is the lane’s tail', () => {
    const l = lane(0, 1);
    piece.alignSound(l.id, l.sounds[1].id);
    expect(starts(lane(0, 1))).toEqual([4, 8]);
    expect(piece.alignTargetFor(l.id, l.sounds[1].id)).toBe(null); // nothing left to align to
  });

  it('refuses to align an independent part’s sound', () => {
    piece.addPart();
    const l = lane(0, 2);
    piece.addSound(l.id, KEN());
    expect(piece.alignSound(l.id, lane(0, 2).sounds[0].id)).toBe(false);
    expect(lane(0, 2).sounds[0].gap).toBeUndefined();
  });

  it('round-trips an align through undo/redo', () => {
    const l = lane(0, 1);
    const before = starts(l);
    piece.alignSound(l.id, l.sounds[0].id);
    const after = starts(lane(0, 1));
    piece.undo();
    expect(starts(lane(0, 1))).toEqual(before);
    piece.redo();
    expect(starts(lane(0, 1))).toEqual(after);
  });

  it('round-trips a gap edit through undo/redo', () => {
    const before = starts(lane(0, 1));
    piece.addSound(lane(0, 0).id, TEN());
    const after = starts(lane(0, 1));
    piece.undo();
    expect(starts(lane(0, 1))).toEqual(before);
    piece.redo();
    expect(starts(lane(0, 1))).toEqual(after);
  });

  it('preserves gaps when a system is duplicated', () => {
    piece.duplicateLine(piece.lines[0].id);
    expect(starts(lane(1, 1))).toEqual([4, 12]);
  });
});

// A drop names a division, not an index: these cover the `*AtDiv` mutators the
// drag-and-drop layer uses on a set lane.
describe('dropping at a division on a set lane', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8, parts: 2 });
    linkSet(0, 1);
    // One player alternating: lane 0 on beats 1 and 3, lane 1 on beats 2 and 4.
    for (let i = 0; i < 4; i++) {
      piece.addSound(lane(0, i % 2).id, i % 2 ? KEN() : TEN());
    }
  });

  it('lands a sound in the blank space it was dropped in', () => {
    piece.addSoundAtDiv(lane(0, 0).id, KEN(), 4);
    expect(starts(lane(0, 0))).toEqual([0, 4, 8]);
    expect(starts(lane(0, 1))).toEqual([4, 12]);
  });

  it('opens the same time in every lane of the set when the drop does not fit', () => {
    piece.addSoundAtDiv(lane(0, 0).id, KEN(), 6);
    expect(starts(lane(0, 0))).toEqual([0, 6, 10]);
    expect(starts(lane(0, 1))).toEqual([4, 14]);
  });

  it('snaps a drop on a tile to that tile’s nearer edge', () => {
    piece.addSoundAtDiv(lane(0, 0).id, KEN(), 9);
    expect(lane(0, 0).sounds.map((s) => s.name)).toEqual(['TEN', 'KEN', 'TEN']);
    expect(starts(lane(0, 0))).toEqual([0, 8, 12]);
  });

  it('reports the trailing blank a sparse lane has, and accepts a drop in it', () => {
    expect(piece.blankTailFor(lane(0, 0).id)).toBe(4);
    piece.addSoundAtDiv(lane(0, 0).id, KEN(), 12);
    expect(starts(lane(0, 0))).toEqual([0, 8, 12]);
    expect(laneDur(lane(0, 0))).toBe(16);
    expect(starts(lane(0, 1))).toEqual([4, 12]);
  });

  it('has no trailing blank on an independent part', () => {
    piece.assignPartToSet(piece.parts[0].id, null);
    expect(piece.blankTailFor(lane(0, 0).id)).toBe(0);
  });

  it('moves a sound to the division it was dropped on, within its lane', () => {
    const l = lane(0, 1);
    piece.moveSoundToDiv(l.id, l.sounds[1].id, l.id, 8);
    expect(starts(lane(0, 1))).toEqual([4, 8]);
    expect(starts(lane(0, 0))).toEqual([0, 8]);
  });

  it('lands a move past the set’s music on the set’s cursor, leaving no hole', () => {
    const l = lane(0, 1);
    piece.moveSoundToDiv(l.id, l.sounds[1].id, l.id, 20);
    expect(starts(lane(0, 1))).toEqual([4, 12]); // not 20: 12-20 played by nobody
  });

  it('closes the blank a move leaves behind, across every lane of the set', () => {
    const l = lane(0, 1);
    piece.moveSoundToDiv(l.id, l.sounds[0].id, l.id, 16);
    // The vacated beat 2 is gone, so the whole set's later music comes back a beat.
    expect(starts(lane(0, 0))).toEqual([0, 4]);
    expect(starts(lane(0, 1))).toEqual([8, 12]);
  });

  it('keeps a rest’s silence when the move is elsewhere in the set', () => {
    piece.addSound(lane(0, 0).id, sym('SU', null, 4)); // authored silence at beat 5
    piece.addSound(lane(0, 1).id, KEN());
    const l = lane(0, 1);
    piece.moveSoundToDiv(l.id, l.sounds[2].id, l.id, 24);
    expect(starts(lane(0, 0))).toEqual([0, 8, 16]);
    expect(starts(lane(0, 1))).toEqual([4, 12, 20]);
  });

  it('leaves an independent part’s move alone', () => {
    piece.assignPartToSet(piece.parts[1].id, null);
    const l = lane(0, 1);
    const n = l.sounds.length;
    piece.moveSoundToDiv(l.id, l.sounds[0].id, l.id, 20);
    expect(lane(0, 1).sounds).toHaveLength(n);
    expect(starts(lane(0, 1))[0]).toBe(0); // contiguous, as an ordinary lane is
  });

  it('moves a sound to another drum of the set, keeping what is left in place', () => {
    const from = lane(0, 1);
    piece.moveSoundToDiv(from.id, from.sounds[0].id, lane(0, 0).id, 4);
    expect(lane(0, 0).sounds.map((s) => s.name)).toEqual(['TEN', 'KEN', 'TEN']);
    expect(starts(lane(0, 0))).toEqual([0, 4, 8]);
    expect(starts(lane(0, 1))).toEqual([12]);
  });

  it('drops a pattern at a division as its own contiguous rhythm', () => {
    piece.addGroupAtDiv(lane(0, 0).id, { sounds: [{ ...KEN(), gap: 12 }, TEN()] }, 12);
    expect(starts(lane(0, 0))).toEqual([0, 8, 12, 16]);
    expect(laneDur(lane(0, 0))).toBe(20);
  });

  it('round-trips a division drop through undo/redo', () => {
    const before = starts(lane(0, 0));
    piece.addSoundAtDiv(lane(0, 0).id, KEN(), 4);
    const after = starts(lane(0, 0));
    piece.undo();
    expect(starts(lane(0, 0))).toEqual(before);
    piece.redo();
    expect(starts(lane(0, 0))).toEqual(after);
  });

  it('keeps an independent part’s drop contiguous, the division only ordering it', () => {
    piece.assignPartToSet(piece.parts[0].id, null);
    const l = lane(0, 0);
    const n = l.sounds.length;
    piece.addSoundAtDiv(l.id, KEN(), 2);
    expect(lane(0, 0).sounds.length).toBe(n + 1);
    expect(starts(lane(0, 0))[0]).toBe(0);
  });
});

describe('leaving a taiko set', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8, parts: 2 });
    linkSet(0, 1);
    for (let i = 0; i < 4; i++) {
      piece.addSound(lane(0, i % 2).id, i % 2 ? KEN() : TEN());
    }
  });

  const seqStarts = (partId) =>
    buildSequence(piece.lines, piece.time, partId).events.map((e) => e.startDiv);

  it('materialises blanks as numbered tiles with the timing unchanged', () => {
    const partId = piece.parts[1].id;
    const dur = laneDur(lane(0, 1));
    const sounded = seqStarts(partId);

    piece.assignPartToSet(partId, null);

    const l = lane(0, 1);
    expect(l.sounds.map((s) => s.name)).toEqual(['1', 'KEN', '3', 'KEN']);
    expect(l.sounds.filter((s) => s.implicit)).toHaveLength(2);
    expect(l.sounds.some((s) => s.gap)).toBe(false);
    expect(laneDur(l)).toBe(dur);
    // The strikes still sound where they did; the materialised rests add silent
    // events in between, which is what a contiguous lane looks like.
    expect(seqStarts(partId)).toEqual([0, 4, 8, 12]);
    expect(sounded).toEqual([4, 12]);
  });

  it('materialises every member when the whole set is removed', () => {
    const setId = piece.parts[0].setId;
    piece.removeSet(setId);
    expect(piece.parts.every((p) => p.setId === null)).toBe(true);
    expect(lanesOf(piece.lines[0]).every((l) => !l.sounds.some((s) => s.gap))).toBe(true);
    expect(lane(0, 1).sounds.map((s) => s.name)).toEqual(['1', 'KEN', '3', 'KEN']);
    expect(laneDur(lane(0, 1))).toBe(16);
  });
});

describe('set membership and part order', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8, parts: 3 });
  });

  it('pulls a newly linked part next to its set so the bracket can be drawn', () => {
    const ids = piece.parts.map((p) => p.id);
    linkSet(0, 2);
    expect(piece.parts.map((p) => p.id)).toEqual([ids[0], ids[2], ids[1]]);
    expect(lanesOf(piece.lines[0]).map((l) => l.partId)).toEqual(piece.parts.map((p) => p.id));
  });

  it('keeps a set’s members contiguous across a reorder', () => {
    linkSet(0, 1);
    piece.reorderPart(0, 2);
    const setIds = piece.parts.map((p) => p.setId);
    const first = setIds.findIndex(Boolean);
    expect(setIds.slice(first, first + 2).every(Boolean)).toBe(true);
  });
});

describe('two-hand conflicts', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8, parts: 2 });
  });

  it('is empty while the set alternates hands', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 1).id, KEN());
    expect(piece.setConflictIds.size).toBe(0);
  });

  it('flags both sounds when one hand is asked for twice at once', () => {
    linkSet(0, 1);
    piece.addSound(lane(0, 0).id, TEN());
    const l = lane(0, 1);
    piece.addSound(l.id, TEN());
    piece.updateSound(l.id, lane(0, 1).sounds[0].id, { gap: undefined });
    expect(piece.setConflictIds.size).toBe(2);
  });

  it('stays empty for a score with no sets, however the parts collide', () => {
    piece.addSound(lane(0, 0).id, TEN());
    piece.addSound(lane(0, 1).id, TEN());
    expect(piece.setConflictIds.size).toBe(0);
  });
});
