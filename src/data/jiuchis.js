import m from 'mithril';
import { db } from '../db.js';
import { settings } from './settings.js';
import { JIUCHI_PATTERNS } from './metronome.js';
import { jiuchiEventsFromLines } from './sequence.js';

/**
 * Global library of user-defined jiuchis (base rhythms), persisted in the
 * `jiuchis` IndexedDB store. Two kinds of record:
 *
 *   { id, name, kind: 'ticks',  time, positions }            — from the tick-grid
 *     editor; `positions` are 1-indexed subdivisions, played as metronome clicks.
 *   { id, name, kind: 'sounds', time, taiko, events, lengthDiv } — captured from
 *     score lines marked as jiuchi; `events` are pre-resolved audible strikes
 *     (see jiuchiEventsFromLines) looped every `lengthDiv` divisions and played
 *     with real drum voices.
 *
 * The metronome setting references a custom jiuchi as `'custom:<id>'`, keeping
 * the value space distinct from standard jiuchi names.
 */
export const jiuchiStore = {
  items: [],

  async load() {
    jiuchiStore.items = await db.jiuchis.all();
    m.redraw();
  },

  get(id) {
    return jiuchiStore.items.find((j) => j.id === id);
  },

  /**
   * Upserts a record (a UUID is assigned on first save) and refreshes the
   * in-memory list.
   * @param {object} record
   * @returns {Promise<object>} The saved record, including its id.
   */
  async save(record) {
    const saved = await db.jiuchis.save(record);
    const idx = jiuchiStore.items.findIndex((j) => j.id === saved.id);
    if (idx >= 0) jiuchiStore.items[idx] = saved;
    else jiuchiStore.items = [...jiuchiStore.items, saved];
    m.redraw();
    return saved;
  },

  /**
   * Deletes a custom jiuchi. If the metronome setting points at it, the setting
   * falls back to 'auto' so playback never references a missing record.
   * @param {string} id
   */
  async delete(id) {
    await db.jiuchis.delete(id);
    jiuchiStore.items = jiuchiStore.items.filter((j) => j.id !== id);
    if (settings.metronomeJiuchi === `custom:${id}`) {
      await settings.set('metronomeJiuchi', 'auto');
    }
    m.redraw();
  },

  /**
   * Resolves a `settings.metronomeJiuchi` value to what the player should play.
   * Standard names (and 'auto', which follows piece.jiuchi) resolve to a
   * ticks-kind descriptor from JIUCHI_PATTERNS. `'custom:<id>'` resolves to the
   * library record — but only when it exists and its `time` matches the piece's,
   * otherwise the standard 'auto' resolution is used so a deleted record or a
   * straight/swing mismatch degrades gracefully instead of breaking playback.
   * @param {string} value - The setting value.
   * @param {object} piece
   * @returns {object} A ticks-kind descriptor `{ kind: 'ticks', positions }` or a
   *   sounds-kind library record.
   */
  resolveSetting(value, piece) {
    if (value?.startsWith('custom:')) {
      const record = jiuchiStore.get(value.slice('custom:'.length));
      if (record && record.time === piece.time) return record;
      value = 'auto';
    }
    const name = value === 'auto' ? piece.jiuchi : value;
    return { kind: 'ticks', positions: JIUCHI_PATTERNS[name] ?? [1] };
  },

  /**
   * Refreshes library records from their source lines after an edit: groups the
   * piece's jiuchi-marked lines by `jiuchiId` and re-captures each one. Only ids
   * already present in the library are updated — a deleted record is never
   * resurrected by later edits to its (now dangling) source lines.
   * @param {object} piece
   */
  async syncFromPiece(piece) {
    const groups = new Map();
    for (const line of piece.lines) {
      if (!line.jiuchiId) continue;
      if (!groups.has(line.jiuchiId)) groups.set(line.jiuchiId, []);
      groups.get(line.jiuchiId).push(line);
    }
    for (const [id, lines] of groups) {
      const existing = jiuchiStore.get(id);
      if (!existing || existing.kind !== 'sounds') continue;
      const { events, lengthDiv } = jiuchiEventsFromLines(lines, piece.time);
      await jiuchiStore.save({
        ...existing,
        time: piece.time,
        taiko: piece.taiko,
        events,
        lengthDiv,
      });
    }
  },
};
