import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

beforeEach(() => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
});

async function freshDb() {
  return (await import('../src/db.js')).db;
}

describe('db.kv', () => {
  it('returns undefined for missing key', async () => {
    const db = await freshDb();
    expect(await db.kv.get('missing')).toBeUndefined();
  });

  it('set then get returns the value', async () => {
    const db = await freshDb();
    await db.kv.set('color', 'red');
    expect(await db.kv.get('color')).toBe('red');
  });

  it('set overwrites existing value', async () => {
    const db = await freshDb();
    await db.kv.set('n', 1);
    await db.kv.set('n', 2);
    expect(await db.kv.get('n')).toBe(2);
  });

  it('delete removes the key', async () => {
    const db = await freshDb();
    await db.kv.set('x', 42);
    await db.kv.delete('x');
    expect(await db.kv.get('x')).toBeUndefined();
  });

  it('stores object values', async () => {
    const db = await freshDb();
    const obj = { a: 1, b: [2, 3] };
    await db.kv.set('obj', obj);
    expect(await db.kv.get('obj')).toEqual(obj);
  });
});

describe('db.patterns (collection)', () => {
  it('all() returns empty array initially', async () => {
    const db = await freshDb();
    expect(await db.patterns.all()).toEqual([]);
  });

  it('save() assigns a uuid when id is absent', async () => {
    const db = await freshDb();
    const saved = await db.patterns.save({ name: 'pat', sounds: [] });
    expect(typeof saved.id).toBe('string');
    expect(saved.id.length).toBeGreaterThan(0);
  });

  it('save() keeps an existing id', async () => {
    const db = await freshDb();
    const saved = await db.patterns.save({ id: 'my-id', name: 'pat', sounds: [] });
    expect(saved.id).toBe('my-id');
  });

  it('save() returns the record with all fields', async () => {
    const db = await freshDb();
    const saved = await db.patterns.save({ name: 'test', sounds: ['a'] });
    expect(saved).toMatchObject({ name: 'test', sounds: ['a'] });
  });

  it('get() retrieves a saved item', async () => {
    const db = await freshDb();
    const saved = await db.patterns.save({ id: 'abc', name: 'x', sounds: [] });
    expect(await db.patterns.get('abc')).toEqual(saved);
  });

  it('get() returns undefined for unknown id', async () => {
    const db = await freshDb();
    expect(await db.patterns.get('nope')).toBeUndefined();
  });

  it('all() returns all saved items', async () => {
    const db = await freshDb();
    await db.patterns.save({ id: 'p1', name: 'a', sounds: [] });
    await db.patterns.save({ id: 'p2', name: 'b', sounds: [] });
    const all = await db.patterns.all();
    expect(all).toHaveLength(2);
    expect(all.map((p) => p.id)).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('delete() removes the item', async () => {
    const db = await freshDb();
    await db.patterns.save({ id: 'del', name: 'x', sounds: [] });
    await db.patterns.delete('del');
    expect(await db.patterns.get('del')).toBeUndefined();
  });

  it('delete() on non-existent id resolves without error', async () => {
    const db = await freshDb();
    await expect(db.patterns.delete('ghost')).resolves.toBeUndefined();
  });
});

describe('db upgrade', () => {
  /** Opens the raw database at an old version and seeds it, mimicking a pre-upgrade install. */
  function seedAtVersion(version, seed) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('don-ko-yote', version);
      req.onupgradeneeded = ({ target: { result: db } }) => {
        db.createObjectStore('kv');
        db.createObjectStore('scores', { keyPath: 'id' });
        db.createObjectStore('patterns', { keyPath: 'id' });
        if (version >= 3) db.createObjectStore('jiuchis', { keyPath: 'id' });
      };
      req.onsuccess = ({ target: { result: db } }) => {
        const t = db.transaction(['scores', 'patterns'], 'readwrite');
        for (const s of seed.scores) t.objectStore('scores').put(s);
        for (const p of seed.patterns) t.objectStore('patterns').put(p);
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
  }

  it('v2 → v3 preserves existing scores and patterns', async () => {
    await seedAtVersion(2, {
      scores: [{ id: 's1', title: 'Keep me', lines: [] }],
      patterns: [{ id: 'p1', name: 'pat', sounds: [] }],
    });
    const db = await freshDb();
    expect(await db.scores.get('s1')).toMatchObject({ title: 'Keep me' });
    expect(await db.patterns.get('p1')).toMatchObject({ name: 'pat' });
  });

  it('v1 → v3 still wipes legacy scores and patterns', async () => {
    await seedAtVersion(1, {
      scores: [{ id: 's1', title: 'Legacy', lines: [] }],
      patterns: [{ id: 'p1', name: 'old', sounds: [] }],
    });
    const db = await freshDb();
    expect(await db.scores.all()).toEqual([]);
    expect(await db.patterns.all()).toEqual([]);
  });

  it('drops the legacy jiuchis store on upgrade to v4', async () => {
    await seedAtVersion(3, { scores: [], patterns: [] });
    const db = await freshDb();
    await db.scores.all(); // force the lazy open, triggering the v3 → v4 upgrade
    const names = await new Promise((resolve, reject) => {
      const req = indexedDB.open('don-ko-yote');
      req.onsuccess = ({ target: { result: db } }) => {
        const list = Array.from(db.objectStoreNames);
        db.close();
        resolve(list);
      };
      req.onerror = ({ target: { error } }) => reject(error);
    });
    expect(names).not.toContain('jiuchis');
    expect(names).toEqual(expect.arrayContaining(['kv', 'scores', 'patterns']));
  });
});

describe('db.scores (collection)', () => {
  it('all() returns empty array initially', async () => {
    const db = await freshDb();
    expect(await db.scores.all()).toEqual([]);
  });

  it('save and retrieve a score', async () => {
    const db = await freshDb();
    const saved = await db.scores.save({ id: 's1', title: 'My Score', lines: [] });
    expect(await db.scores.get('s1')).toEqual(saved);
  });

  it('scores and patterns are independent stores', async () => {
    const db = await freshDb();
    await db.patterns.save({ id: 'shared-id', name: 'pat', sounds: [] });
    expect(await db.scores.get('shared-id')).toBeUndefined();
  });
});
