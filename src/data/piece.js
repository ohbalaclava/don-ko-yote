import m from 'mithril';

let _nextId = 1;
const uid = () => String(_nextId++);

function makeSound(symbol) {
  return { id: uid(), name: symbol.name, hand: symbol.hand, duration: symbol.duration, instruction: '' };
}

function makeLine() {
  return { id: uid(), sounds: [] };
}

function lineDur(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
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
  beatsPerLine: 4,
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
    m.redraw();
  },

  clearLines() {
    const line = makeLine();
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    m.redraw();
  },

  setTitle(v) { piece.title = v; m.redraw(); },
  setJiuchi(v) { piece.jiuchi = v; m.redraw(); },
  setBeatsPerLine(v) { piece.beatsPerLine = Number(v); m.redraw(); },
  setBpm(v) { piece.bpm = Number(v); m.redraw(); },
  setAuthor(v) { piece.author = v; m.redraw(); },
  setIcon(dataUrl) { piece.icon = dataUrl; m.redraw(); },
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
    m.redraw();
  },

  reorderLine(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const lines = piece.lines.slice();
    const [line] = lines.splice(fromIndex, 1);
    lines.splice(toIndex, 0, line);
    piece.lines = lines;
    m.redraw();
  },

  duplicateLine(lineId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const copy = {
      id: uid(),
      sounds: line.sounds.map(s => ({
        ...s,
        id: uid(),
        ...(s.type === 'group' ? { sounds: s.sounds.map(gs => ({ ...gs, id: uid() })) } : {}),
      })),
    };
    const idx = piece.lines.findIndex(l => l.id === lineId);
    piece.lines.splice(idx + 1, 0, copy);
    piece.selectedLineId = copy.id;
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
    m.redraw();
  },

  // ── Sounds ────────────────────────────────────────────────────────────────

  addSound(lineId, symbol, atIndex) {
    const fromIdx = piece.lines.findIndex(l => l.id === lineId);
    if (fromIdx === -1) return;
    const s = makeSound(symbol);
    const tIdx = targetLineIdx(fromIdx, s.duration);
    const target = piece.lines[tIdx];
    if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, s);
    else target.sounds.push(s);
    if (tIdx !== fromIdx) piece.selectedLineId = target.id;
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
    m.redraw();
  },

  removeSound(lineId, soundId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    line.sounds = line.sounds.filter(s => s.id !== soundId);
    m.redraw();
  },

  updateSound(lineId, soundId, patch) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const s = line.sounds.find(s => s.id === soundId);
    if (!s) return;
    Object.assign(s, patch);
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
      if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, group);
      else target.sounds.push(group);
      if (tIdx !== fromIdx) piece.selectedLineId = target.id;
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
    m.redraw();
  },
};
