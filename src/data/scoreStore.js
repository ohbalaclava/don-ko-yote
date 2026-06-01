import m from 'mithril';
import { db } from '../db.js';
import { piece, isSoundLine } from './piece.js';
import { history } from './history.js';
import { patternStore } from './patterns.js';
import { player } from '../audio/player.js';

/**
 * Returns the id of the last sound line in `lines` (skipping headings, notes,
 * dividers, and block-repeat markers). Falls back to the very last item if no
 * sound line exists, or null for an empty array.
 * @param {Array} lines
 * @returns {string | null}
 */
function lastSoundLineId(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isSoundLine(lines[i])) return lines[i].id;
  }
  return lines[lines.length - 1]?.id ?? null;
}

/**
 * Expands any legacy group tiles in a lines array into their constituent sounds.
 * Group tiles were removed from the data model; scores saved before this change
 * may still contain them and must be migrated on load.
 * @param {Array} lines
 * @returns {Array} Lines with no group-type sounds.
 */
function expandGroupsInLines(lines) {
  return lines.map((line) => {
    if (!line.sounds) return line;
    const expanded = [];
    for (const s of line.sounds) {
      if (s.type === 'group') {
        for (const gs of s.sounds) {
          expanded.push({ ...gs, id: crypto.randomUUID() });
        }
      } else {
        expanded.push(s);
      }
    }
    return { ...line, sounds: expanded };
  });
}

let autosaveTimer = null;

function snapshot() {
  return {
    ...piece._snapshot(), // all persisted scalar fields + lines
    id: piece.id || undefined,
    title: piece.title || 'Untitled',
    savedAt: Date.now(),
    patterns: patternStore.items,
  };
}

export const scoreStore = {
  items: [],
  autosaveData: null,

  /**
   * Initialises autosave on startup: reads any existing autosave from the
   * kv store and patches history.push to debounce writes after every mutation.
   */
  init() {
    db.kv.get('autosave').then((data) => {
      if (data) {
        scoreStore.autosaveData = data;
        m.redraw();
      }
    });

    const origPush = history.push.bind(history);
    history.push = (state) => {
      origPush(state);
      clearTimeout(autosaveTimer);
      // snapshot() captures piece.id and patternStore.items; the `state`
      // argument is piece._snapshot() which omits both.
      autosaveTimer = setTimeout(() => db.kv.set('autosave', snapshot()), 2000);
    };
  },

  async load() {
    scoreStore.items = await db.scores.all();
    m.redraw();
  },

  /** Cancels any pending debounce, clears the in-memory cache, and deletes the kv row. */
  clearAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    scoreStore.autosaveData = null;
    db.kv.delete('autosave');
  },

  /**
   * Restores the piece from the in-memory autosave snapshot, then clears the slot.
   * Preserves piece.id so a subsequent explicit save updates the original named record.
   */
  loadAutosave() {
    const score = scoreStore.autosaveData;
    if (!score) return;
    player.stop();
    piece.id = score.id ?? null;
    piece.loadFromData(score);
    piece.lines = expandGroupsInLines(score.lines ?? []);
    piece.selectedLineId = lastSoundLineId(piece.lines);
    patternStore.setItems(score.patterns ?? []);
    history.reset(piece._snapshot());
    m.redraw();
  },

  async save() {
    scoreStore.clearAutosave();
    const record = await db.scores.save(snapshot());
    piece.id = record.id;
    scoreStore.items = await db.scores.all();
    m.redraw();
  },

  /**
   * Loads a saved score by id, fully replacing all piece state and undo history.
   * @param {string} id
   */
  async loadScore(id) {
    scoreStore.clearAutosave();
    player.stop();
    const score = await db.scores.get(id);
    if (!score) return;
    piece.id = score.id;
    piece.loadFromData(score);
    piece.lines = expandGroupsInLines(score.lines);
    piece.selectedLineId = lastSoundLineId(piece.lines);
    patternStore.setItems(score.patterns ?? []);
    history.reset(piece._snapshot());
    scoreStore.items = await db.scores.all();
    m.redraw();
  },

  /**
   * Deletes a saved score. If the current piece matches this id, clears piece.id
   * so a subsequent save creates a new record rather than trying to update the deleted one.
   * @param {string} id
   */
  async delete(id) {
    await db.scores.delete(id);
    if (piece.id === id) piece.id = null;
    scoreStore.items = scoreStore.items.filter((s) => s.id !== id);
    m.redraw();
  },

  /** Downloads the current score as a JSON file, stripping the internal database id. */
  exportJson() {
    const { id: _id, ...data } = snapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${piece.title || 'score'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Loads a score from a JSON string into the current piece without saving it.
   * Resets undo history. piece.id is cleared so the first save creates a new record.
   * @param {string} text
   */
  importJson(text) {
    scoreStore.clearAutosave();
    player.stop();
    const data = JSON.parse(text);
    piece.id = null;
    piece.loadFromData(data);
    if (Array.isArray(data.lines) && data.lines.length) {
      piece.lines = expandGroupsInLines(data.lines);
      piece.selectedLineId = lastSoundLineId(piece.lines);
    }
    patternStore.setItems(data.patterns ?? []);
    history.reset(piece._snapshot());
    m.redraw();
  },
};
