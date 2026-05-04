import m from 'mithril';
import { db } from '../db.js';

export const patternStore = {
  items: [],

  async load() {
    patternStore.items = await db.patterns.all();
    m.redraw();
  },

  async save(name, sounds) {
    const record = await db.patterns.save({ name, sounds });
    patternStore.items = await db.patterns.all();
    m.redraw();
    return record;
  },

  async delete(id) {
    await db.patterns.delete(id);
    patternStore.items = patternStore.items.filter(p => p.id !== id);
    m.redraw();
  },
};
