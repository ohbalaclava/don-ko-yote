import m from 'mithril';
import { history } from './history.js';
import { getSymbolSet, SYMBOL_SETS } from './symbolSets.js';

const uid = () => crypto.randomUUID();

/** Item `type` values that are not sound lines (structural rows / markers). */
const NON_SOUND_TYPES = new Set(['heading', 'note', 'divider', 'block-repeat', 'stack']);

/**
 * True when an item is a real sound line, i.e. not a heading, note, divider,
 * or block-repeat marker.
 * @param {{ type?: string }} item
 * @returns {boolean}
 */
export function isSoundLine(item) {
  return !NON_SOUND_TYPES.has(item.type);
}

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
 * Builds a map from line ID to its single-line block-repeat marker. Single-line
 * repeats render inline on the line itself rather than as a separate bar/row.
 * @param {Array<{ type?: string, lineIds?: string[] }>} lines - The piece's lines.
 * @returns {Map<string, object>}
 */
export function singleLineRepeatMap(lines) {
  return new Map(
    lines
      .filter((l) => l.type === 'block-repeat' && l.lineIds.length === 1)
      .map((m) => [m.lineIds[0], m])
  );
}

/**
 * Creates a new sound object from a palette symbol. Symbols with `alternatives`
 * default to the first alternative.
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
      ...(symbol.implicit && { implicit: true }),
      ...(symbol.volume != null && { volume: symbol.volume }),
    };
  }
  return {
    id: uid(),
    name: symbol.name,
    hand: symbol.hand,
    duration: symbol.duration,
    instruction: '',
    ...(symbol.implicit && { implicit: true }),
    ...(symbol.volume != null && { volume: symbol.volume }),
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

/** A single part (one taiko's row) inside a stack. Shaped like a sound line. */
function makeStackPart(taiko, sounds = []) {
  return { id: uid(), taiko, sounds };
}

/**
 * The id of the first editable sounds-holder in the piece — a sound line, or the
 * first part of the first stack. Used to pick a valid `selectedLineId` fallback,
 * counting stacks as content.
 * @returns {string|null}
 */
function firstHolderId() {
  for (const item of piece.lines) {
    if (isSoundLine(item)) return item.id;
    if (item.type === 'stack' && item.parts.length) return item.parts[0].id;
  }
  return null;
}

function lineDur(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Returns the index of the first line (starting from fromIdx) that can fit
 * `duration` divisions, without crossing a taiko boundary. Overflow stays within
 * the source line's resolved taiko: the forward scan stops at a taiko-bearing
 * heading or a stack, and skips any line that resolves to a different taiko. When
 * no existing line in the run has room, a fresh line is inserted at the boundary
 * (pinned to the source taiko if inheritance would resolve it differently).
 * When beatsPerLine is 0 (unlimited) or the item is too large to fit anywhere,
 * returns fromIdx unchanged.
 * @param {number} fromIdx - Starting line index.
 * @param {number} duration - Duration to accommodate, in divisions.
 * @returns {number} Index of the target line.
 */
function targetLineIdx(fromIdx, duration) {
  const max = piece.beatsPerLine * piece.time;
  if (!piece.beatsPerLine || duration > max) return fromIdx;
  const fromTaiko = piece.resolveTaiko(piece.lines[fromIdx]);
  let i = fromIdx;
  while (i < piece.lines.length) {
    const item = piece.lines[i];
    // A taiko-bearing heading or a stack ends the current taiko run.
    if (i > fromIdx && ((item.type === 'heading' && item.taiko) || item.type === 'stack')) break;
    if (
      isSoundLine(item) &&
      piece.resolveTaiko(item) === fromTaiko &&
      lineDur(item) + duration <= max
    ) {
      return i;
    }
    i++;
  }
  const line = makeLine();
  piece.lines.splice(i, 0, line);
  // Keep the overflow on the source taiko even when inheritance would differ.
  if (piece.resolveTaiko(line) !== fromTaiko) line.taiko = fromTaiko;
  return i;
}

/** True for the structural rows that are skipped when computing line adjacency. */
function isAdjacencySkipped(item) {
  return item.type === 'heading' || item.type === 'note';
}

/**
 * Re-evaluates block-repeat membership after `moved` has been relocated within
 * piece.lines. The moved line is first removed from every marker, then re-added
 * to a marker only when it now sits between two of that marker's members
 * (headings and notes are skipped when determining adjacency). Markers left with
 * no members are dropped.
 * @param {{ id: string }} moved
 */
function updateBlockRepeatMembership(moved) {
  // Remove the moved item from any block-repeat it belonged to.
  for (const item of piece.lines) {
    if (item.type === 'block-repeat') {
      item.lineIds = item.lineIds.filter((id) => id !== moved.id);
    }
  }

  // Find the nearest non-heading/note neighbours of the moved line.
  const pos = piece.lines.indexOf(moved);
  let prevIdx = pos - 1;
  while (prevIdx >= 0 && isAdjacencySkipped(piece.lines[prevIdx])) prevIdx--;
  let nextIdx = pos + 1;
  while (nextIdx < piece.lines.length && isAdjacencySkipped(piece.lines[nextIdx])) nextIdx++;
  const prev = prevIdx >= 0 ? piece.lines[prevIdx] : null;
  const next = nextIdx < piece.lines.length ? piece.lines[nextIdx] : null;

  // Re-add only when dropped between two existing members, or between the last
  // member and the block-repeat marker itself.
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

  // Drop markers that became empty.
  piece.lines = piece.lines.filter(
    (item) => item.type !== 'block-repeat' || item.lineIds.length > 0
  );
}

const _firstLine = makeLine();
const _defaultSet = SYMBOL_SETS[0];
const _defaultTaiko = _defaultSet.taiko[0].name;
const _defaultJiuchi = _defaultSet.jiuchis[0];

/**
 * Single source of truth for the scalar piece fields that are persisted (to
 * undo/redo snapshots, saved scores, autosave, and exported JSON). Maps each
 * field name to a function producing its fallback when a loaded source omits it.
 * `lines` is persisted too but handled separately because it needs group
 * expansion and selected-line fix-ups, which differ per loader.
 *
 * Add a new persisted scalar here and it flows through _snapshot, _restore,
 * loadFromData, and scoreStore's save/load/import automatically.
 */
const PERSISTED_FIELDS = {
  title: () => 'Untitled',
  taiko: () => piece.taiko,
  jiuchi: () => piece.jiuchi,
  beatsPerLine: () => piece.beatsPerLine,
  bpm: () => 120,
  author: () => '',
  version: () => '',
  icon: () => null,
  showVolume: () => false,
};

/** Reads the current persisted scalar fields into a plain object. */
function readPersistedFields() {
  const out = {};
  for (const key of Object.keys(PERSISTED_FIELDS)) out[key] = piece[key];
  return out;
}

/**
 * Assigns each persisted scalar field from `source`, falling back to the field's
 * default when the source omits it. Does not touch `lines`.
 * @param {object} source
 */
function applyPersistedFields(source) {
  for (const [key, makeDefault] of Object.entries(PERSISTED_FIELDS)) {
    piece[key] = source[key] ?? makeDefault();
  }
}

export const piece = {
  id: null,
  title: 'Untitled',
  taiko: _defaultTaiko,
  jiuchi: _defaultJiuchi,
  beatsPerLine: 8,
  bpm: 120,
  author: '',
  version: '',
  icon: null,
  showVolume: false,
  lines: [_firstLine],
  selectedLineId: _firstLine.id,

  /**
   * Resolves a sound-line's effective taiko: its own `taiko` override, else the
   * nearest preceding taiko-bearing heading, else the score-wide `piece.taiko`.
   * Plain scores set none of these, so every line resolves to `piece.taiko`.
   * @param {{ id?: string, taiko?: string } | null} line
   * @returns {string}
   */
  resolveTaiko(line) {
    if (line?.taiko) return line.taiko;
    const idx = line ? this.lines.indexOf(line) : -1;
    if (idx >= 0) {
      for (let i = idx - 1; i >= 0; i--) {
        const it = this.lines[i];
        if (it.type === 'heading' && it.taiko) return it.taiko;
      }
    }
    return this.taiko;
  },

  /**
   * Resolves the sounds-holder for an id, which may be a top-level sound line or a
   * part nested in a stack. Both shapes expose `{ id, sounds }`, so all the sound
   * mutators operate on the returned `holder` uniformly.
   * @param {string} id
   * @returns {{ holder: { id: string, sounds: Array }, isPart: boolean, stack: object|null } | null}
   */
  _holder(id) {
    for (const item of this.lines) {
      if (isSoundLine(item) && item.id === id) return { holder: item, isPart: false, stack: null };
      if (item.type === 'stack') {
        const part = item.parts.find((p) => p.id === id);
        if (part) return { holder: part, isPart: true, stack: item };
      }
    }
    return null;
  },

  /** The symbol set for a specific line/part, from its resolved taiko + the score jiuchi. */
  symbolSetForLine(line) {
    return getSymbolSet(this.resolveTaiko(line), this.jiuchi) ?? _defaultSet;
  },

  /** Number of skins (1 or 2) on a specific line's resolved taiko. */
  skinsFor(line) {
    const t = this.resolveTaiko(line);
    return this.symbolSetForLine(line).taiko.find((x) => x.name === t)?.skins ?? 1;
  },

  /** The selected sounds-holder (line or stack part), or null when none is selected. */
  get _selectedLine() {
    return this._holder(this.selectedLineId)?.holder ?? null;
  },

  /**
   * Active symbol set for the editing context — the selected line's set (so the
   * palette and tiles follow the line being edited), falling back to the score
   * default when no line is selected.
   */
  get symbolSet() {
    const line = this._selectedLine;
    return line
      ? this.symbolSetForLine(line)
      : (getSymbolSet(this.taiko, this.jiuchi) ?? _defaultSet);
  },

  /** Number of beat divisions for the active symbol set (e.g. 4 straight, 3 swing). */
  get time() {
    return this.symbolSet.time;
  },

  /** Number of skins on the selected line's taiko (1 or 2). */
  get skins() {
    const line = this._selectedLine;
    return line
      ? this.skinsFor(line)
      : (this.symbolSet.taiko.find((t) => t.name === this.taiko)?.skins ?? 1);
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

  /** Clears all transient UI state (editing tile, tile/line select modes). */
  _resetTransientState() {
    piece.editingTile = null;
    piece.selectMode = false;
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    piece.lineSelectMode = false;
    piece.lineSelection = [];
  },

  _snapshot() {
    return { ...readPersistedFields(), lines: piece.lines };
  },

  /** Pushes the current state onto the undo history and triggers a redraw. */
  _commit() {
    history.push(piece._snapshot());
    m.redraw();
  },

  /**
   * Loads persisted scalar fields from an external source (saved score, autosave,
   * imported JSON) and clears transient UI state. The caller is responsible for
   * setting `lines` (with any group-expansion) and `selectedLineId`.
   * @param {object} source
   */
  loadFromData(source) {
    applyPersistedFields(source);
    piece._resetTransientState();
  },

  /**
   * Applies a history snapshot to the piece and resets all transient UI state
   * (editing tile, select mode). Corrects selectedLineId if it no longer exists.
   * @param {object} state - A snapshot produced by _snapshot().
   */
  _restore(state) {
    applyPersistedFields(state);
    piece.lines = state.lines;
    piece._resetTransientState();
    // selectedLineId may name a line or a stack part; fall back to the first holder.
    if (!piece._holder(piece.selectedLineId)) {
      piece.selectedLineId = firstHolderId();
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
    piece.version = '';
    piece.icon = opts.icon ?? null;
    piece.showVolume = opts.showVolume ?? false;
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece._resetTransientState();
    history.reset(piece._snapshot());
    m.redraw();
  },

  clearLines() {
    const line = makeLine();
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece._resetTransientState();
    piece._commit();
  },

  setTitle(v) {
    piece.title = v;
    piece._commit();
  },
  setTaiko(v) {
    piece.taiko = v;
    piece._commit();
  },
  setJiuchi(v) {
    piece.jiuchi = v;
    piece._commit();
  },
  /**
   * Sets (or clears, with null) a per-section taiko override on a heading. Lines
   * under the heading inherit it until the next taiko-bearing heading.
   * @param {string} headingId
   * @param {string|null} taiko
   */
  setHeadingTaiko(headingId, taiko) {
    const h = piece.lines.find((l) => l.id === headingId);
    if (!h || h.type !== 'heading') return;
    if (taiko == null) delete h.taiko;
    else h.taiko = taiko;
    piece._commit();
  },
  /**
   * Sets (or clears, with null) a per-line taiko override on a sound line.
   * @param {string} lineId
   * @param {string|null} taiko
   */
  setLineTaiko(lineId, taiko) {
    const l = piece.lines.find((l) => l.id === lineId);
    if (!l || !isSoundLine(l)) return;
    if (taiko == null) delete l.taiko;
    else l.taiko = taiko;
    piece._commit();
  },
  setBeatsPerLine(v) {
    piece.beatsPerLine = Number(v);
    piece._commit();
  },
  setBpm(v) {
    piece.bpm = Number(v);
    piece._commit();
  },
  setAuthor(v) {
    piece.author = v;
    piece._commit();
  },
  setVersion(v) {
    piece.version = v;
    piece._commit();
  },
  setIcon(dataUrl) {
    piece.icon = dataUrl;
    piece._commit();
  },
  setShowVolume(v) {
    piece.showVolume = v;
    piece._commit();
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
    piece._commit();
  },

  reorderLine(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const lines = piece.lines.slice();
    const [moved] = lines.splice(fromIndex, 1);
    lines.splice(toIndex, 0, moved);
    piece.lines = lines;
    updateBlockRepeatMembership(moved);
    piece._commit();
  },

  addHeading() {
    piece.lines.push(makeHeading());
    piece._commit();
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
    piece._commit();
  },

  removeHeading(headingId) {
    piece.lines = piece.lines.filter((l) => l.id !== headingId);
    piece._commit();
  },

  addNote() {
    piece.lines.push(makeNote());
    piece._commit();
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
    piece._commit();
  },

  removeNote(noteId) {
    piece.lines = piece.lines.filter((l) => l.id !== noteId);
    piece._commit();
  },

  addDivider() {
    piece.lines.push(makeDivider());
    piece._commit();
  },

  removeDivider(dividerId) {
    piece.lines = piece.lines.filter((l) => l.id !== dividerId);
    piece._commit();
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
    const realLines = piece.lines.filter(isSoundLine);
    // A stack counts as content, so only inject an empty line when nothing is left.
    if (firstHolderId() == null) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    } else if (piece.selectedLineId === lineId) {
      if (realLines.length) {
        const nearIdx = Math.min(idx, realLines.length - 1);
        piece.selectedLineId = realLines[nearIdx >= 0 ? nearIdx : 0].id;
      } else {
        piece.selectedLineId = firstHolderId();
      }
    }
    piece._commit();
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
    if (item.type === 'stack') {
      return {
        ...item,
        id: uid(),
        parts: item.parts.map((p) => ({
          ...p,
          id: uid(),
          sounds: p.sounds.map((s) => ({ ...s, id: uid() })),
        })),
      };
    }
    return {
      ...item,
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
    piece._commit();
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
    // A stack counts as content, so only inject an empty line when nothing is left.
    if (firstHolderId() == null) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    }
    piece._commit();
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
    piece._commit();
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
    piece._commit();
  },

  /** @param {string} id - block-repeat item ID */
  removeBlockRepeat(id) {
    piece.lines = piece.lines.filter((l) => l.id !== id);
    piece._commit();
  },

  // ── Stacks (simultaneous parts) ────────────────────────────────────────────

  /**
   * Folds the selected sound lines into a single stack item that plays its parts
   * simultaneously. Each line becomes a part keyed by its existing id (so editing/
   * selection references stay valid), tagged with the line's resolved taiko. The
   * stack is inserted at the position of the first folded line; needs ≥2 lines.
   */
  addStack() {
    const selSet = new Set(piece.lineSelection);
    const selLines = piece.lines.filter((item) => selSet.has(item.id) && isSoundLine(item));
    if (selLines.length < 2) return;
    const foldSet = new Set(selLines.map((l) => l.id));
    const stack = {
      id: uid(),
      type: 'stack',
      parts: selLines.map((l) => ({ id: l.id, taiko: piece.resolveTaiko(l), sounds: l.sounds })),
    };
    // Rebuild lines: drop the folded lines, drop the stack in at the first one's slot.
    const newLines = [];
    let inserted = false;
    for (const item of piece.lines) {
      if (foldSet.has(item.id)) {
        if (!inserted) {
          newLines.push(stack);
          inserted = true;
        }
      } else {
        newLines.push(item);
      }
    }
    piece.lines = newLines;
    // Prune folded ids from block-repeat markers (they're now parts, not lines).
    piece.lines = piece.lines.filter((item) => {
      if (item.type !== 'block-repeat') return true;
      item.lineIds = item.lineIds.filter((id) => !foldSet.has(id));
      return item.lineIds.length > 0;
    });
    piece.lineSelection = [];
    piece.lineSelectMode = false;
    piece.selectedLineId = stack.parts[0].id;
    piece._commit();
  },

  /**
   * Expands a stack back into individual sound lines, one per part (each keeps its
   * taiko as a per-line override). Replaces the stack in place.
   * @param {string} stackId
   */
  breakStack(stackId) {
    const idx = piece.lines.findIndex((l) => l.id === stackId && l.type === 'stack');
    if (idx === -1) return;
    const stack = piece.lines[idx];
    const lines = stack.parts.map((p) => ({
      id: p.id,
      sounds: p.sounds,
      ...(p.taiko ? { taiko: p.taiko } : {}),
    }));
    piece.lines.splice(idx, 1, ...lines);
    piece.selectedLineId = lines[0]?.id ?? firstHolderId();
    piece._commit();
  },

  /**
   * Adds a new empty part (defaulting to the score taiko) to a stack.
   * @param {string} stackId
   */
  addPart(stackId) {
    const stack = piece.lines.find((l) => l.id === stackId && l.type === 'stack');
    if (!stack) return;
    const part = makeStackPart(piece.taiko);
    stack.parts.push(part);
    piece.selectedLineId = part.id;
    piece._commit();
  },

  /**
   * Removes a part from a stack. A stack with one or zero remaining parts is
   * dissolved back into plain lines.
   * @param {string} stackId
   * @param {string} partId
   */
  removePart(stackId, partId) {
    const stack = piece.lines.find((l) => l.id === stackId && l.type === 'stack');
    if (!stack) return;
    stack.parts = stack.parts.filter((p) => p.id !== partId);
    if (stack.parts.length <= 1) {
      piece.breakStack(stackId); // breakStack commits
      return;
    }
    piece._commit();
  },

  /**
   * Sets the taiko of a stack part.
   * @param {string} stackId
   * @param {string} partId
   * @param {string} taiko
   */
  setPartTaiko(stackId, partId, taiko) {
    const stack = piece.lines.find((l) => l.id === stackId && l.type === 'stack');
    const part = stack?.parts.find((p) => p.id === partId);
    if (!part) return;
    part.taiko = taiko;
    piece._commit();
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
    const h = piece._holder(lineId);
    // A stack part is a single wrapping row: no cross-line overflow, just insert.
    if (h?.isPart) {
      const s = makeSound(symbol);
      if (atIndex != null) h.holder.sounds.splice(atIndex, 0, s);
      else h.holder.sounds.push(s);
      piece._commit();
      return;
    }
    const fromIdx = piece.lines.findIndex((l) => l.id === lineId);
    if (fromIdx === -1) return;
    const s = makeSound(symbol);
    const tIdx = targetLineIdx(fromIdx, s.duration);
    const target = piece.lines[tIdx];
    const insertAt = tIdx === fromIdx && atIndex != null ? atIndex : target.sounds.length;
    if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, s);
    else target.sounds.push(s);
    if (tIdx !== fromIdx) piece.selectedLineId = target.id;
    piece._commit();
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
    const from = piece._holder(fromLineId);
    const to = piece._holder(toLineId);
    if (!from || !to) return;
    const fromLine = from.holder;
    const toLine = to.holder;
    const idx = fromLine.sounds.findIndex((s) => s.id === soundId);
    if (idx === -1) return;
    const sound = fromLine.sounds[idx];
    if (
      fromLineId !== toLineId &&
      !to.isPart && // parts wrap freely — no per-row beat budget
      piece.beatsPerLine > 0 &&
      lineDur(toLine) + sound.duration > piece.beatsPerLine * piece.time
    ) {
      // Overflow: reject the move. The dragged node was already reverted in the
      // Sortable onEnd handler, so a redraw repaints the unchanged line.
      m.redraw();
      return;
    }
    fromLine.sounds.splice(idx, 1);
    toLine.sounds.splice(toIndex, 0, sound);
    piece._commit();
  },

  /**
   * Moves multiple sounds as a contiguous unit within or between lines.
   * @param {string} fromLineId
   * @param {string[]} soundIds - Must all exist in fromLine; their relative order is preserved.
   * @param {string} toLineId
   * @param {number} toIndex - Insertion point in the target line's data array.
   */
  moveSounds(fromLineId, soundIds, toLineId, toIndex) {
    const from = piece._holder(fromLineId);
    const to = piece._holder(toLineId);
    if (!from || !to) return;
    const fromLine = from.holder;
    const toLine = to.holder;
    const idSet = new Set(soundIds);
    const sounds = fromLine.sounds.filter((s) => idSet.has(s.id));
    if (sounds.length !== soundIds.length) return;
    if (fromLineId !== toLineId && !to.isPart && piece.beatsPerLine > 0) {
      const totalDur = sounds.reduce((sum, s) => sum + s.duration, 0);
      if (lineDur(toLine) + totalDur > piece.beatsPerLine * piece.time) {
        // Overflow: reject the move. The dragged node was already reverted in the
        // Sortable onEnd handler, so a redraw repaints the unchanged line.
        m.redraw();
        return;
      }
    }
    fromLine.sounds = fromLine.sounds.filter((s) => !idSet.has(s.id));
    toLine.sounds.splice(toIndex, 0, ...sounds);
    piece._commit();
  },

  removeSound(lineId, soundId) {
    const line = piece._holder(lineId)?.holder;
    if (!line) return;
    line.sounds = line.sounds.filter((s) => s.id !== soundId);
    piece._commit();
  },

  /**
   * Merges patch properties onto the matching sound object.
   * @param {string} lineId
   * @param {string} soundId
   * @param {Partial<{ hand: string, instruction: string }>} patch
   */
  updateSound(lineId, soundId, patch) {
    const line = piece._holder(lineId)?.holder;
    if (!line) return;
    const s = line.sounds.find((s) => s.id === soundId);
    if (!s) return;
    Object.assign(s, patch);
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) delete s[key];
    }
    piece._commit();
  },

  // ── Group tiles (pattern instances) ──────────────────────────────────────

  /**
   * Expands a pattern and adds its individual sounds to the score, distributing
   * them across lines from lineId when beatsPerLine is set.
   * @param {string} lineId
   * @param {{ sounds: Array<{ duration: number }> }} pattern
   */
  addGroup(lineId, pattern, atIndex) {
    const h = piece._holder(lineId);
    // A stack part doesn't overflow: insert all the pattern's sounds in place.
    if (h?.isPart) {
      let insertAt = atIndex;
      for (const s of pattern.sounds) {
        if (insertAt != null) {
          h.holder.sounds.splice(insertAt, 0, { ...s, id: uid() });
          insertAt++;
        } else {
          h.holder.sounds.push({ ...s, id: uid() });
        }
      }
      piece._commit();
      return;
    }
    const fromIdx = piece.lines.findIndex((l) => l.id === lineId);
    if (fromIdx === -1) return;
    let lineIdx = fromIdx;
    let insertAt = atIndex;
    for (const s of pattern.sounds) {
      lineIdx = targetLineIdx(lineIdx, s.duration);
      if (lineIdx === fromIdx && insertAt != null) {
        piece.lines[lineIdx].sounds.splice(insertAt, 0, { ...s, id: uid() });
        insertAt++;
      } else {
        piece.lines[lineIdx].sounds.push({ ...s, id: uid() });
      }
    }
    piece.selectedLineId = piece.lines[lineIdx].id;
    piece._commit();
  },
};

history.init(piece._snapshot());
