import m from 'mithril';
import { db } from '../db.js';

export const patternStore = {
  items: [],

  async load() {
    patternStore.items = await db.patterns.all();
    m.redraw();
  },

  async save(name, sounds, symbolSetId) {
    const record = await db.patterns.save({ name, sounds, symbolSetId });
    patternStore.items = await db.patterns.all();
    m.redraw();
    return record;
  },

  async delete(id) {
    await db.patterns.delete(id);
    patternStore.items = patternStore.items.filter((p) => p.id !== id);
    m.redraw();
  },

  /** Downloads all patterns as a JSON file, stripping internal ids. */
  exportJson() {
    const data = patternStore.items.map(({ id: _id, ...p }) => p);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patterns.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Imports patterns from a JSON string, merging them into the existing store.
   * @param {string} text
   */
  async importJson(text) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return;
    for (const { name, sounds, symbolSetId } of data) {
      if (name && Array.isArray(sounds)) await db.patterns.save({ name, sounds, symbolSetId });
    }
    patternStore.items = await db.patterns.all();
    m.redraw();
  },
};
