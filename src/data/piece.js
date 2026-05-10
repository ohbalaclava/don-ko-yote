import m from 'mithril';
import { history } from './history.js';
import { settings } from './settings.js';

let _nextId = 1;
const uid = () => String(_nextId++);

function makeSound(symbol) {
  return { id: uid(), name: symbol.name, hand: symbol.hand, duration: symbol.duration, instruction: '' };
}

function makeLine() {
  return { id: uid(), sounds: [], repeat: 1 };
}

function lineDur(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
}

// Fractional beat offset at insertion index (0 = beat boundary, 0.5 = halfway, etc.)
function beatFractional(sounds, idx) {
  let total = 0;
  for (let i = 0; i < idx; i++) total += sounds[i].duration;
  return Math.round((total % 1) * 4) / 4;
}

// Returns the index of the first line (starting from fromIdx) that can fit
// `duration` beats. Creates a new line at the end when all are full.
// When beatsPerLine is 0 (unlimited) or the item is too large to fit anywhere,
// returns fromIdx unchanged.
function targetLineIdx(fromIdx, duration) {
  const max = piece.beatsPerLine;
  if (!max || duration > max) return fromIdx;
  let i = fromIdx;
  while (i < piece.lines.length) {
    if (lineDur(piece.lines[i]) + duration <= max) return i;
    i++;
  }
  piece.lines.push(makeLine());
  return piece.lines.length - 1;
}

const _firstLine = makeLine();

export const piece = {
  id: null,
  title: 'Untitled',
  jiuchi: 'gobu-gobu',
  beatsPerLine: 8,
  bpm: 120,
  author: '',
  icon: null,
  lines: [_firstLine],
  selectedLineId: _firstLine.id,

  // Which tile has its popup open: { lineId, soundId } | null
  editingTile: null,

  // Selection mode for building patterns
  selectMode: false,
  selection: { lineId: null, anchorId: null, soundIds: [] },

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  _snapshot() {
    return {
      title: piece.title,
      jiuchi: piece.jiuchi,
      beatsPerLine: piece.beatsPerLine,
      bpm: piece.bpm,
      author: piece.author,
      icon: piece.icon,
      lines: piece.lines,
    };
  },

  _restore(state) {
    piece.title = state.title;
    piece.jiuchi = state.jiuchi;
    piece.beatsPerLine = state.beatsPerLine;
    piece.bpm = state.bpm;
    piece.author = state.author;
    piece.icon = state.icon;
    piece.lines = state.lines;
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    if (!piece.lines.find(l => l.id === piece.selectedLineId)) {
      piece.selectedLineId = piece.lines[0]?.id ?? null;
    }
  },

  undo() {
    const state = history.undo();
    if (!state) return;
    piece._restore(state);
    m.redraw();
  },

  redo() {
    const state = history.redo();
    if (!state) return;
    piece._restore(state);
    m.redraw();
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  reset(jiuchi, beatsPerLine) {
    const line = makeLine();
    piece.id = null;
    piece.title = 'Untitled';
    piece.jiuchi = jiuchi;
    piece.beatsPerLine = beatsPerLine;
    piece.bpm = 120;
    piece.author = '';
    piece.icon = null;
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    history.reset(piece._snapshot());
    m.redraw();
  },

  clearLines() {
    const line = makeLine();
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    history.push(piece._snapshot());
    m.redraw();
  },

  setTitle(v) { piece.title = v; history.push(piece._snapshot()); m.redraw(); },
  setJiuchi(v) { piece.jiuchi = v; history.push(piece._snapshot()); m.redraw(); },
  setBeatsPerLine(v) { piece.beatsPerLine = Number(v); history.push(piece._snapshot()); m.redraw(); },
  setBpm(v) { piece.bpm = Number(v); history.push(piece._snapshot()); m.redraw(); },
  setAuthor(v) { piece.author = v; history.push(piece._snapshot()); m.redraw(); },
  setIcon(dataUrl) { piece.icon = dataUrl; history.push(piece._snapshot()); m.redraw(); },
  selectLine(id) { piece.selectedLineId = id; m.redraw(); },

  setEditingTile(info) { piece.editingTile = info; m.redraw(); },

  // ── Select mode ───────────────────────────────────────────────────────────

  toggleSelectMode() {
    piece.selectMode = !piece.selectMode;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    piece.editingTile = null;
    m.redraw();
  },

  toggleSoundSelection(lineId, soundId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const idx = line.sounds.findIndex(s => s.id === soundId);
    if (idx === -1) return;

    const sel = piece.selection;

    // No selection or different line: start a fresh single-tile selection.
    if (sel.lineId !== lineId || sel.soundIds.length === 0) {
      piece.selection = { lineId, anchorId: soundId, soundIds: [soundId] };
      m.redraw();
      return;
    }

    const anchorIdx = line.sounds.findIndex(s => s.id === sel.anchorId);
    if (anchorIdx === -1) {
      piece.selection = { lineId, anchorId: soundId, soundIds: [soundId] };
      m.redraw();
      return;
    }

    // Tapping the anchor when only the anchor is selected: deselect.
    if (idx === anchorIdx && sel.soundIds.length === 1) {
      piece.selection = { lineId: null, anchorId: null, soundIds: [] };
      m.redraw();
      return;
    }

    const lo = Math.min(anchorIdx, idx);
    const hi = Math.max(anchorIdx, idx);
    const ids = line.sounds.slice(lo, hi + 1).map(s => s.id);
    piece.selection = { lineId, anchorId: sel.anchorId, soundIds: ids };
    m.redraw();
  },

  clearSelection() {
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    m.redraw();
  },

  // ── Lines ─────────────────────────────────────────────────────────────────

  addLine() {
    const line = makeLine();
    piece.lines.push(line);
    piece.selectedLineId = line.id;
    history.push(piece._snapshot());
    m.redraw();
  },

  reorderLine(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const lines = piece.lines.slice();
    const [line] = lines.splice(fromIndex, 1);
    lines.splice(toIndex, 0, line);
    piece.lines = lines;
    history.push(piece._snapshot());
    m.redraw();
  },

  duplicateLine(lineId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const copy = {
      id: uid(),
      repeat: line.repeat || 1,
      sounds: line.sounds.map(s => ({
        ...s,
        id: uid(),
        ...(s.type === 'group' ? { sounds: s.sounds.map(gs => ({ ...gs, id: uid() })) } : {}),
      })),
    };
    const idx = piece.lines.findIndex(l => l.id === lineId);
    piece.lines.splice(idx + 1, 0, copy);
    piece.selectedLineId = copy.id;
    history.push(piece._snapshot());
    m.redraw();
  },

  setLineRepeat(lineId, value) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    line.repeat = Math.max(1, Math.round(Number(value)) || 1);
    history.push(piece._snapshot());
    m.redraw();
  },

  removeLine(lineId) {
    const idx = piece.lines.findIndex(l => l.id === lineId);
    piece.lines = piece.lines.filter(l => l.id !== lineId);
    if (piece.lines.length === 0) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    } else if (piece.selectedLineId === lineId) {
      piece.selectedLineId = piece.lines[Math.min(idx, piece.lines.length - 1)].id;
    }
    history.push(piece._snapshot());
    m.redraw();
  },

  // ── Sounds ────────────────────────────────────────────────────────────────

  // Returns the max duration that can be added at the end of the given line
  // without crossing a beat boundary (Infinity when disabled or at a beat boundary).
  maxAddDuration(lineId) {
    if (!settings.beatBoundaries) return Infinity;
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return Infinity;
    const frac = beatFractional(line.sounds, line.sounds.length);
    return frac === 0 ? Infinity : 1 - frac;
  },

  addSound(lineId, symbol, atIndex) {
    const fromIdx = piece.lines.findIndex(l => l.id === lineId);
    if (fromIdx === -1) return;
    const s = makeSound(symbol);
    const tIdx = targetLineIdx(fromIdx, s.duration);
    const target = piece.lines[tIdx];
    const insertAt = (tIdx === fromIdx && atIndex != null) ? atIndex : target.sounds.length;
    if (settings.beatBoundaries) {
      const frac = beatFractional(target.sounds, insertAt);
      if (frac > 0 && s.duration > 1 - frac) return;
    }
    if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, s);
    else target.sounds.push(s);
    if (tIdx !== fromIdx) piece.selectedLineId = target.id;
    history.push(piece._snapshot());
    m.redraw();
  },

  moveSound(fromLineId, soundId, toLineId, toIndex) {
    const fromLine = piece.lines.find(l => l.id === fromLineId);
    const toLine   = piece.lines.find(l => l.id === toLineId);
    if (!fromLine || !toLine) return;
    const idx = fromLine.sounds.findIndex(s => s.id === soundId);
    if (idx === -1) return;
    const sound = fromLine.sounds[idx];
    if (fromLineId !== toLineId && piece.beatsPerLine > 0 &&
        lineDur(toLine) + sound.duration > piece.beatsPerLine) {
      m.redraw(); // revert SortableJS DOM change
      return;
    }
    fromLine.sounds.splice(idx, 1);
    toLine.sounds.splice(toIndex, 0, sound);
    history.push(piece._snapshot());
    m.redraw();
  },

  moveSounds(fromLineId, soundIds, toLineId, toIndex) {
    const fromLine = piece.lines.find(l => l.id === fromLineId);
    const toLine   = piece.lines.find(l => l.id === toLineId);
    if (!fromLine || !toLine) return;
    const idSet = new Set(soundIds);
    const sounds = fromLine.sounds.filter(s => idSet.has(s.id));
    if (sounds.length !== soundIds.length) return;
    if (fromLineId !== toLineId && piece.beatsPerLine > 0) {
      const totalDur = sounds.reduce((sum, s) => sum + s.duration, 0);
      if (lineDur(toLine) + totalDur > piece.beatsPerLine) { m.redraw(); return; }
    }
    fromLine.sounds = fromLine.sounds.filter(s => !idSet.has(s.id));
    toLine.sounds.splice(toIndex, 0, ...sounds);
    history.push(piece._snapshot());
    m.redraw();
  },

  removeSound(lineId, soundId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    line.sounds = line.sounds.filter(s => s.id !== soundId);
    history.push(piece._snapshot());
    m.redraw();
  },

  updateSound(lineId, soundId, patch) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const s = line.sounds.find(s => s.id === soundId);
    if (!s) return;
    Object.assign(s, patch);
    history.push(piece._snapshot());
    m.redraw();
  },

  // ── Group tiles (pattern instances) ──────────────────────────────────────

  addGroup(lineId, pattern, atIndex) {
    const fromIdx = piece.lines.findIndex(l => l.id === lineId);
    if (fromIdx === -1) return;
    const patternDur = pattern.sounds.reduce((sum, s) => sum + s.duration, 0);
    const max = piece.beatsPerLine;

    if (!max || patternDur <= max) {
      const group = {
        id: uid(),
        type: 'group',
        name: pattern.name,
        sounds: pattern.sounds,
        duration: patternDur,
      };
      const tIdx = targetLineIdx(fromIdx, group.duration);
      const target = piece.lines[tIdx];
      const insertAt = (tIdx === fromIdx && atIndex != null) ? atIndex : target.sounds.length;
      if (settings.beatBoundaries) {
        const frac = beatFractional(target.sounds, insertAt);
        if (frac > 0 && group.duration > 1 - frac) return;
      }
      if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, group);
      else target.sounds.push(group);
      if (tIdx !== fromIdx) piece.selectedLineId = target.id;
      history.push(piece._snapshot());
      m.redraw();
      return;
    }

    // Pattern exceeds beatsPerLine: expand and distribute sounds across lines.
    let lineIdx = fromIdx;
    for (const s of pattern.sounds) {
      lineIdx = targetLineIdx(lineIdx, s.duration);
      piece.lines[lineIdx].sounds.push({ ...s, id: uid() });
    }
    piece.selectedLineId = piece.lines[lineIdx].id;
    history.push(piece._snapshot());
    m.redraw();
  },

  expandGroup(lineId, soundId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const idx = line.sounds.findIndex(s => s.id === soundId);
    if (idx === -1) return;
    const group = line.sounds[idx];
    if (group.type !== 'group') return;
    const expanded = group.sounds.map(s => ({ ...s, id: uid() }));
    line.sounds.splice(idx, 1, ...expanded);
    piece.editingTile = null;
    history.push(piece._snapshot());
    m.redraw();
  },
};

history.init(piece._snapshot());
