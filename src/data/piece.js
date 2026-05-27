import m from 'mithril';
import { history } from './history.js';
import { getSymbolSet, SYMBOL_SETS } from './symbolSets.js';

const uid = () => crypto.randomUUID();

/**
 * Returns the nesting depth of a block-repeat marker: the count of other markers
 * in `markers` whose `lineIds` is a strict superset of this marker's `lineIds`.
 * Used to indent the marker row past any outer repeats that enclose it.
 */
export function markerDepth(marker, markers) {
  return markers.filter(
    (n) =>
      n.id !== marker.id &&
      n.lineIds.length > marker.lineIds.length &&
      marker.lineIds.every((id) => n.lineIds.includes(id))
  ).length;
}

/**
 * Returns the number of block-repeat markers whose `lineIds` includes `id`.
 * A line in a nested repeat shows one orange bar per containing repeat.
 */
export function lineDepth(id, markers) {
  return markers.filter((m) => m.lineIds.includes(id)).length;
}

/**
 * Creates a new sound object from a palette symbol. Symbols with `alternatives`
 * default to the first alternative; `editable` is propagated onto the sound so
 * the inline editor knows to expose duration controls.
 * @param {object} symbol
 */
function makeSound(symbol) {
  if (symbol.alternatives && symbol.alternatives.length > 0) {
    const alt = symbol.alternatives[0];
    return {
      id: uid(),
      name: symbol.name,
      hand: alt.hand,
      duration: alt.duration,
      instruction: '',
      alternatives: symbol.alternatives,
      ...((symbol.editable || alt.editable) && { editable: true }),
      ...(symbol.implicit && { implicit: true }),
    };
  }
  return {
    id: uid(),
    name: symbol.name,
    hand: symbol.hand,
    duration: symbol.duration,
    instruction: '',
    ...(symbol.editable && { editable: true }),
    ...(symbol.implicit && { implicit: true }),
  };
}

function makeLine() {
  return { id: uid(), sounds: [] };
}

function makeHeading() {
  return { id: uid(), type: 'heading', text: '' };
}

function makeNote() {
  return { id: uid(), type: 'note', text: '' };
}

function makeDivider() {
  return { id: uid(), type: 'divider' };
}

function makeBlockRepeat(count, lineIds) {
  return { id: uid(), type: 'block-repeat', count, lineIds };
}

function lineDur(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Returns the index of the first line (starting from fromIdx) that can fit
 * `duration` divisions. Creates a new line at the end when all lines are full.
 * When beatsPerLine is 0 (unlimited) or the item is too large to fit anywhere,
 * returns fromIdx unchanged.
 * @param {number} fromIdx - Starting line index.
 * @param {number} duration - Duration to accommodate, in divisions.
 * @returns {number} Index of the target line.
 */
function targetLineIdx(fromIdx, duration) {
  const max = piece.beatsPerLine * piece.time;
  if (!piece.beatsPerLine || duration > max) return fromIdx;
  let i = fromIdx;
  while (i < piece.lines.length) {
    const item = piece.lines[i];
    if (
      item.type !== 'heading' &&
      item.type !== 'note' &&
      item.type !== 'divider' &&
      item.type !== 'block-repeat' &&
      lineDur(item) + duration <= max
    )
      return i;
    i++;
  }
  piece.lines.push(makeLine());
  return piece.lines.length - 1;
}

const _firstLine = makeLine();
const _defaultSet = SYMBOL_SETS[0];
const _defaultTaiko = _defaultSet.taiko[0].name;
const _defaultJiuchi = _defaultSet.jiuchis[0];

export const piece = {
  id: null,
  title: 'Untitled',
  taiko: _defaultTaiko,
  jiuchi: _defaultJiuchi,
  beatsPerLine: 8,
  bpm: 120,
  author: '',
  icon: null,
  lines: [_firstLine],
  selectedLineId: _firstLine.id,

  /** Active symbol set, resolved lazily from (taiko, jiuchi). */
  get symbolSet() {
    return getSymbolSet(this.taiko, this.jiuchi) ?? _defaultSet;
  },

  /** Number of beat divisions for the active symbol set (e.g. 4 straight, 3 swing). */
  get time() {
    return this.symbolSet.time;
  },

  /** Number of skins on the active taiko (1 or 2). Sounds with a hand can target either skin when 2. */
  get skins() {
    return this.symbolSet.taiko.find((t) => t.name === this.taiko)?.skins ?? 1;
  },

  /** @type {{ lineId: string, soundId: string } | null} Which tile has its popup open. */
  editingTile: null,

  // Selection mode for building patterns
  selectMode: false,
  selection: { lineId: null, anchorId: null, soundIds: [] },

  // Line selection mode for bulk operations
  lineSelectMode: false,
  lineSelection: [],

  // ── Snapshot helpers ──────────────────────────────────────────────────────

  _snapshot() {
    return {
      title: piece.title,
      taiko: piece.taiko,
      jiuchi: piece.jiuchi,
      beatsPerLine: piece.beatsPerLine,
      bpm: piece.bpm,
      author: piece.author,
      icon: piece.icon,
      lines: piece.lines,
    };
  },

  /**
   * Applies a history snapshot to the piece and resets all transient UI state
   * (editing tile, select mode). Corrects selectedLineId if it no longer exists.
   * @param {{ title: string, taiko: string, jiuchi: string, beatsPerLine: number, bpm: number, author: string, icon: string|null, lines: Array }} state
   */
  _restore(state) {
    piece.title = state.title;
    piece.taiko = state.taiko;
    piece.jiuchi = state.jiuchi;
    piece.beatsPerLine = state.beatsPerLine;
    piece.bpm = state.bpm;
    piece.author = state.author;
    piece.icon = state.icon;
    piece.lines = state.lines;
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    piece.lineSelectMode = false;
    piece.lineSelection = [];
    if (!piece.lines.find((l) => l.id === piece.selectedLineId)) {
      piece.selectedLineId =
        piece.lines.find(
          (l) =>
            l.type !== 'heading' &&
            l.type !== 'note' &&
            l.type !== 'divider' &&
            l.type !== 'block-repeat'
        )?.id ?? null;
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

  /**
   * Resets the piece for a brand-new score.
   * @param {{ taiko?: string, jiuchi?: string, bpm?: number, beatsPerLine?: number, author?: string, icon?: string|null }} opts
   */
  reset(opts = {}) {
    const line = makeLine();
    piece.id = null;
    piece.title = 'Untitled';
    piece.taiko = opts.taiko ?? _defaultTaiko;
    piece.jiuchi = opts.jiuchi ?? _defaultJiuchi;
    piece.beatsPerLine = opts.beatsPerLine ?? 8;
    piece.bpm = opts.bpm ?? 120;
    piece.author = opts.author ?? '';
    piece.icon = opts.icon ?? null;
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    piece.lineSelectMode = false;
    piece.lineSelection = [];
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
    piece.lineSelectMode = false;
    piece.lineSelection = [];
    history.push(piece._snapshot());
    m.redraw();
  },

  setTitle(v) {
    piece.title = v;
    history.push(piece._snapshot());
    m.redraw();
  },
  setTaiko(v) {
    piece.taiko = v;
    history.push(piece._snapshot());
    m.redraw();
  },
  setJiuchi(v) {
    piece.jiuchi = v;
    history.push(piece._snapshot());
    m.redraw();
  },
  setBeatsPerLine(v) {
    piece.beatsPerLine = Number(v);
    history.push(piece._snapshot());
    m.redraw();
  },
  setBpm(v) {
    piece.bpm = Number(v);
    history.push(piece._snapshot());
    m.redraw();
  },
  setAuthor(v) {
    piece.author = v;
    history.push(piece._snapshot());
    m.redraw();
  },
  setIcon(dataUrl) {
    piece.icon = dataUrl;
    history.push(piece._snapshot());
    m.redraw();
  },
  selectLine(id) {
    piece.selectedLineId = id;
    m.redraw();
  },

  /**
   * Opens or closes the inline tile editor popup.
   * @param {{ lineId: string, soundId: string } | null} info - Pass null to close.
   */
  setEditingTile(info) {
    piece.editingTile = info;
    m.redraw();
  },

  // ── Select mode ───────────────────────────────────────────────────────────

  toggleSelectMode() {
    piece.selectMode = !piece.selectMode;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    piece.editingTile = null;
    if (piece.lineSelectMode) {
      piece.lineSelectMode = false;
      piece.lineSelection = [];
    }
    m.redraw();
  },

  /**
   * Extends or sets the contiguous selection using anchor-based logic.
   * - Tapping a sound on a different line, or with no prior selection: starts fresh at soundId.
   * - Tapping another sound on the same line: extends the range from the anchor to soundId.
   * - Tapping the anchor when it is the only selected sound: deselects.
   * @param {string} lineId
   * @param {string} soundId
   */
  toggleSoundSelection(lineId, soundId) {
    const line = piece.lines.find((l) => l.id === lineId);
    if (!line) return;
    const idx = line.sounds.findIndex((s) => s.id === soundId);
    if (idx === -1) return;

    const sel = piece.selection;

    // No selection or different line: start a fresh single-tile selection.
    if (sel.lineId !== lineId || sel.soundIds.length === 0) {
      piece.selection = { lineId, anchorId: soundId, soundIds: [soundId] };
      m.redraw();
      return;
    }

    const anchorIdx = line.sounds.findIndex((s) => s.id === sel.anchorId);
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
    const ids = line.sounds.slice(lo, hi + 1).map((s) => s.id);
    piece.selection = { lineId, anchorId: sel.anchorId, soundIds: ids };
    m.redraw();
  },

  clearSelection() {
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    m.redraw();
  },

  toggleLineSelectMode() {
    piece.lineSelectMode = !piece.lineSelectMode;
    piece.lineSelection = [];
    if (piece.selectMode) {
      piece.selectMode = false;
      piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    }
    m.redraw();
  },

  /**
   * Add or remove an item ID from line selection.
   * @param {string} id - Line or heading ID
   */
  toggleLineSelection(id) {
    const idx = piece.lineSelection.indexOf(id);
    if (idx === -1) {
      piece.lineSelection.push(id);
    } else {
      piece.lineSelection.splice(idx, 1);
    }
    m.redraw();
  },

  clearLineSelection() {
    piece.lineSelectMode = false;
    piece.lineSelection = [];
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
    const [moved] = lines.splice(fromIndex, 1);
    lines.splice(toIndex, 0, moved);
    piece.lines = lines;

    // Remove the moved item from any group it belonged to
    for (const item of piece.lines) {
      if (item.type === 'block-repeat') {
        item.lineIds = item.lineIds.filter((id) => id !== moved.id);
      }
    }

    // Add to a group only if dropped between two existing members, or between
    // the last member and the block-repeat marker (skipping headings for adjacency)
    const pos = piece.lines.indexOf(moved);
    let prevIdx = pos - 1;
    while (
      prevIdx >= 0 &&
      (piece.lines[prevIdx].type === 'heading' || piece.lines[prevIdx].type === 'note')
    )
      prevIdx--;
    let nextIdx = pos + 1;
    while (
      nextIdx < piece.lines.length &&
      (piece.lines[nextIdx].type === 'heading' || piece.lines[nextIdx].type === 'note')
    )
      nextIdx++;
    const prev = prevIdx >= 0 ? piece.lines[prevIdx] : null;
    const next = nextIdx < piece.lines.length ? piece.lines[nextIdx] : null;

    if (prev) {
      for (const item of piece.lines) {
        if (item.type !== 'block-repeat') continue;
        if (!item.lineIds.includes(prev.id)) continue;
        if (next && (item.lineIds.includes(next.id) || next === item)) {
          item.lineIds.splice(item.lineIds.indexOf(prev.id) + 1, 0, moved.id);
          break;
        }
      }
    }

    // Drop groups that became empty after the move
    piece.lines = piece.lines.filter(
      (item) => item.type !== 'block-repeat' || item.lineIds.length > 0
    );

    history.push(piece._snapshot());
    m.redraw();
  },

  addHeading() {
    piece.lines.push(makeHeading());
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Updates the text of a section heading.
   * @param {string} headingId
   * @param {string} text
   */
  setHeadingText(headingId, text) {
    const heading = piece.lines.find((l) => l.id === headingId);
    if (!heading || heading.type !== 'heading') return;
    heading.text = text;
    history.push(piece._snapshot());
    m.redraw();
  },

  removeHeading(headingId) {
    piece.lines = piece.lines.filter((l) => l.id !== headingId);
    history.push(piece._snapshot());
    m.redraw();
  },

  addNote() {
    piece.lines.push(makeNote());
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Updates the text of a note.
   * @param {string} noteId
   * @param {string} text
   */
  setNoteText(noteId, text) {
    const note = piece.lines.find((l) => l.id === noteId);
    if (!note || note.type !== 'note') return;
    note.text = text;
    history.push(piece._snapshot());
    m.redraw();
  },

  removeNote(noteId) {
    piece.lines = piece.lines.filter((l) => l.id !== noteId);
    history.push(piece._snapshot());
    m.redraw();
  },

  addDivider() {
    piece.lines.push(makeDivider());
    history.push(piece._snapshot());
    m.redraw();
  },

  removeDivider(dividerId) {
    piece.lines = piece.lines.filter((l) => l.id !== dividerId);
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Removes the line. Selects the nearest remaining line when the removed line
   * was selected. Always ensures at least one line exists.
   * @param {string} lineId
   */
  removeLine(lineId) {
    const idx = piece.lines.findIndex((l) => l.id === lineId);
    piece.lines = piece.lines.filter((l) => l.id !== lineId);
    // Prune lineId from block-repeat markers; drop markers that become empty
    piece.lines = piece.lines.filter((item) => {
      if (item.type !== 'block-repeat') return true;
      item.lineIds = item.lineIds.filter((id) => id !== lineId);
      return item.lineIds.length > 0;
    });
    const realLines = piece.lines.filter(
      (l) =>
        l.type !== 'heading' &&
        l.type !== 'note' &&
        l.type !== 'divider' &&
        l.type !== 'block-repeat'
    );
    if (realLines.length === 0) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    } else if (piece.selectedLineId === lineId) {
      const candidates = piece.lines.filter(
        (l) =>
          l.type !== 'heading' &&
          l.type !== 'note' &&
          l.type !== 'divider' &&
          l.type !== 'block-repeat'
      );
      const nearIdx = Math.min(idx, candidates.length - 1);
      piece.selectedLineId = candidates[nearIdx >= 0 ? nearIdx : 0].id;
    }
    history.push(piece._snapshot());
    m.redraw();
  },

  // ── Bulk line operations ──────────────────────────────────────────────────

  /**
   * Deep-clones an item (line or heading) with fresh IDs throughout.
   * @param {Object} item - Line or heading object
   * @returns {Object} Cloned item
   */
  _cloneItem(item) {
    if (item.type === 'heading') return { ...item, id: uid() };
    if (item.type === 'note') return { ...item, id: uid() };
    if (item.type === 'divider') return { ...item, id: uid() };
    if (item.type === 'block-repeat') return { ...item, id: uid() };
    return {
      id: uid(),
      sounds: item.sounds.map((s) => ({ ...s, id: uid() })),
    };
  },

  /**
   * Duplicates all selected items in order and inserts them after the last selected item.
   */
  duplicateSelectedLines() {
    if (piece.lineSelection.length === 0) return;
    const selSet = new Set(piece.lineSelection);
    const toClone = piece.lines.filter((item) => selSet.has(item.id));
    if (toClone.length === 0) return;
    const lastIdx = piece.lines.findIndex((item) => item.id === toClone[toClone.length - 1].id);
    const clones = toClone.map((item) => piece._cloneItem(item));
    piece.lines.splice(lastIdx + 1, 0, ...clones);
    piece.lineSelection = clones.map((item) => item.id);
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Deletes all selected items. Ensures at least one real (non-heading) line remains.
   */
  deleteSelectedLines() {
    if (piece.lineSelection.length === 0) return;
    const selSet = new Set(piece.lineSelection);
    piece.lines = piece.lines.filter((item) => !selSet.has(item.id));
    // Remove lineIds from block-repeat markers that no longer exist; drop empty markers
    const remaining = new Set(piece.lines.map((item) => item.id));
    piece.lines = piece.lines.filter((item) => {
      if (item.type !== 'block-repeat') return true;
      item.lineIds = item.lineIds.filter((id) => remaining.has(id));
      return item.lineIds.length > 0;
    });
    piece.lineSelection = [];
    const realLines = piece.lines.filter(
      (item) =>
        item.type !== 'heading' &&
        item.type !== 'note' &&
        item.type !== 'divider' &&
        item.type !== 'block-repeat'
    );
    if (realLines.length === 0) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    }
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Inserts a block-repeat marker after the last selected item.
   * Lines in the selection are marked visually as a repeating block.
   * @param {number} n - Repeat count (≥ 2)
   */
  addBlockRepeat(n) {
    if (piece.lineSelection.length === 0 || !n || n < 2) return;
    const selSet = new Set(piece.lineSelection);
    // Collect selected IDs in array order, excluding any existing block-repeat items
    const lineIds = piece.lines
      .filter((item) => selSet.has(item.id) && item.type !== 'block-repeat')
      .map((item) => item.id);
    if (lineIds.length === 0) return;
    const lastId = lineIds[lineIds.length - 1];
    const lastIdx = piece.lines.findIndex((item) => item.id === lastId);
    piece.lines.splice(lastIdx + 1, 0, makeBlockRepeat(n, lineIds));
    piece.lineSelection = [];
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Updates the repeat count on a block-repeat marker.
   * @param {string} id - block-repeat item ID
   * @param {number} count
   */
  setBlockRepeatCount(id, count) {
    const item = piece.lines.find((l) => l.id === id);
    if (!item || item.type !== 'block-repeat') return;
    item.count = Math.max(2, Math.round(count) || 2);
    history.push(piece._snapshot());
    m.redraw();
  },

  /** @param {string} id - block-repeat item ID */
  removeBlockRepeat(id) {
    piece.lines = piece.lines.filter((l) => l.id !== id);
    history.push(piece._snapshot());
    m.redraw();
  },

  // ── Sounds ────────────────────────────────────────────────────────────────

  /**
   * Adds a sound to the line. If the line is full (beatsPerLine), overflows to the
   * next line with space, creating one if needed.
   * @param {string} lineId
   * @param {{ name: string, hand: string, duration: number }} symbol
   * @param {number} [atIndex] - Insert position within the line; appends if omitted.
   */
  addSound(lineId, symbol, atIndex) {
    const fromIdx = piece.lines.findIndex((l) => l.id === lineId);
    if (fromIdx === -1) return;
    const s = makeSound(symbol);
    const tIdx = targetLineIdx(fromIdx, s.duration);
    const target = piece.lines[tIdx];
    const insertAt = tIdx === fromIdx && atIndex != null ? atIndex : target.sounds.length;
    if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, s);
    else target.sounds.push(s);
    if (tIdx !== fromIdx) piece.selectedLineId = target.id;
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Moves a sound within or between lines. Rejects cross-line moves that would
   * overflow the target line's beat budget and calls m.redraw() to revert the
   * SortableJS DOM change in that case.
   * @param {string} fromLineId
   * @param {string} soundId
   * @param {string} toLineId
   * @param {number} toIndex
   */
  moveSound(fromLineId, soundId, toLineId, toIndex) {
    const fromLine = piece.lines.find((l) => l.id === fromLineId);
    const toLine = piece.lines.find((l) => l.id === toLineId);
    if (!fromLine || !toLine) return;
    const idx = fromLine.sounds.findIndex((s) => s.id === soundId);
    if (idx === -1) return;
    const sound = fromLine.sounds[idx];
    if (
      fromLineId !== toLineId &&
      piece.beatsPerLine > 0 &&
      lineDur(toLine) + sound.duration > piece.beatsPerLine * piece.time
    ) {
      m.redraw(); // revert SortableJS DOM change
      return;
    }
    fromLine.sounds.splice(idx, 1);
    toLine.sounds.splice(toIndex, 0, sound);
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Moves multiple sounds as a contiguous unit within or between lines.
   * @param {string} fromLineId
   * @param {string[]} soundIds - Must all exist in fromLine; their relative order is preserved.
   * @param {string} toLineId
   * @param {number} toIndex - Insertion point in the target line's data array.
   */
  moveSounds(fromLineId, soundIds, toLineId, toIndex) {
    const fromLine = piece.lines.find((l) => l.id === fromLineId);
    const toLine = piece.lines.find((l) => l.id === toLineId);
    if (!fromLine || !toLine) return;
    const idSet = new Set(soundIds);
    const sounds = fromLine.sounds.filter((s) => idSet.has(s.id));
    if (sounds.length !== soundIds.length) return;
    if (fromLineId !== toLineId && piece.beatsPerLine > 0) {
      const totalDur = sounds.reduce((sum, s) => sum + s.duration, 0);
      if (lineDur(toLine) + totalDur > piece.beatsPerLine * piece.time) {
        m.redraw();
        return;
      }
    }
    fromLine.sounds = fromLine.sounds.filter((s) => !idSet.has(s.id));
    toLine.sounds.splice(toIndex, 0, ...sounds);
    history.push(piece._snapshot());
    m.redraw();
  },

  removeSound(lineId, soundId) {
    const line = piece.lines.find((l) => l.id === lineId);
    if (!line) return;
    line.sounds = line.sounds.filter((s) => s.id !== soundId);
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Merges patch properties onto the matching sound object.
   * @param {string} lineId
   * @param {string} soundId
   * @param {Partial<{ hand: string, instruction: string }>} patch
   */
  updateSound(lineId, soundId, patch) {
    const line = piece.lines.find((l) => l.id === lineId);
    if (!line) return;
    const s = line.sounds.find((s) => s.id === soundId);
    if (!s) return;
    Object.assign(s, patch);
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) delete s[key];
    }
    history.push(piece._snapshot());
    m.redraw();
  },

  // ── Group tiles (pattern instances) ──────────────────────────────────────

  /**
   * Expands a pattern and adds its individual sounds to the score, distributing
   * them across lines from lineId when beatsPerLine is set.
   * @param {string} lineId
   * @param {{ sounds: Array<{ duration: number }> }} pattern
   */
  addGroup(lineId, pattern) {
    const fromIdx = piece.lines.findIndex((l) => l.id === lineId);
    if (fromIdx === -1) return;
    let lineIdx = fromIdx;
    for (const s of pattern.sounds) {
      lineIdx = targetLineIdx(lineIdx, s.duration);
      piece.lines[lineIdx].sounds.push({ ...s, id: uid() });
    }
    piece.selectedLineId = piece.lines[lineIdx].id;
    history.push(piece._snapshot());
    m.redraw();
  },
};

history.init(piece._snapshot());
