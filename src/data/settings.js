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
  volume: 1, // master playback-volume multiplier (1 = default loudness)
  metronome: false, // play a metronome during playback
  metronomeHeadOnly: true, // tick only the beat head, vs. all jiuchi subdivisions
  metronomeEmphasiseHead: true, // accent the head of every beat
  metronomeJiuchi: 'auto', // 'auto' follows piece.jiuchi; else a jiuchi name
  metronomeShime: false, // use the Shime TEN sample instead of a synth click
  metronomeVolume: 1, // independent metronome volume multiplier

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
      if ('volume' in saved) settings.volume = saved.volume;
      if ('metronome' in saved) settings.metronome = saved.metronome;
      if ('metronomeHeadOnly' in saved) settings.metronomeHeadOnly = saved.metronomeHeadOnly;
      if ('metronomeEmphasiseHead' in saved)
        settings.metronomeEmphasiseHead = saved.metronomeEmphasiseHead;
      if ('metronomeJiuchi' in saved) settings.metronomeJiuchi = saved.metronomeJiuchi;
      if ('metronomeShime' in saved) settings.metronomeShime = saved.metronomeShime;
      if ('metronomeVolume' in saved) settings.metronomeVolume = saved.metronomeVolume;
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
      volume: settings.volume,
      metronome: settings.metronome,
      metronomeHeadOnly: settings.metronomeHeadOnly,
      metronomeEmphasiseHead: settings.metronomeEmphasiseHead,
      metronomeJiuchi: settings.metronomeJiuchi,
      metronomeShime: settings.metronomeShime,
      metronomeVolume: settings.metronomeVolume,
    });
    applyToDOM();
    m.redraw();
  },
};
