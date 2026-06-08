import { uid } from './uid.js';

const DB_NAME = 'don-ko-yote';
// Bumped from 1 → 2 for the multi-symbol-set refactor: scores and patterns
// stored under the old fractional-duration schema are wiped on upgrade.
const DB_VERSION = 2;

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = ({ target: { result: db, transaction } }) => {
      // Key-value store for singleton data (app settings, score settings)
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');

      // Collections
      if (!db.objectStoreNames.contains('scores'))
        db.createObjectStore('scores', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('patterns'))
        db.createObjectStore('patterns', { keyPath: 'id' });

      // Wipe legacy data when upgrading from v1: durations and jiuchi IDs no
      // longer match the new schema, so existing scores/patterns are unusable.
      if (transaction && db.objectStoreNames.contains('scores'))
        transaction.objectStore('scores').clear();
      if (transaction && db.objectStoreNames.contains('patterns'))
        transaction.objectStore('patterns').clear();
    };

    req.onsuccess = ({ target: { result } }) => resolve(result);
    req.onerror = ({ target: { error } }) => reject(error);
  });
}

async function getDB() {
  return _db ?? (_db = await openDB());
}

/**
 * Executes a single IDBRequest inside a transaction and resolves with its result.
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest} fn - Receives the object store and returns the request to await.
 * @returns {Promise<*>}
 */
async function tx(storeName, mode, fn) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    t.onerror = () => reject(t.error);
    const r = fn(t.objectStore(storeName));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Creates a CRUD interface for a named IndexedDB object store.
 * Each item must be a plain object; a UUID is assigned to `id` on first save.
 * @param {string} storeName
 * @returns {{ all: () => Promise<Array>, get: (id: string) => Promise<*>, delete: (id: string) => Promise<void>, save: (item: object) => Promise<object> }}
 */
function collection(storeName) {
  return {
    all: () => tx(storeName, 'readonly', (s) => s.getAll()),
    get: (id) => tx(storeName, 'readonly', (s) => s.get(id)),
    delete: (id) => tx(storeName, 'readwrite', (s) => s.delete(id)),

    async save(item) {
      const record = { ...item, id: item.id ?? uid() };
      await tx(storeName, 'readwrite', (s) => s.put(record));
      return record;
    },
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────
//
//  db.kv.get(key)          → Promise<value | undefined>
//  db.kv.set(key, value)   → Promise<void>
//  db.kv.delete(key)       → Promise<void>
//
//  db.scores.all()         → Promise<score[]>
//  db.scores.get(id)       → Promise<score | undefined>
//  db.scores.save(score)   → Promise<score>   (assigns id if absent)
//  db.scores.delete(id)    → Promise<void>
//
//  db.patterns.all()       → Promise<pattern[]>
//  db.patterns.get(id)     → Promise<pattern | undefined>
//  db.patterns.save(pat)   → Promise<pattern>
//  db.patterns.delete(id)  → Promise<void>

export const db = {
  kv: {
    get: (key) => tx('kv', 'readonly', (s) => s.get(key)),
    set: (key, val) => tx('kv', 'readwrite', (s) => s.put(val, key)),
    delete: (key) => tx('kv', 'readwrite', (s) => s.delete(key)),
  },

  scores: collection('scores'),
  patterns: collection('patterns'),
};
