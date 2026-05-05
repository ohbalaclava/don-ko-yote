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

  importJson(text) {
    const data = JSON.parse(text);
    piece.id           = null;
    piece.title        = data.title        ?? 'Untitled';
    piece.jiuchi       = data.jiuchi       ?? piece.jiuchi;
    piece.beatsPerLine = data.beatsPerLine ?? piece.beatsPerLine;
    piece.bpm          = data.bpm          ?? 120;
    piece.author       = data.author       ?? '';
    piece.icon         = data.icon         ?? null;
    if (Array.isArray(data.lines) && data.lines.length) {
      piece.lines = data.lines;
      piece.selectedLineId = data.lines[0].id;
    }
    piece.editingTile = null;
    piece.selectMode  = false;
    piece.selection   = { lineId: null, anchorId: null, soundIds: [] };
    m.redraw();
  },
};