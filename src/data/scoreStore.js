import m from 'mithril';
import { db } from '../db.js';
import { piece } from './piece.js';
import { history } from './history.js';
import { patternStore } from './patterns.js';

/**
 * Expands any legacy group tiles in a lines array into their constituent sounds.
 * Group tiles were removed from the data model; scores saved before this change
 * may still contain them and must be migrated on load.
 * @param {Array} lines
 * @returns {Array} Lines with no group-type sounds.
 */
const NON_SOUND_TYPES = new Set(['heading', 'note', 'divider', 'block-repeat']);

/**
 * Returns the id of the last sound line in `lines` (skipping headings, notes,
 * dividers, and block-repeat markers). Falls back to the very last item if no
 * sound line exists, or null for an empty array.
 * @param {Array} lines
 * @returns {string | null}
 */
function lastSoundLineId(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!NON_SOUND_TYPES.has(lines[i].type)) return lines[i].id;
  }
  return lines[lines.length - 1]?.id ?? null;
}

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

let autoSaveTimer = null;

function snapshot() {
  return {
    id: piece.id || undefined,
    title: piece.title || 'Untitled',
    savedAt: Date.now(),
    taiko: piece.taiko,
    jiuchi: piece.jiuchi,
    beatsPerLine: piece.beatsPerLine,
    bpm: piece.bpm,
    author: piece.author,
    icon: piece.icon,
    showVolume: piece.showVolume,
    lines: piece.lines,
    patterns: patternStore.items,
  };
}

export const scoreStore = {
  items: [],

  /**
   * Patches piece.setTitle to auto-save 1 second after the user stops typing,
   * but only when the piece has already been saved (has an id).
   */
  init() {
    const orig = piece.setTitle.bind(piece);
    piece.setTitle = (v) => {
      orig(v);
      if (piece.id) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => scoreStore.save(), 1000);
      }
    };
  },

  async load() {
    scoreStore.items = await db.scores.all();
    m.redraw();
  },

  async save() {
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
    const score = await db.scores.get(id);
    if (!score) return;
    piece.id = score.id;
    piece.title = score.title;
    piece.taiko = score.taiko ?? piece.taiko;
    piece.jiuchi = score.jiuchi;
    piece.beatsPerLine = score.beatsPerLine;
    piece.bpm = score.bpm ?? 120;
    piece.author = score.author ?? '';
    piece.icon = score.icon ?? null;
    piece.showVolume = score.showVolume ?? false;
    piece.lines = expandGroupsInLines(score.lines);
    piece.selectedLineId = lastSoundLineId(piece.lines);
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
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
    const data = JSON.parse(text);
    piece.id = null;
    piece.title = data.title ?? 'Untitled';
    piece.taiko = data.taiko ?? piece.taiko;
    piece.jiuchi = data.jiuchi ?? piece.jiuchi;
    piece.beatsPerLine = data.beatsPerLine ?? piece.beatsPerLine;
    piece.bpm = data.bpm ?? 120;
    piece.author = data.author ?? '';
    piece.icon = data.icon ?? null;
    piece.showVolume = data.showVolume ?? false;
    if (Array.isArray(data.lines) && data.lines.length) {
      piece.lines = expandGroupsInLines(data.lines);
      piece.selectedLineId = lastSoundLineId(piece.lines);
    }
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    patternStore.setItems(data.patterns ?? []);
    history.reset(piece._snapshot());
    m.redraw();
  },
};
