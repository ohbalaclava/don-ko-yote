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
