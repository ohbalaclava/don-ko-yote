import { db } from '../db.js';
import m from 'mithril';

function applyToDOM() {
  document.body.classList.toggle('dark', settings.darkMode);
}

export const settings = {
  proportionalWidth: false,
  font: 'sans',
  darkMode: false,
  defaultBackground: null,
  defaultAuthor: '',

  async load() {
    const saved = await db.kv.get('settings');
    if (saved) {
      if ('proportionalWidth' in saved) settings.proportionalWidth = saved.proportionalWidth;
      if ('font' in saved) settings.font = saved.font;
      if ('darkMode' in saved) settings.darkMode = saved.darkMode;
      if ('defaultBackground' in saved) settings.defaultBackground = saved.defaultBackground;
      if ('defaultAuthor' in saved) settings.defaultAuthor = saved.defaultAuthor;
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
      defaultBackground: settings.defaultBackground,
      defaultAuthor: settings.defaultAuthor,
    });
    applyToDOM();
    m.redraw();
  },
};
