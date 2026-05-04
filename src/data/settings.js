import { db } from '../db.js';
import m from 'mithril';

const FONT_CLASSES = ['font-sans', 'font-serif', 'font-mono', 'font-script'];

function applyToDOM() {
  document.body.classList.remove(...FONT_CLASSES);
  document.body.classList.add(`font-${settings.font}`);
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

  exportJson() {
    const data = JSON.stringify({
      proportionalWidth: settings.proportionalWidth,
      font: settings.font,
      darkMode: settings.darkMode,
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'don-ko-yote-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  async importJson(text) {
    const data = JSON.parse(text);
    if (typeof data.proportionalWidth === 'boolean') settings.proportionalWidth = data.proportionalWidth;
    if (['sans', 'serif', 'mono', 'script'].includes(data.font)) settings.font = data.font;
    if (typeof data.darkMode === 'boolean') settings.darkMode = data.darkMode;
    await db.kv.set('settings', {
      proportionalWidth: settings.proportionalWidth,
      font: settings.font,
      darkMode: settings.darkMode,
    });
    applyToDOM();
    m.redraw();
  },
};