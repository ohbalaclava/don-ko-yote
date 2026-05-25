import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockPiece = vi.hoisted(() => ({ symbolSet: { id: 'high-straight' } }));
vi.mock('../src/data/piece.js', () => ({ piece: mockPiece }));

import { patternStore } from '../src/data/patterns.js';

beforeEach(() => {
  patternStore.items = [];
});

// ── save ──────────────────────────────────────────────────────────────────────

describe('save', () => {
  it('adds a pattern with a fresh id', () => {
    patternStore.save('Roll', [{ name: 'Don', hand: 'R', duration: 4 }], 'high-straight');
    expect(patternStore.items).toHaveLength(1);
    expect(patternStore.items[0].name).toBe('Roll');
    expect(typeof patternStore.items[0].id).toBe('string');
  });

  it('returns the new record', () => {
    const record = patternStore.save('Roll', [], 'high-straight');
    expect(record).toEqual(patternStore.items[0]);
  });

  it('stores the symbolSetId', () => {
    patternStore.save('Roll', [], 'high-straight');
    expect(patternStore.items[0].symbolSetId).toBe('high-straight');
  });

  it('appends without overwriting existing patterns', () => {
    patternStore.save('A', []);
    patternStore.save('B', []);
    expect(patternStore.items).toHaveLength(2);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('delete', () => {
  it('removes the pattern by id', () => {
    const rec = patternStore.save('Roll', []);
    patternStore.delete(rec.id);
    expect(patternStore.items).toHaveLength(0);
  });

  it('leaves other patterns intact', () => {
    patternStore.save('A', []);
    const recB = patternStore.save('B', []);
    patternStore.delete(recB.id);
    expect(patternStore.items).toHaveLength(1);
    expect(patternStore.items[0].name).toBe('A');
  });

  it('is a no-op for an unknown id', () => {
    patternStore.save('A', []);
    patternStore.delete('no-such-id');
    expect(patternStore.items).toHaveLength(1);
  });
});

// ── setItems ──────────────────────────────────────────────────────────────────

describe('setItems', () => {
  it('replaces the list with the provided items', () => {
    patternStore.save('Old', []);
    patternStore.setItems([{ id: 'p1', name: 'New', sounds: [] }]);
    expect(patternStore.items).toHaveLength(1);
    expect(patternStore.items[0].name).toBe('New');
  });

  it('assigns fresh ids to items that lack one', () => {
    patternStore.setItems([{ name: 'NoId', sounds: [] }]);
    expect(typeof patternStore.items[0].id).toBe('string');
  });

  it('preserves existing ids', () => {
    patternStore.setItems([{ id: 'keep-me', name: 'X', sounds: [] }]);
    expect(patternStore.items[0].id).toBe('keep-me');
  });

  it('clears the list when called with an empty array', () => {
    patternStore.save('A', []);
    patternStore.setItems([]);
    expect(patternStore.items).toHaveLength(0);
  });

  it('clears the list when called with a non-array', () => {
    patternStore.save('A', []);
    patternStore.setItems(null);
    expect(patternStore.items).toHaveLength(0);
  });
});

// ── importJson ────────────────────────────────────────────────────────────────

describe('importJson', () => {
  it('merges patterns into the current list', () => {
    patternStore.save('Existing', []);
    const json = JSON.stringify([{ name: 'Imported', sounds: [] }]);
    patternStore.importJson(json);
    expect(patternStore.items).toHaveLength(2);
  });

  it('accepts patterns with no symbolSetId', () => {
    const json = JSON.stringify([{ name: 'Any', sounds: [] }]);
    patternStore.importJson(json);
    expect(patternStore.items).toHaveLength(1);
    expect(patternStore.items[0].name).toBe('Any');
  });

  it('accepts patterns whose symbolSetId matches the current meter', () => {
    // mockPiece.symbolSet.id is 'high-straight'
    const json = JSON.stringify([{ name: 'Match', sounds: [], symbolSetId: 'high-straight' }]);
    patternStore.importJson(json);
    expect(patternStore.items).toHaveLength(1);
  });

  it('rejects patterns whose symbolSetId does not match the current meter', () => {
    const json = JSON.stringify([{ name: 'Wrong', sounds: [], symbolSetId: 'low-swing' }]);
    patternStore.importJson(json);
    expect(patternStore.items).toHaveLength(0);
  });

  it('assigns fresh ids to imported patterns', () => {
    const json = JSON.stringify([{ id: 'original-id', name: 'Pat', sounds: [] }]);
    patternStore.importJson(json);
    expect(patternStore.items[0].id).not.toBe('original-id');
  });

  it('skips entries missing a name or sounds array', () => {
    const json = JSON.stringify([
      { sounds: [] }, // no name
      { name: 'NoSounds' }, // no sounds
      { name: 'Valid', sounds: [] },
    ]);
    patternStore.importJson(json);
    expect(patternStore.items).toHaveLength(1);
    expect(patternStore.items[0].name).toBe('Valid');
  });

  it('is a no-op when the JSON is not an array', () => {
    patternStore.importJson(JSON.stringify({ name: 'Object', sounds: [] }));
    expect(patternStore.items).toHaveLength(0);
  });
});
