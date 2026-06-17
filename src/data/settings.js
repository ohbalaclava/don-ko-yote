import { db } from '../db.js';
import m from 'mithril';
import { setMasterVolume } from '../audio/engine.js';

function applyToDOM() {
  document.body.classList.toggle('dark', settings.darkMode);
}

export const settings = {
  proportionalWidth: false,
  font: 'sans',
  darkMode: false,
  defaultBackground: null,
  defaultAuthor: '',
  defaultShowVolume: false,
  countIn: false,
  uiSounds: true, // audible feedback on palette taps/drags and score-tile taps
  volume: 1, // master playback-volume multiplier (1 = default loudness)
  // Metronome config (on/off, head-only, emphasise, jiuchi, Shime, volume) is
  // stored per-score on `piece`, not here — see PERSISTED_FIELDS in piece.js.

  async load() {
    const saved = await db.kv.get('settings');
    if (saved) {
      if ('proportionalWidth' in saved) settings.proportionalWidth = saved.proportionalWidth;
      if ('font' in saved) settings.font = saved.font;
      if ('darkMode' in saved) settings.darkMode = saved.darkMode;
      if ('defaultBackground' in saved) settings.defaultBackground = saved.defaultBackground;
      if ('defaultAuthor' in saved) settings.defaultAuthor = saved.defaultAuthor;
      if ('defaultShowVolume' in saved) settings.defaultShowVolume = saved.defaultShowVolume;
      if ('countIn' in saved) settings.countIn = saved.countIn;
      if ('uiSounds' in saved) settings.uiSounds = saved.uiSounds;
      if ('volume' in saved) settings.volume = saved.volume;
    }
    setMasterVolume(settings.volume);
    applyToDOM();
    m.redraw();
  },

  async set(key, value) {
    settings[key] = value;
    if (key === 'volume') setMasterVolume(value);
    await db.kv.set('settings', {
      proportionalWidth: settings.proportionalWidth,
      font: settings.font,
      darkMode: settings.darkMode,
      defaultBackground: settings.defaultBackground,
      defaultAuthor: settings.defaultAuthor,
      defaultShowVolume: settings.defaultShowVolume,
      countIn: settings.countIn,
      uiSounds: settings.uiSounds,
      volume: settings.volume,
    });
    applyToDOM();
    m.redraw();
  },
};
