import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

// Fake settings: the real module touches document/IndexedDB on set().
const fakeSettings = vi.hoisted(() => ({
  metronomeJiuchi: 'auto',
  set: vi.fn(async (key, value) => {
    fakeSettings[key] = value;
  }),
}));
vi.mock('../src/data/settings.js', () => ({ settings: fakeSettings }));

// Fake db.jiuchis backed by a Map, mirroring the collection() contract.
const fakeDb = vi.hoisted(() => {
  const rows = new Map();
  let nextId = 0;
  return {
    rows,
    jiuchis: {
      all: vi.fn(async () => [...rows.values()]),
      get: vi.fn(async (id) => rows.get(id)),
      save: vi.fn(async (item) => {
        const record = { ...item, id: item.id ?? `gen-${nextId++}` };
        rows.set(record.id, record);
        return record;
      }),
      delete: vi.fn(async (id) => {
        rows.delete(id);
      }),
    },
  };
});
vi.mock('../src/db.js', () => ({ db: fakeDb }));

import { jiuchiStore } from '../src/data/jiuchis.js';

const fakePiece = (overrides = {}) => ({
  time: 4,
  taiko: 'Nagado',
  jiuchi: 'Gobu Gobu',
  lines: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb.rows.clear();
  jiuchiStore.items = [];
  fakeSettings.metronomeJiuchi = 'auto';
});

describe('jiuchiStore CRUD', () => {
  it('save assigns an id and adds to items; get retrieves it', async () => {
    const saved = await jiuchiStore.save({ name: 'Mine', kind: 'ticks', time: 4, positions: [1] });
    expect(saved.id).toBeTruthy();
    expect(jiuchiStore.get(saved.id)).toEqual(saved);
    expect(jiuchiStore.items).toHaveLength(1);
  });

  it('save upserts an existing record in place', async () => {
    const saved = await jiuchiStore.save({ name: 'Mine', kind: 'ticks', time: 4, positions: [1] });
    await jiuchiStore.save({ ...saved, positions: [1, 3] });
    expect(jiuchiStore.items).toHaveLength(1);
    expect(jiuchiStore.get(saved.id).positions).toEqual([1, 3]);
  });

  it('load populates items from the db', async () => {
    await fakeDb.jiuchis.save({ id: 'j1', name: 'Stored', kind: 'ticks', time: 4, positions: [1] });
    await jiuchiStore.load();
    expect(jiuchiStore.items.map((j) => j.id)).toEqual(['j1']);
  });

  it('delete removes the record and resets the setting when it pointed at it', async () => {
    const saved = await jiuchiStore.save({ name: 'Mine', kind: 'ticks', time: 4, positions: [1] });
    fakeSettings.metronomeJiuchi = `custom:${saved.id}`;
    await jiuchiStore.delete(saved.id);
    expect(jiuchiStore.items).toEqual([]);
    expect(fakeSettings.set).toHaveBeenCalledWith('metronomeJiuchi', 'auto');
  });

  it('delete leaves an unrelated setting value alone', async () => {
    const saved = await jiuchiStore.save({ name: 'Mine', kind: 'ticks', time: 4, positions: [1] });
    fakeSettings.metronomeJiuchi = 'Shichisan';
    await jiuchiStore.delete(saved.id);
    expect(fakeSettings.set).not.toHaveBeenCalled();
  });
});

describe('resolveSetting', () => {
  it("resolves 'auto' to the piece's own jiuchi pattern", () => {
    const r = jiuchiStore.resolveSetting('auto', fakePiece({ jiuchi: 'Mitsu-uchi' }));
    expect(r).toEqual({ kind: 'ticks', positions: [1, 3, 4] });
  });

  it('resolves a standard name directly', () => {
    const r = jiuchiStore.resolveSetting('Gobu Gobu', fakePiece());
    expect(r).toEqual({ kind: 'ticks', positions: [1, 3] });
  });

  it('falls back to head-only for an unknown name', () => {
    const r = jiuchiStore.resolveSetting('Nonsense', fakePiece());
    expect(r).toEqual({ kind: 'ticks', positions: [1] });
  });

  it('resolves a matching custom record', async () => {
    const saved = await jiuchiStore.save({
      name: 'Mine',
      kind: 'sounds',
      time: 4,
      taiko: 'Nagado',
      events: [],
      lengthDiv: 8,
    });
    expect(jiuchiStore.resolveSetting(`custom:${saved.id}`, fakePiece())).toBe(
      jiuchiStore.get(saved.id)
    );
  });

  it("falls back to the 'auto' resolution for a missing record", () => {
    const r = jiuchiStore.resolveSetting('custom:ghost', fakePiece({ jiuchi: 'Gobu Gobu' }));
    expect(r).toEqual({ kind: 'ticks', positions: [1, 3] });
  });

  it("falls back to the 'auto' resolution on a straight/swing time mismatch", async () => {
    const saved = await jiuchiStore.save({
      name: 'Swingy',
      kind: 'sounds',
      time: 3,
      taiko: 'Nagado',
      events: [],
      lengthDiv: 6,
    });
    const r = jiuchiStore.resolveSetting(`custom:${saved.id}`, fakePiece({ time: 4 }));
    expect(r).toEqual({ kind: 'ticks', positions: [1, 3] });
  });
});

describe('syncFromPiece', () => {
  const markedLine = (jiuchiId, sounds) => ({ id: `l-${jiuchiId}`, jiuchiId, sounds });
  const don = (duration = 4) => ({ id: 'snd', name: 'DON', hand: 'R', duration });

  it('re-captures an existing sounds-kind record from its marked lines', async () => {
    const saved = await jiuchiStore.save({
      name: 'Mine',
      kind: 'sounds',
      time: 4,
      taiko: 'Shime',
      events: [],
      lengthDiv: 0,
    });
    const piece = fakePiece({ lines: [markedLine(saved.id, [don(4), don(2)])] });
    await jiuchiStore.syncFromPiece(piece);
    const updated = jiuchiStore.get(saved.id);
    expect(updated.lengthDiv).toBe(6);
    expect(updated.events.map((e) => e.startDiv)).toEqual([0, 4]);
    expect(updated.taiko).toBe('Nagado'); // refreshed from the piece
    expect(updated.name).toBe('Mine'); // name preserved
  });

  it('never resurrects a deleted record from dangling line flags', async () => {
    const piece = fakePiece({ lines: [markedLine('deleted-id', [don()])] });
    await jiuchiStore.syncFromPiece(piece);
    expect(jiuchiStore.items).toEqual([]);
    expect(fakeDb.jiuchis.save).not.toHaveBeenCalled();
  });

  it('leaves ticks-kind records untouched', async () => {
    const saved = await jiuchiStore.save({ name: 'Grid', kind: 'ticks', time: 4, positions: [1] });
    fakeDb.jiuchis.save.mockClear();
    const piece = fakePiece({ lines: [markedLine(saved.id, [don()])] });
    await jiuchiStore.syncFromPiece(piece);
    expect(fakeDb.jiuchis.save).not.toHaveBeenCalled();
  });
});
