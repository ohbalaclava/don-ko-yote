import m from 'mithril';
import { piece } from './piece.js';
import { VERSION } from '../version.js';
import { uid } from '../uid.js';

export const patternStore = {
  items: [],

  /**
   * Adds a pattern to the in-memory list. Changes are persisted to the score on
   * the next score save.
   * @param {string} name
   * @param {Array} sounds
   * @param {string} [symbolSetId]
   * @returns {{ id: string, name: string, sounds: Array, symbolSetId: string | undefined }}
   */
  save(name, sounds, symbolSetId) {
    const record = { id: uid(), name, sounds, symbolSetId };
    patternStore.items = [...patternStore.items, record];
    m.redraw();
    return record;
  },

  /**
   * Removes a pattern from the in-memory list by id.
   * @param {string} id
   */
  delete(id) {
    patternStore.items = patternStore.items.filter((p) => p.id !== id);
    m.redraw();
  },

  /**
   * Replaces the in-memory pattern list from an external source (e.g. a loaded
   * score). Items without an id receive a fresh UUID.
   * @param {Array} items
   */
  setItems(items) {
    patternStore.items = (Array.isArray(items) ? items : []).map((p) =>
      p.id ? p : { ...p, id: uid() }
    );
    m.redraw();
  },

  /** Downloads the current patterns as a JSON file, stripping internal ids. */
  exportJson() {
    const patterns = patternStore.items.map(({ id: _id, ...p }) => p);
    const blob = new Blob([JSON.stringify({ appVersion: VERSION, patterns }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patterns.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Merges patterns from a JSON string into the current list, skipping any
   * patterns whose symbolSetId does not match the active score's meter.
   * Patterns with no symbolSetId are always accepted.
   * @param {string} text
   */
  importJson(text) {
    const parsed = JSON.parse(text);
    // Accept both the current { appVersion, patterns: [...] } format and the
    // legacy bare-array format from exports made before versioning was added.
    const data = Array.isArray(parsed) ? parsed : (parsed.patterns ?? []);
    if (!Array.isArray(data)) return;
    const currentSetId = piece.symbolSet.id;
    const incoming = data
      .filter(({ name, sounds, symbolSetId }) => {
        if (!name || !Array.isArray(sounds)) return false;
        return !symbolSetId || symbolSetId === currentSetId;
      })
      .map(({ name, sounds, symbolSetId }) => ({
        id: uid(),
        name,
        sounds,
        symbolSetId,
      }));
    patternStore.items = [...patternStore.items, ...incoming];
    m.redraw();
  },
};
