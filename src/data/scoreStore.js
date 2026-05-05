import m from 'mithril';
import { db } from '../db.js';
import { piece } from './piece.js';

let autoSaveTimer = null;

function snapshot() {
  return {
    id: piece.id || undefined,
    title: piece.title || 'Untitled',
    savedAt: Date.now(),
    jiuchi: piece.jiuchi,
    beatsPerLine: piece.beatsPerLine,
    bpm: piece.bpm,
    author: piece.author,
    icon: piece.icon,
    lines: piece.lines,
  };
}

export const scoreStore = {
  items: [],

  // Patch piece.setTitle to auto-save 1 s after the user stops typing.
  init() {
    const orig = piece.setTitle.bind(piece);
    piece.setTitle = v => {
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

  async loadScore(id) {
    const score = await db.scores.get(id);
    if (!score) return;
    piece.id        = score.id;
    piece.title     = score.title;
    piece.jiuchi    = score.jiuchi;
    piece.beatsPerLine = score.beatsPerLine;
    piece.bpm       = score.bpm    ?? 120;
    piece.author    = score.author ?? '';
    piece.icon      = score.icon   ?? null;
    piece.lines     = score.lines;
    piece.selectedLineId = score.lines[0]?.id ?? null;
    piece.editingTile = null;
    piece.selectMode  = false;
    piece.selection   = { lineId: null, anchorId: null, soundIds: [] };
    scoreStore.items = await db.scores.all();
    m.redraw();
  },

  async delete(id) {
    await db.scores.delete(id);
    if (piece.id === id) piece.id = null;
    scoreStore.items = scoreStore.items.filter(s => s.id !== id);
    m.redraw();
  },
};