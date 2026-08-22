// Preset storage for the lab.
//
// localStorage, not the app's IndexedDB - the lab shares no state with the app
// at all. JSON export/import is the point of the feature: a preset that sounds
// right here is the thing that eventually gets pasted into the app's audio
// engine, so it has to leave this page in a readable form.
import { defaultsFor, clampParam } from './params.js';

const KEY = 'taiko-lab-presets-v1';

/**
 * Starting points measured off real drums: dimensions are close to the real
 * instruments and the tensions are chosen so each lands on its usual pitch
 * (shime ~400 Hz, nagado ~110 Hz, odaiko ~50 Hz). These are a place to start
 * tuning by ear, not finished voices.
 */
export const BUILTIN_PRESETS = [
  {
    name: 'Shime',
    params: {
      radius: 0.17,
      depth: 0.14,
      thickness: 1.0,
      tension: 31500,
      damping: 0.55,
      hitPos: 0.3,
      hardness: 0.85,
      glide: 0.2,
      noiseMix: 0.4,
      airMix: 0.25,
      velocity: 4,
      pan: 0,
    },
  },
  {
    name: 'Nagado',
    params: {
      radius: 0.23,
      depth: 0.6,
      thickness: 2.5,
      tension: 10900,
      damping: 0.35,
      hitPos: 0.3,
      hardness: 0.55,
      glide: 0.4,
      noiseMix: 0.35,
      airMix: 0.55,
      velocity: 4,
      pan: 0,
    },
  },
  {
    name: 'Katsugi',
    params: {
      radius: 0.17,
      depth: 0.34,
      thickness: 1.8,
      tension: 14200,
      damping: 0.4,
      hitPos: 0.3,
      hardness: 0.6,
      glide: 0.3,
      noiseMix: 0.35,
      airMix: 0.45,
      velocity: 4,
      pan: 0,
    },
  },
  {
    name: 'Odaiko',
    params: {
      radius: 0.5,
      depth: 1.0,
      thickness: 4.5,
      tension: 19200,
      damping: 0.2,
      hitPos: 0.25,
      hardness: 0.4,
      glide: 0.5,
      noiseMix: 0.3,
      airMix: 0.75,
      velocity: 4,
      pan: 0,
    },
  },
];

/**
 * Reads the user's saved presets.
 * @returns {Array<{ name: string, engine?: string, params: Record<string, number> }>}
 */
export function loadPresets() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Saves (or replaces, by name) one preset.
 * @param {string} name
 * @param {string} engine - Engine id the preset was tuned on.
 * @param {Record<string, number>} params
 * @returns {Array} The updated list.
 */
export function savePreset(name, engine, params) {
  const list = loadPresets().filter((preset) => preset.name !== name);
  list.push({ name, engine, params: { ...params } });
  list.sort((a, b) => a.name.localeCompare(b.name));
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

/**
 * Deletes a saved preset by name.
 * @param {string} name
 * @returns {Array} The updated list.
 */
export function deletePreset(name) {
  const list = loadPresets().filter((preset) => preset.name !== name);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

/**
 * Fills in any parameter the preset does not mention (an older preset, or one
 * saved on a different engine) from the engine's defaults, and clamps the rest
 * into range so hand-edited JSON cannot break rendering.
 * @param {object} engine
 * @param {Record<string, number>} params
 * @returns {Record<string, number>}
 */
export function applyToEngine(engine, params) {
  const merged = { ...defaultsFor(engine.params) };
  for (const spec of engine.params) {
    if (params[spec.key] != null) merged[spec.key] = clampParam(spec, Number(params[spec.key]));
  }
  return merged;
}

/**
 * Serialises a preset for the export box. Pretty-printed: the whole point is
 * that a human copies it out and pastes it into the app's source later.
 * @param {string} name
 * @param {string} engine
 * @param {Record<string, number>} params
 * @returns {string}
 */
export function exportJson(name, engine, params) {
  return JSON.stringify({ name, engine, params }, null, 2);
}

/**
 * Parses a pasted preset. Accepts either a full `{ name, engine, params }`
 * envelope or a bare parameter object.
 * @param {string} text
 * @returns {{ name?: string, engine?: string, params: Record<string, number> }}
 * @throws {Error} If the text is not usable preset JSON.
 */
export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Not an object');
  const params = data.params && typeof data.params === 'object' ? data.params : data;
  const numeric = Object.values(params).every((v) => typeof v === 'number');
  if (!numeric || !Object.keys(params).length) throw new Error('No numeric parameters found');
  return { name: data.name, engine: data.engine, params };
}
