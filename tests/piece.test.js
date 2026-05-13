import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({}));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

import { piece } from '../src/data/piece.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sym(name = 'Don', hand = 'R', duration = 1) {
  return { name, hand, duration };
}

function line(idx = 0) {
  return piece.lines[idx];
}
function sounds(lineIdx = 0) {
  return piece.lines[lineIdx].sounds;
}

beforeEach(() => {
  piece.reset('gobu-gobu', 8);
});

// ── addSound ──────────────────────────────────────────────────────────────────

describe('addSound', () => {
  it('appends a sound to the end of the line', () => {
    piece.addSound(line().id, sym('Don'));
    expect(sounds()).toHaveLength(1);
    expect(sounds()[0].name).toBe('Don');
  });

  it('inserts at a specific index', () => {
    piece.addSound(line().id, sym('A'));
    piece.addSound(line().id, sym('B'));
    piece.addSound(line().id, sym('X'), 1);
    expect(sounds()[1].name).toBe('X');
  });

  it('is a no-op for an unknown lineId', () => {
    piece.addSound('nope', sym('Don'));
    expect(sounds()).toHaveLength(0);
  });

  it('overflows to the next line when current line is full', () => {
    for (let i = 0; i < 8; i++) piece.addSound(line().id, sym());
    piece.addSound(line().id, sym('Over'));
    expect(piece.lines).toHaveLength(2);
    expect(sounds(1)[0].name).toBe('Over');
  });

  it('creates a new line when all existing lines are full', () => {
    for (let i = 0; i < 8; i++) piece.addSound(line().id, sym());
    piece.addLine();
    for (let i = 0; i < 8; i++) piece.addSound(piece.lines[1].id, sym());
    piece.addSound(piece.lines[1].id, sym('New'));
    expect(piece.lines).toHaveLength(3);
    expect(sounds(2)[0].name).toBe('New');
  });
});

// ── moveSound ─────────────────────────────────────────────────────────────────

describe('moveSound', () => {
  it('reorders sounds within the same line', () => {
    piece.addSound(line().id, sym('A'));
    piece.addSound(line().id, sym('B'));
    piece.moveSound(line().id, sounds()[0].id, line().id, 1);
    expect(sounds()[0].name).toBe('B');
    expect(sounds()[1].name).toBe('A');
  });

  it('moves a sound to a different line', () => {
    piece.addSound(line().id, sym('A'));
    piece.addLine();
    const idA = sounds(0)[0].id;
    piece.moveSound(line(0).id, idA, line(1).id, 0);
    expect(sounds(0)).toHaveLength(0);
    expect(sounds(1)[0].name).toBe('A');
  });

  it('rejects a cross-line move that would overflow the target', () => {
    for (let i = 0; i < 8; i++) piece.addSound(line().id, sym());
    piece.addLine();
    for (let i = 0; i < 8; i++) piece.addSound(piece.lines[1].id, sym());
    const srcId = piece.lines[0].sounds[0].id;
    piece.moveSound(piece.lines[0].id, srcId, piece.lines[1].id, 0);
    expect(piece.lines[0].sounds).toHaveLength(8);
    expect(piece.lines[1].sounds).toHaveLength(8);
  });

  it('is a no-op for an unknown soundId', () => {
    piece.addSound(line().id, sym('A'));
    piece.moveSound(line().id, 'nope', line().id, 0);
    expect(sounds()[0].name).toBe('A');
  });
});

// ── moveSounds ────────────────────────────────────────────────────────────────

describe('moveSounds', () => {
  it('moves multiple sounds to another line', () => {
    piece.addSound(line().id, sym('A'));
    piece.addSound(line().id, sym('B'));
    piece.addSound(line().id, sym('C'));
    const ids = [sounds()[0].id, sounds()[1].id];
    piece.addLine();
    piece.moveSounds(line(0).id, ids, line(1).id, 0);
    expect(sounds(0)).toHaveLength(1);
    expect(sounds(0)[0].name).toBe('C');
    expect(sounds(1)).toHaveLength(2);
  });

  it('preserves the relative order of moved sounds', () => {
    piece.addSound(line().id, sym('A'));
    piece.addSound(line().id, sym('B'));
    const ids = sounds().map((s) => s.id);
    piece.addLine();
    piece.moveSounds(line(0).id, ids, line(1).id, 0);
    expect(sounds(1)[0].name).toBe('A');
    expect(sounds(1)[1].name).toBe('B');
  });

  it('rejects a cross-line move that would overflow', () => {
    for (let i = 0; i < 8; i++) piece.addSound(line().id, sym());
    piece.addLine();
    for (let i = 0; i < 7; i++) piece.addSound(piece.lines[1].id, sym());
    const ids = [piece.lines[0].sounds[0].id, piece.lines[0].sounds[1].id];
    piece.moveSounds(piece.lines[0].id, ids, piece.lines[1].id, 0);
    expect(piece.lines[0].sounds).toHaveLength(8);
    expect(piece.lines[1].sounds).toHaveLength(7);
  });
});

// ── removeSound ───────────────────────────────────────────────────────────────

describe('removeSound', () => {
  it('removes the sound from the line', () => {
    piece.addSound(line().id, sym('A'));
    piece.removeSound(line().id, sounds()[0].id);
    expect(sounds()).toHaveLength(0);
  });

  it('is a no-op for an unknown soundId', () => {
    piece.addSound(line().id, sym('A'));
    piece.removeSound(line().id, 'nope');
    expect(sounds()).toHaveLength(1);
  });
});

// ── updateSound ───────────────────────────────────────────────────────────────

describe('updateSound', () => {
  it('merges patch properties onto the sound', () => {
    piece.addSound(line().id, sym('Don', 'R'));
    const id = sounds()[0].id;
    piece.updateSound(line().id, id, { hand: 'L', instruction: 'forte' });
    expect(sounds()[0].hand).toBe('L');
    expect(sounds()[0].instruction).toBe('forte');
  });

  it('does not overwrite properties absent from the patch', () => {
    piece.addSound(line().id, sym('Don', 'R'));
    const id = sounds()[0].id;
    piece.updateSound(line().id, id, { instruction: 'p' });
    expect(sounds()[0].name).toBe('Don');
    expect(sounds()[0].hand).toBe('R');
  });
});

// ── addGroup ──────────────────────────────────────────────────────────────────

describe('addGroup', () => {
  const twoBeats = {
    name: 'Pat',
    sounds: [
      { name: 'A', hand: 'R', duration: 1 },
      { name: 'B', hand: 'L', duration: 1 },
    ],
  };

  it('adds a group tile when the pattern fits in the line', () => {
    piece.addGroup(line().id, twoBeats);
    expect(sounds()).toHaveLength(1);
    expect(sounds()[0].type).toBe('group');
    expect(sounds()[0].name).toBe('Pat');
    expect(sounds()[0].duration).toBe(2);
  });

  it('inserts at a specific index', () => {
    piece.addSound(line().id, sym('X'));
    piece.addGroup(line().id, twoBeats, 0);
    expect(sounds()[0].type).toBe('group');
    expect(sounds()[1].name).toBe('X');
  });

  it('distributes individual sounds across lines when pattern exceeds beatsPerLine', () => {
    piece.reset('gobu-gobu', 2);
    const threeBeat = {
      name: 'Big',
      sounds: [
        { name: 'A', hand: 'R', duration: 1 },
        { name: 'B', hand: 'L', duration: 1 },
        { name: 'C', hand: 'R', duration: 1 },
      ],
    };
    piece.addGroup(line().id, threeBeat);
    const totalSounds = piece.lines.reduce((n, l) => n + l.sounds.length, 0);
    expect(totalSounds).toBe(3);
    expect(piece.lines.length).toBeGreaterThan(1);
    // No group tiles — each sound is placed individually
    piece.lines.forEach((l) => l.sounds.forEach((s) => expect(s.type).toBeUndefined()));
  });
});

// ── expandGroup ───────────────────────────────────────────────────────────────

describe('expandGroup', () => {
  it('replaces the group tile with its constituent sounds', () => {
    piece.addGroup(line().id, {
      name: 'Pat',
      sounds: [
        { name: 'A', hand: 'R', duration: 1 },
        { name: 'B', hand: 'L', duration: 1 },
      ],
    });
    piece.expandGroup(line().id, sounds()[0].id);
    expect(sounds()).toHaveLength(2);
    expect(sounds()[0].name).toBe('A');
    expect(sounds()[1].name).toBe('B');
  });

  it('assigns fresh ids to the expanded sounds', () => {
    const originalIds = ['orig-1', 'orig-2'];
    piece.addGroup(line().id, {
      name: 'Pat',
      sounds: [
        { id: originalIds[0], name: 'A', hand: 'R', duration: 1 },
        { id: originalIds[1], name: 'B', hand: 'L', duration: 1 },
      ],
    });
    piece.expandGroup(line().id, sounds()[0].id);
    expect(sounds()[0].id).not.toBe(originalIds[0]);
    expect(sounds()[1].id).not.toBe(originalIds[1]);
  });

  it('is a no-op for a non-group sound', () => {
    piece.addSound(line().id, sym('Don'));
    const id = sounds()[0].id;
    piece.expandGroup(line().id, id);
    expect(sounds()).toHaveLength(1);
    expect(sounds()[0].name).toBe('Don');
  });
});

// ── toggleSoundSelection ──────────────────────────────────────────────────────

describe('toggleSoundSelection', () => {
  it('selects the anchor on the first tap', () => {
    piece.addSound(line().id, sym('A'));
    const id = sounds()[0].id;
    piece.toggleSoundSelection(line().id, id);
    expect(piece.selection.anchorId).toBe(id);
    expect(piece.selection.soundIds).toEqual([id]);
  });

  it('deselects when tapping the anchor while it is the only selection', () => {
    piece.addSound(line().id, sym('A'));
    const id = sounds()[0].id;
    piece.toggleSoundSelection(line().id, id);
    piece.toggleSoundSelection(line().id, id);
    expect(piece.selection.soundIds).toEqual([]);
    expect(piece.selection.lineId).toBeNull();
  });

  it('extends the selection from the anchor to the tapped sound', () => {
    piece.addSound(line().id, sym('A'));
    piece.addSound(line().id, sym('B'));
    piece.addSound(line().id, sym('C'));
    const [idA, idB, idC] = sounds().map((s) => s.id);
    piece.toggleSoundSelection(line().id, idA);
    piece.toggleSoundSelection(line().id, idC);
    expect(piece.selection.soundIds).toEqual([idA, idB, idC]);
    expect(piece.selection.anchorId).toBe(idA);
  });

  it('works in both directions from the anchor', () => {
    piece.addSound(line().id, sym('A'));
    piece.addSound(line().id, sym('B'));
    piece.addSound(line().id, sym('C'));
    const [idA, idB, idC] = sounds().map((s) => s.id);
    piece.toggleSoundSelection(line().id, idC); // anchor = C
    piece.toggleSoundSelection(line().id, idA); // extend backwards to A
    expect(piece.selection.soundIds).toEqual([idA, idB, idC]);
  });

  it('resets to a new anchor when tapping a sound on a different line', () => {
    piece.addSound(line().id, sym('A'));
    piece.addLine();
    piece.addSound(piece.lines[1].id, sym('B'));
    piece.toggleSoundSelection(line(0).id, sounds(0)[0].id);
    piece.toggleSoundSelection(line(1).id, sounds(1)[0].id);
    expect(piece.selection.lineId).toBe(line(1).id);
    expect(piece.selection.soundIds).toEqual([sounds(1)[0].id]);
  });
});

// ── removeLine ────────────────────────────────────────────────────────────────

describe('removeLine', () => {
  it('removes the specified line', () => {
    piece.addLine();
    const idToRemove = piece.lines[1].id;
    piece.removeLine(idToRemove);
    expect(piece.lines).toHaveLength(1);
    expect(piece.lines.find((l) => l.id === idToRemove)).toBeUndefined();
  });

  it('always keeps at least one line', () => {
    const id = line().id;
    piece.removeLine(id);
    expect(piece.lines).toHaveLength(1);
  });

  it('selects the nearest remaining line when the selected line is removed', () => {
    piece.addLine();
    piece.addLine();
    const [id0, id1, id2] = piece.lines.map((l) => l.id);
    piece.selectLine(id1);
    piece.removeLine(id1);
    expect([id0, id2]).toContain(piece.selectedLineId);
  });
});

// ── duplicateLine ─────────────────────────────────────────────────────────────

describe('duplicateLine', () => {
  it('inserts a copy immediately after the original', () => {
    piece.addSound(line().id, sym('A'));
    piece.addLine();
    piece.addSound(piece.lines[1].id, sym('B'));
    piece.duplicateLine(piece.lines[0].id);
    expect(piece.lines).toHaveLength(3);
    expect(piece.lines[1].sounds[0].name).toBe('A'); // copy
    expect(piece.lines[2].sounds[0].name).toBe('B'); // original line 1 shifted
  });

  it('assigns fresh ids to all sounds in the copy', () => {
    piece.addSound(line().id, sym('A'));
    const originalSoundId = sounds()[0].id;
    piece.duplicateLine(line().id);
    expect(piece.lines[1].sounds[0].id).not.toBe(originalSoundId);
  });

  it('selects the new line', () => {
    piece.duplicateLine(line().id);
    expect(piece.selectedLineId).toBe(piece.lines[1].id);
  });

  it('deep-copies group sounds with fresh ids', () => {
    piece.addGroup(line().id, {
      name: 'Pat',
      sounds: [{ name: 'X', hand: 'R', duration: 1 }],
    });
    const originalGroupId = sounds()[0].id;
    const originalSubId = sounds()[0].sounds[0].id;
    piece.duplicateLine(line().id);
    expect(piece.lines[1].sounds[0].id).not.toBe(originalGroupId);
    expect(piece.lines[1].sounds[0].sounds[0].id).not.toBe(originalSubId);
  });
});

// ── reorderLine ───────────────────────────────────────────────────────────────

describe('reorderLine', () => {
  it('moves a line to a new index', () => {
    piece.addLine();
    piece.addLine();
    const ids = piece.lines.map((l) => l.id);
    piece.reorderLine(0, 2);
    expect(piece.lines[2].id).toBe(ids[0]);
    expect(piece.lines[0].id).toBe(ids[1]);
  });

  it('is a no-op when from and to are the same', () => {
    piece.addLine();
    const idsBefore = piece.lines.map((l) => l.id);
    piece.reorderLine(1, 1);
    expect(piece.lines.map((l) => l.id)).toEqual(idsBefore);
  });
});

// ── setLineRepeat ─────────────────────────────────────────────────────────────

describe('setLineRepeat', () => {
  it('sets the repeat value', () => {
    piece.setLineRepeat(line().id, 3);
    expect(line().repeat).toBe(3);
  });

  it('clamps to a minimum of 1', () => {
    piece.setLineRepeat(line().id, 0);
    expect(line().repeat).toBe(1);
  });

  it('rounds fractional values', () => {
    piece.setLineRepeat(line().id, 2.7);
    expect(line().repeat).toBe(3);
  });
});

// ── clearLines ────────────────────────────────────────────────────────────────

describe('clearLines', () => {
  it('replaces all lines with a single empty line', () => {
    piece.addLine();
    piece.addLine();
    piece.clearLines();
    expect(piece.lines).toHaveLength(1);
    expect(piece.lines[0].sounds).toHaveLength(0);
  });
});
