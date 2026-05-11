import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

// Fake db so tests don't touch IndexedDB
const fakeDb = vi.hoisted(() => ({
  kv: {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
  },
  scores: {
    all: vi.fn(async () => []),
    get: vi.fn(async () => undefined),
    save: vi.fn(async (item) => ({ ...item, id: item.id ?? 'generated-id' })),
    delete: vi.fn(async () => undefined),
  },
  patterns: {
    all: vi.fn(async () => []),
    save: vi.fn(async (item) => item),
    delete: vi.fn(async () => undefined),
  },
}));
vi.mock('../src/db.js', () => ({ db: fakeDb }));

import { piece } from '../src/data/piece.js';
import { scoreStore } from '../src/data/scoreStore.js';

function makeScoreRecord(overrides = {}) {
  return {
    id: 'score-1',
    title: 'My Song',
    jiuchi: 'gobu-gobu',
    beatsPerLine: 8,
    bpm: 120,
    author: 'Author',
    icon: null,
    lines: [{ id: 'l1', sounds: [], repeat: 1 }],
    savedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.scores.all.mockResolvedValue([]);
  fakeDb.scores.get.mockResolvedValue(undefined);
  fakeDb.scores.save.mockImplementation(async (item) => ({
    ...item,
    id: item.id ?? 'generated-id',
  }));
  fakeDb.scores.delete.mockResolvedValue(undefined);
  scoreStore.items = [];
  piece.reset('gobu-gobu', 8);
});

// ── importJson ────────────────────────────────────────────────────────────────

describe('importJson', () => {
  it('sets all piece fields from the JSON', () => {
    const data = {
      title: 'Test',
      jiuchi: 'shichisan',
      beatsPerLine: 4,
      bpm: 90,
      author: 'Me',
      icon: 'data:img',
      lines: [{ id: 'l1', sounds: [], repeat: 1 }],
    };
    scoreStore.importJson(JSON.stringify(data));
    expect(piece.title).toBe('Test');
    expect(piece.jiuchi).toBe('shichisan');
    expect(piece.beatsPerLine).toBe(4);
    expect(piece.bpm).toBe(90);
    expect(piece.author).toBe('Me');
    expect(piece.icon).toBe('data:img');
    expect(piece.lines).toEqual(data.lines);
    expect(piece.selectedLineId).toBe('l1');
  });

  it('falls back to defaults for missing optional fields', () => {
    scoreStore.importJson(JSON.stringify({ title: 'Minimal' }));
    expect(piece.bpm).toBe(120);
    expect(piece.author).toBe('');
    expect(piece.icon).toBeNull();
  });

  it('keeps the current jiuchi and beatsPerLine when absent from JSON', () => {
    piece.jiuchi = 'shichisan';
    piece.beatsPerLine = 4;
    scoreStore.importJson(JSON.stringify({ title: 'X' }));
    expect(piece.jiuchi).toBe('shichisan');
    expect(piece.beatsPerLine).toBe(4);
  });

  it('does not replace lines when JSON has no lines array', () => {
    piece.addSound(piece.lines[0].id, { name: 'Don', hand: 'R', duration: 1 });
    const existingLines = piece.lines;
    scoreStore.importJson(JSON.stringify({ title: 'No lines', lines: [] }));
    // Empty array → condition `data.lines.length` is falsy, lines unchanged
    expect(piece.lines).toBe(existingLines);
  });

  it('clears piece.id so the next save creates a new record', () => {
    piece.id = 'old-id';
    scoreStore.importJson(JSON.stringify({ title: 'X', lines: [{ id: 'l1', sounds: [] }] }));
    expect(piece.id).toBeNull();
  });

  it('resets transient UI state', () => {
    piece.editingTile = { lineId: 'l', soundId: 's' };
    piece.selectMode = true;
    scoreStore.importJson(JSON.stringify({ title: 'X', lines: [{ id: 'l1', sounds: [] }] }));
    expect(piece.editingTile).toBeNull();
    expect(piece.selectMode).toBe(false);
  });
});

// ── save ──────────────────────────────────────────────────────────────────────

describe('save', () => {
  it('calls db.scores.save with a snapshot of the current piece', async () => {
    piece.title = 'My Score';
    await scoreStore.save();
    expect(fakeDb.scores.save).toHaveBeenCalledOnce();
    const saved = fakeDb.scores.save.mock.calls[0][0];
    expect(saved.title).toBe('My Score');
    expect(saved.jiuchi).toBe('gobu-gobu');
    expect(saved.lines).toBe(piece.lines);
  });

  it('sets piece.id from the returned record', async () => {
    fakeDb.scores.save.mockResolvedValue({ id: 'new-id', title: 'T', lines: [] });
    await scoreStore.save();
    expect(piece.id).toBe('new-id');
  });

  it('includes savedAt timestamp in the snapshot', async () => {
    await scoreStore.save();
    const saved = fakeDb.scores.save.mock.calls[0][0];
    expect(typeof saved.savedAt).toBe('number');
  });

  it('omits id from the snapshot when piece has no id yet', async () => {
    piece.id = null;
    await scoreStore.save();
    const saved = fakeDb.scores.save.mock.calls[0][0];
    expect(saved.id).toBeUndefined();
  });

  it('includes piece.id in the snapshot when piece already has one', async () => {
    piece.id = 'existing-id';
    await scoreStore.save();
    const saved = fakeDb.scores.save.mock.calls[0][0];
    expect(saved.id).toBe('existing-id');
  });
});

// ── loadScore ─────────────────────────────────────────────────────────────────

describe('loadScore', () => {
  it('sets all piece fields from the stored record', async () => {
    const record = makeScoreRecord();
    fakeDb.scores.get.mockResolvedValue(record);
    await scoreStore.loadScore('score-1');
    expect(piece.id).toBe('score-1');
    expect(piece.title).toBe('My Song');
    expect(piece.jiuchi).toBe('gobu-gobu');
    expect(piece.beatsPerLine).toBe(8);
    expect(piece.bpm).toBe(120);
    expect(piece.author).toBe('Author');
    expect(piece.lines).toBe(record.lines);
    expect(piece.selectedLineId).toBe('l1');
  });

  it('defaults bpm, author, icon when absent from the record', async () => {
    const { bpm: _b, author: _a, icon: _i, ...partial } = makeScoreRecord();
    fakeDb.scores.get.mockResolvedValue(partial);
    await scoreStore.loadScore('score-1');
    expect(piece.bpm).toBe(120);
    expect(piece.author).toBe('');
    expect(piece.icon).toBeNull();
  });

  it('is a no-op when the id does not exist', async () => {
    fakeDb.scores.get.mockResolvedValue(undefined);
    piece.title = 'Before';
    await scoreStore.loadScore('missing');
    expect(piece.title).toBe('Before');
  });

  it('resets transient UI state', async () => {
    fakeDb.scores.get.mockResolvedValue(makeScoreRecord());
    piece.editingTile = { lineId: 'l', soundId: 's' };
    piece.selectMode = true;
    await scoreStore.loadScore('score-1');
    expect(piece.editingTile).toBeNull();
    expect(piece.selectMode).toBe(false);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('delete', () => {
  it('calls db.scores.delete with the given id', async () => {
    await scoreStore.delete('score-1');
    expect(fakeDb.scores.delete).toHaveBeenCalledWith('score-1');
  });

  it('removes the record from scoreStore.items', async () => {
    scoreStore.items = [
      { id: 'score-1', title: 'A' },
      { id: 'score-2', title: 'B' },
    ];
    await scoreStore.delete('score-1');
    expect(scoreStore.items).toHaveLength(1);
    expect(scoreStore.items[0].id).toBe('score-2');
  });

  it('clears piece.id when the deleted score matches the current piece', async () => {
    piece.id = 'score-1';
    await scoreStore.delete('score-1');
    expect(piece.id).toBeNull();
  });

  it('does not clear piece.id when a different score is deleted', async () => {
    piece.id = 'score-2';
    await scoreStore.delete('score-1');
    expect(piece.id).toBe('score-2');
  });
});
