import { db } from '../db.js';
import m from 'mithril';

function applyToDOM() {
  document.body.classList.toggle('dark', settings.darkMode);
}

export const settings = {
  proportionalWidth: false,
  font: 'sans',
  darkMode: false,

  async load() {
    const saved = await db.kv.get('settings');
    if (saved) {
      if ('proportionalWidth' in saved) settings.proportionalWidth = saved.proportionalWidth;
      if ('font' in saved) settings.font = saved.font;
      if ('darkMode' in saved) settings.darkMode = saved.darkMode;
    }
    applyToDOM();
    m.redraw();
  },

  async set(key, value) {
    settings[key] = value;
    await db.kv.set('settings', {
      proportionalWidth: settings.proportionalWidth,
      font: settings.font,
      darkMode: settings.darkMode,
    });
    applyToDOM();
    m.redraw();
  },
};
