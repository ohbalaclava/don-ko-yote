import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

import {
  piece,
  markerDepth,
  lineDepth,
  isSoundLine,
  singleLineRepeatMap,
} from '../src/data/piece.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
// Each sound's default duration of 4 represents one full beat in the default
// straight-time symbol set (time=4 divisions per beat).

function sym(name = 'Don', hand = 'R', duration = 4) {
  return { name, hand, duration };
}

function line(idx = 0) {
  return piece.lines[idx];
}
function sounds(lineIdx = 0) {
  return piece.lines[lineIdx].sounds;
}

beforeEach(() => {
  piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8 });
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
      { name: 'A', hand: 'R', duration: 4 },
      { name: 'B', hand: 'L', duration: 4 },
    ],
  };

  it('always expands the pattern into individual sounds', () => {
    piece.addGroup(line().id, twoBeats);
    expect(sounds()).toHaveLength(2);
    expect(sounds()[0].name).toBe('A');
    expect(sounds()[1].name).toBe('B');
    sounds().forEach((s) => expect(s.type).toBeUndefined());
  });

  it('assigns fresh ids to the expanded sounds', () => {
    const originalIds = ['orig-1', 'orig-2'];
    piece.addGroup(line().id, {
      name: 'Pat',
      sounds: [
        { id: originalIds[0], name: 'A', hand: 'R', duration: 4 },
        { id: originalIds[1], name: 'B', hand: 'L', duration: 4 },
      ],
    });
    expect(sounds()[0].id).not.toBe(originalIds[0]);
    expect(sounds()[1].id).not.toBe(originalIds[1]);
  });

  it('distributes sounds across lines when beatsPerLine is set', () => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 2 });
    const threeBeat = {
      name: 'Big',
      sounds: [
        { name: 'A', hand: 'R', duration: 4 },
        { name: 'B', hand: 'L', duration: 4 },
        { name: 'C', hand: 'R', duration: 4 },
      ],
    };
    piece.addGroup(line().id, threeBeat);
    const totalSounds = piece.lines.reduce((n, l) => n + l.sounds.length, 0);
    expect(totalSounds).toBe(3);
    expect(piece.lines.length).toBeGreaterThan(1);
    piece.lines.forEach((l) => l.sounds.forEach((s) => expect(s.type).toBeUndefined()));
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

// ── insert position (add after selected line) ──────────────────────────────────

describe('add rows insert after the selected line', () => {
  it('addLine inserts after the selected line and selects it', () => {
    piece.addLine();
    piece.addLine(); // lines: [L0, L1, L2], L2 selected
    const [id0] = piece.lines.map((l) => l.id);
    piece.selectLine(id0);
    piece.addLine();
    expect(piece.lines).toHaveLength(4);
    expect(piece.lines[1].id).toBe(piece.selectedLineId); // new line sits right after L0
    expect(piece.lines[0].id).toBe(id0);
  });

  it('addHeading inserts after the selected line without changing selection', () => {
    piece.addLine();
    const [id0] = piece.lines.map((l) => l.id);
    piece.selectLine(id0);
    piece.addHeading();
    expect(piece.lines[1].type).toBe('heading');
    expect(piece.selectedLineId).toBe(id0);
  });

  it('addDivider inserts after the selected line', () => {
    piece.addLine();
    piece.selectLine(piece.lines[0].id);
    piece.addDivider();
    expect(piece.lines[1].type).toBe('divider');
  });

  it('addJiuchiSection inserts marker + line + divider after selected, selecting the line', () => {
    piece.addLine();
    const id0 = piece.lines[0].id;
    piece.selectLine(id0);
    piece.addJiuchiSection();
    // [L0, jiuchi-section, line, divider, L1]
    expect(piece.lines[1].type).toBe('jiuchi-section');
    expect(isSoundLine(piece.lines[2])).toBe(true);
    expect(piece.lines[3].type).toBe('divider');
    expect(piece.selectedLineId).toBe(piece.lines[2].id);
    // The divider keeps the following melody line out of the jiuchi definition.
    expect(piece.lines[4].id).not.toBe(undefined);
  });

  it('addJiuchiSection switches the per-score metronome jiuchi to inline', () => {
    expect(piece.metronomeJiuchi).toBe('auto');
    piece.addJiuchiSection();
    expect(piece.metronomeJiuchi).toBe('inline');
  });
});

// ── metronome config (per-score) ───────────────────────────────────────────────

describe('per-score metronome config', () => {
  it('setMetronome updates the field and is captured in the snapshot', () => {
    piece.setMetronome('metronome', true);
    piece.setMetronome('metronomeJiuchi', 'Gobu Gobu');
    const snap = piece._snapshot();
    expect(snap.metronome).toBe(true);
    expect(snap.metronomeJiuchi).toBe('Gobu Gobu');
  });

  it('loadFromData restores metronome config, defaulting missing fields', () => {
    piece.loadFromData({ metronome: true, metronomeVolume: 1.5 });
    expect(piece.metronome).toBe(true);
    expect(piece.metronomeVolume).toBe(1.5);
    expect(piece.metronomeJiuchi).toBe('auto'); // default applied for missing field
    expect(piece.metronomeHeadOnly).toBe(true);
  });

  it('reset clears metronome config back to defaults', () => {
    piece.setMetronome('metronome', true);
    piece.setMetronome('metronomeJiuchi', 'inline');
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8 });
    expect(piece.metronome).toBe(false);
    expect(piece.metronomeJiuchi).toBe('auto');
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

// ── beatsPerLine ──────────────────────────────────────────────────────────────

describe('setBeatsPerLine', () => {
  it('does not modify existing lines when changed', () => {
    // Create a line with 8 sounds (full)
    for (let i = 0; i < 8; i++) piece.addSound(line().id, sym());
    const originalSoundCount = sounds().length;
    const originalLineCount = piece.lines.length;

    // Change beatsPerLine to a smaller value
    piece.setBeatsPerLine(4);

    // Existing line should remain unchanged
    expect(sounds()).toHaveLength(originalSoundCount);
    expect(piece.lines).toHaveLength(originalLineCount);
  });

  it('affects new sounds placement: they respect the new limit', () => {
    piece.setBeatsPerLine(4);
    // Add 4 sounds (fills the line)
    for (let i = 0; i < 4; i++) piece.addSound(line().id, sym());
    expect(piece.lines).toHaveLength(1);
    // Next sound should overflow to a new line
    piece.addSound(line(0).id, sym());
    expect(piece.lines).toHaveLength(2);
    expect(sounds(1)).toHaveLength(1);
  });

  it('affects new sounds placement: increasing limit allows more sounds per line', () => {
    piece.setBeatsPerLine(16);
    // Add 16 sounds (fills the line with new limit)
    for (let i = 0; i < 16; i++) piece.addSound(line().id, sym());
    expect(piece.lines).toHaveLength(1);
    expect(sounds()).toHaveLength(16);
  });
});

// ── isSoundLine ─────────────────────────────────────────────────────────────────

describe('isSoundLine', () => {
  it('is true for a sound line and false for structural rows', () => {
    expect(isSoundLine({ id: 'a', sounds: [] })).toBe(true);
    expect(isSoundLine({ type: 'heading' })).toBe(false);
    expect(isSoundLine({ type: 'note' })).toBe(false);
    expect(isSoundLine({ type: 'divider' })).toBe(false);
    expect(isSoundLine({ type: 'block-repeat' })).toBe(false);
  });
});

// ── markerDepth / lineDepth / singleLineRepeatMap ───────────────────────────────

describe('markerDepth', () => {
  it('counts markers whose lineIds strictly superset this marker', () => {
    const outer = { id: 'o', lineIds: ['a', 'b', 'c'] };
    const inner = { id: 'i', lineIds: ['b'] };
    const markers = [outer, inner];
    expect(markerDepth(outer, markers)).toBe(0);
    expect(markerDepth(inner, markers)).toBe(1);
  });
});

describe('lineDepth', () => {
  it('counts markers containing the line id', () => {
    const markers = [
      { id: 'o', lineIds: ['a', 'b'] },
      { id: 'i', lineIds: ['b'] },
    ];
    expect(lineDepth('a', markers)).toBe(1);
    expect(lineDepth('b', markers)).toBe(2);
    expect(lineDepth('z', markers)).toBe(0);
  });
});

describe('singleLineRepeatMap', () => {
  it('maps only single-line block-repeats by their line id', () => {
    const single = { type: 'block-repeat', lineIds: ['a'] };
    const lines = [{ id: 'a', sounds: [] }, single, { type: 'block-repeat', lineIds: ['a', 'b'] }];
    const map = singleLineRepeatMap(lines);
    expect(map.size).toBe(1);
    expect(map.get('a')).toBe(single);
  });
});

// ── block-repeat operations ─────────────────────────────────────────────────────

const marker = () => piece.lines.find((l) => l.type === 'block-repeat');

/** Adds n empty lines and returns the full ordered list of line ids. */
function addLines(n) {
  for (let i = 0; i < n; i++) piece.addLine();
  return piece.lines.filter(isSoundLine).map((l) => l.id);
}

/** Creates a block-repeat over the given line ids (selection set directly). */
function blockRepeat(ids, count = 2) {
  piece.lineSelection = ids.slice();
  piece.addBlockRepeat(count);
}

describe('addBlockRepeat', () => {
  it('inserts a marker after the last selected line with its ids', () => {
    const [a, b] = addLines(1); // reset gives 1 line, +1 => 2 lines
    blockRepeat([a, b], 3);
    const m = marker();
    expect(m.lineIds).toEqual([a, b]);
    expect(m.count).toBe(3);
    // inserted immediately after b
    const idx = piece.lines.findIndex((l) => l.id === b);
    expect(piece.lines[idx + 1]).toBe(m);
  });

  it('is a no-op for an empty selection or count < 2', () => {
    addLines(1);
    blockRepeat([], 3);
    expect(marker()).toBeUndefined();
    blockRepeat([piece.lines[0].id], 1);
    expect(marker()).toBeUndefined();
  });
});

describe('setBlockRepeatCount / removeBlockRepeat', () => {
  it('clamps the count to a minimum of 2 and rounds', () => {
    const [a, b] = addLines(1);
    blockRepeat([a, b], 2);
    piece.setBlockRepeatCount(marker().id, 1);
    expect(marker().count).toBe(2);
    piece.setBlockRepeatCount(marker().id, 4.6);
    expect(marker().count).toBe(5);
  });

  it('removeBlockRepeat drops the marker', () => {
    const [a, b] = addLines(1);
    blockRepeat([a, b], 2);
    piece.removeBlockRepeat(marker().id);
    expect(marker()).toBeUndefined();
  });
});

describe('reorderLine — block-repeat membership', () => {
  it('removes a line from the marker when it is moved out of the block', () => {
    const [a, b, c] = addLines(2); // 3 lines total
    blockRepeat([a, b]); // lines: [a, b, M([a,b]), c]
    const fromIdx = piece.lines.findIndex((l) => l.id === a);
    piece.reorderLine(fromIdx, piece.lines.length - 1); // move a to the end
    expect(marker().lineIds).toEqual([b]);
    expect(c).toBeDefined();
  });

  it('drops a marker that becomes empty after the move', () => {
    const [a, b] = addLines(1); // 2 lines
    blockRepeat([a]); // lines: [a, M([a]), b]
    const fromIdx = piece.lines.findIndex((l) => l.id === a);
    piece.reorderLine(fromIdx, piece.lines.length - 1);
    expect(marker()).toBeUndefined();
  });

  it('adds a line to the marker when dropped between two members', () => {
    const [a, b, c, d] = addLines(3); // 4 lines
    blockRepeat([a, b, c]); // lines: [a, b, c, M([a,b,c]), d]
    const fromIdx = piece.lines.findIndex((l) => l.id === d);
    const toIdx = piece.lines.findIndex((l) => l.id === b); // between a and b
    piece.reorderLine(fromIdx, toIdx);
    expect(marker().lineIds).toEqual([a, d, b, c]);
  });
});

describe('removeLine / deleteSelectedLines — block-repeat pruning', () => {
  it('removeLine prunes the id and drops a now-empty marker', () => {
    const [a, b] = addLines(1);
    blockRepeat([a]); // single-line repeat over a
    piece.removeLine(a);
    expect(marker()).toBeUndefined();
    expect(b).toBeDefined();
  });

  it('removeLine keeps a marker that still has members', () => {
    const [a, b, c] = addLines(2);
    blockRepeat([a, b]);
    piece.removeLine(a);
    expect(marker().lineIds).toEqual([b]);
    expect(c).toBeDefined();
  });

  it('deleteSelectedLines prunes deleted ids from markers', () => {
    const [a, b, c] = addLines(2);
    blockRepeat([a, b, c]);
    piece.lineSelection = [b];
    piece.deleteSelectedLines();
    expect(marker().lineIds).toEqual([a, c]);
  });
});
