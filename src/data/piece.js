import m from 'mithril';
import { history } from './history.js';
import { anim } from '../anim.js';
import { getSymbolSet, symbolSetForTaiko, SYMBOL_SETS } from './symbolSets.js';
import { uid } from '../uid.js';

/** Item `type` values that are not sound lines (structural rows / markers). */
const NON_SOUND_TYPES = new Set(['heading', 'note', 'divider', 'block-repeat', 'jiuchi-section']);

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
      ...(symbol.silent && { silent: true }),
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
    ...(symbol.silent && { silent: true }),
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

function makeJiuchiSection(taiko) {
  return { id: uid(), type: 'jiuchi-section', taiko };
}

/**
 * Inserts one or more items into piece.lines immediately after the currently
 * selected line, or appends them when there is no valid selection. The add-row
 * toolbar sits after the selected line, so new rows land where the user is working.
 * @param {...object} items
 */
function insertAfterSelected(...items) {
  const idx = piece.lines.findIndex((l) => l.id === piece.selectedLineId);
  if (idx >= 0) piece.lines.splice(idx + 1, 0, ...items);
  else piece.lines.push(...items);
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
    if (isSoundLine(item) && lineDur(item) + duration <= max) return i;
    i++;
  }
  piece.lines.push(makeLine());
  return piece.lines.length - 1;
}

/** True for the structural rows that are skipped when computing line adjacency. */
function isAdjacencySkipped(item) {
  return item.type === 'heading' || item.type === 'note' || item.type === 'jiuchi-section';
}

/**
 * Maps each jiuchi-section definition line id to its section's taiko. A jiuchi
 * section's definition runs from its marker up to (but not including) the next
 * heading, divider, or jiuchi-section marker. Only sound lines are mapped (the
 * markers and structural rows in between are irrelevant to callers).
 * @param {Array<object>} lines - The piece's lines array.
 * @returns {Map<string, string>} line id → section taiko.
 */
export function jiuchiLineMap(lines) {
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'jiuchi-section') continue;
    const taiko = lines[i].taiko;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].type;
      if (t === 'heading' || t === 'divider' || t === 'jiuchi-section') break;
      if (isSoundLine(lines[j])) map.set(lines[j].id, taiko);
    }
  }
  return map;
}

/**
 * Returns the `[start, end]` index span (inclusive) of the whole jiuchi section
 * that begins at `markerIdx`: the marker, its definition rows, and the closing
 * divider that bounds it. Walking forward from the marker, sound/note rows extend
 * the span; the first divider is included and ends it (the section's footer); a
 * heading or another jiuchi-section ends it exclusively. Dragging the marker moves
 * this whole span as one unit so the section stays intact.
 * @param {Array<object>} lines
 * @param {number} markerIdx - Index of a jiuchi-section marker.
 * @returns {[number, number]}
 */
export function jiuchiSectionSpan(lines, markerIdx) {
  let end = markerIdx;
  for (let j = markerIdx + 1; j < lines.length; j++) {
    const t = lines[j].type;
    if (t === 'heading' || t === 'jiuchi-section') break;
    end = j;
    if (t === 'divider') break;
  }
  return [markerIdx, end];
}

/**
 * True when the given divider closes a jiuchi section's definition — i.e. the
 * nearest preceding structural row (skipping the definition's own sound/note rows)
 * is a jiuchi-section marker. Such dividers share the jiuchi green styling so the
 * definition block reads as one unit.
 * @param {Array<object>} lines - The piece's lines array.
 * @param {string} dividerId
 * @returns {boolean}
 */
export function isJiuchiCloseDivider(lines, dividerId) {
  const i = lines.findIndex((l) => l.id === dividerId);
  if (i < 0 || lines[i].type !== 'divider') return false;
  for (let j = i - 1; j >= 0; j--) {
    const t = lines[j].type;
    if (t === 'jiuchi-section') return true;
    if (t === 'heading' || t === 'divider') return false;
  }
  return false;
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

/**
 * Finds the sound line that differs between two `lines` arrays — used to follow a
 * change with the selection after undo/redo. Prefers a line whose content changed,
 * then a line newly present in `newLines` (e.g. redo of an add), then the line
 * nearest a removal. Only sound lines are considered (selectedLineId tracks a
 * sound line); returns null when no sound line changed.
 * @param {Array<object>} oldLines
 * @param {Array<object>} newLines
 * @returns {string|null} id of the changed sound line, or null.
 */
function changedSoundLineId(oldLines, newLines) {
  const oldSound = oldLines.filter(isSoundLine);
  const newSound = newLines.filter(isSoundLine);
  const oldById = new Map(oldSound.map((l) => [l.id, l]));
  const newById = new Map(newSound.map((l) => [l.id, l]));
  for (const l of newSound) {
    const o = oldById.get(l.id);
    if (o && JSON.stringify(o) !== JSON.stringify(l)) return l.id;
  }
  for (const l of newSound) if (!oldById.has(l.id)) return l.id;
  for (let i = 0; i < oldSound.length; i++) {
    if (!newById.has(oldSound[i].id)) {
      return newSound[Math.min(i, newSound.length - 1)]?.id ?? null;
    }
  }
  return null;
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
  // Metronome config is stored per-score (not global), so it travels with the
  // score through save/load/export and undo snapshots.
  metronome: () => false,
  metronomeHeadOnly: () => true,
  metronomeEmphasiseHead: () => true,
  metronomeJiuchi: () => 'auto',
  metronomeShime: () => false,
  metronomeVolume: () => 1,
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
  metronome: false,
  metronomeHeadOnly: true,
  metronomeEmphasiseHead: true,
  metronomeJiuchi: 'auto',
  metronomeShime: false,
  metronomeVolume: 1,
  lines: [_firstLine],
  selectedLineId: _firstLine.id,

  /** Active symbol set, resolved lazily from (taiko, jiuchi). */
  get symbolSet() {
    return getSymbolSet(this.taiko, this.jiuchi) ?? _defaultSet;
  },

  /**
   * The symbol set to author with for the currently selected line: a jiuchi
   * section's taiko set when the selected line belongs to one, else the score's
   * own symbol set. The straight/swing `time` is unchanged either way.
   */
  get activeSymbolSet() {
    const taiko = jiuchiLineMap(this.lines).get(this.selectedLineId);
    if (taiko && taiko !== this.taiko) {
      return symbolSetForTaiko(taiko, this.time) ?? this.symbolSet;
    }
    return this.symbolSet;
  },

  /**
   * The taiko a line should sound with: its jiuchi section's taiko when the line
   * is part of a section definition, else the score's taiko.
   * @param {string} lineId
   * @returns {string}
   */
  taikoForLine(lineId) {
    return jiuchiLineMap(this.lines).get(lineId) ?? this.taiko;
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

  /**
   * Pushes the current state onto the undo history and triggers a redraw.
   * Diffs the lines against the previous baseline so added/removed tiles and
   * rows animate. Pass `{ animate: false }` for wholesale replacements (e.g.
   * clear) where animating every tile would just be noise.
   * @param {{ animate?: boolean }} [opts]
   */
  _commit(opts) {
    anim.sync(piece.lines, { animate: opts?.animate ?? true });
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
    const prevLines = piece.lines;
    applyPersistedFields(state);
    piece.lines = state.lines;
    anim.sync(piece.lines, { animate: true }); // animate undo/redo add/remove
    piece._resetTransientState();
    // Follow the change: select the sound line the undo/redo altered.
    const changed = changedSoundLineId(prevLines, state.lines);
    if (changed) piece.selectedLineId = changed;
    if (!piece.lines.find((l) => l.id === piece.selectedLineId)) {
      piece.selectedLineId = piece.lines.find(isSoundLine)?.id ?? null;
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
    piece.metronome = false;
    piece.metronomeHeadOnly = true;
    piece.metronomeEmphasiseHead = true;
    piece.metronomeJiuchi = 'auto';
    piece.metronomeShime = false;
    piece.metronomeVolume = 1;
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece._resetTransientState();
    anim.sync(piece.lines, { animate: false });
    history.reset(piece._snapshot());
    m.redraw();
  },

  clearLines() {
    const line = makeLine();
    piece.lines = [line];
    piece.selectedLineId = line.id;
    piece._resetTransientState();
    piece._commit({ animate: false }); // wholesale reset — don't flash every old tile out
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
  /**
   * Updates one per-score metronome field and commits (so it autosaves and is
   * saved with the score). Used for the discrete toggles and the jiuchi selector.
   * @param {'metronome'|'metronomeHeadOnly'|'metronomeEmphasiseHead'|'metronomeJiuchi'|'metronomeShime'|'metronomeVolume'} key
   * @param {boolean|string|number} value
   */
  setMetronome(key, value) {
    piece[key] = value;
    piece._commit();
  },
  /** Live (non-committing) metronome-volume update for slider drags; commit on release via setMetronome. */
  setMetronomeVolumeLive(v) {
    piece.metronomeVolume = v;
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
    insertAfterSelected(line);
    piece.selectedLineId = line.id;
    piece._commit();
  },

  reorderLine(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    // Dragging a jiuchi-section marker moves the whole section (marker, definition
    // rows, and closing divider) as one block so it stays intact.
    if (piece.lines[fromIndex]?.type === 'jiuchi-section') {
      piece._reorderJiuchiSection(fromIndex, toIndex);
      return;
    }
    const lines = piece.lines.slice();
    const [moved] = lines.splice(fromIndex, 1);
    lines.splice(toIndex, 0, moved);
    piece.lines = lines;
    updateBlockRepeatMembership(moved);
    piece._commit();
  },

  /**
   * Moves a whole jiuchi section so its marker lands at the single-element drop
   * index `toIndex` reported by the drag. The block spans the marker through its
   * closing divider (see jiuchiSectionSpan).
   * @param {number} fromIndex - Marker index.
   * @param {number} toIndex - Drop index in single-element terms.
   */
  _reorderJiuchiSection(fromIndex, toIndex) {
    const [start, end] = jiuchiSectionSpan(piece.lines, fromIndex);
    const blockLen = end - start + 1;
    const lines = piece.lines.slice();
    const block = lines.splice(start, blockLen);
    // When dropping below the block, toIndex was measured with one element removed;
    // shift it back by the rest of the block so the marker lands where intended.
    let insertAt = toIndex <= start ? toIndex : toIndex - (blockLen - 1);
    insertAt = Math.max(0, Math.min(insertAt, lines.length));
    lines.splice(insertAt, 0, ...block);
    piece.lines = lines;
    piece._commit();
  },

  addHeading() {
    insertAfterSelected(makeHeading());
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
    insertAfterSelected(makeNote());
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
    insertAfterSelected(makeDivider());
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
    if (realLines.length === 0) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    } else if (piece.selectedLineId === lineId) {
      const nearIdx = Math.min(idx, realLines.length - 1);
      piece.selectedLineId = realLines[nearIdx >= 0 ? nearIdx : 0].id;
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
    const realLines = piece.lines.filter(isSoundLine);
    if (realLines.length === 0) {
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

  // ── Jiuchi sections ───────────────────────────────────────────────────────

  /**
   * Inserts a jiuchi-section marker, one empty definition line, and a closing
   * divider after the selected line, then selects the definition line so the base
   * rhythm is immediately authorable. The marker + definition line (up to the
   * divider) define a loop played as the base rhythm under the following score.
   * The divider bounds the definition so that, when inserted mid-score, the lines
   * after it stay part of the melody (and become what the jiuchi underlays) rather
   * than being swallowed into the definition. The taiko defaults to the score's
   * taiko (always valid at the score's straight/swing time).
   *
   * Adding a section also switches the metronome jiuchi to 'inline' so the new
   * base rhythm plays; this is a default, not a lock — the user can change it back.
   */
  addJiuchiSection() {
    const line = makeLine();
    insertAfterSelected(makeJiuchiSection(piece.taiko), line, makeDivider());
    piece.selectedLineId = line.id;
    piece.metronomeJiuchi = 'inline'; // captured by the _commit snapshot below
    piece._commit();
  },

  /**
   * Changes a jiuchi section's taiko. Its definition lines re-author and replay
   * with the new taiko's symbol set and voice.
   * @param {string} id - jiuchi-section marker id
   * @param {string} taiko
   */
  setJiuchiSectionTaiko(id, taiko) {
    const marker = piece.lines.find((l) => l.id === id);
    if (!marker || marker.type !== 'jiuchi-section') return;
    marker.taiko = taiko;
    piece._commit();
  },

  /**
   * Removes a jiuchi-section marker. Its former definition lines stay in place and
   * revert to ordinary score lines.
   * @param {string} id - jiuchi-section marker id
   */
  removeJiuchiSection(id) {
    piece.lines = piece.lines.filter((l) => l.id !== id);
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
    const fromIdx = piece.lines.findIndex((l) => l.id === lineId);
    if (fromIdx === -1) return;
    const s = makeSound(symbol);
    const tIdx = targetLineIdx(fromIdx, s.duration);
    const target = piece.lines[tIdx];
    const insertAt = tIdx === fromIdx && atIndex != null ? atIndex : target.sounds.length;
    if (tIdx === fromIdx && atIndex != null) target.sounds.splice(atIndex, 0, s);
    else target.sounds.push(s);
    piece.selectedLineId = target.id;
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
      // Overflow: reject the move. The dragged node was already reverted in the
      // Sortable onEnd handler, so a redraw repaints the unchanged line.
      m.redraw();
      return;
    }
    fromLine.sounds.splice(idx, 1);
    toLine.sounds.splice(toIndex, 0, sound);
    piece.selectedLineId = toLineId;
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
    const fromLine = piece.lines.find((l) => l.id === fromLineId);
    const toLine = piece.lines.find((l) => l.id === toLineId);
    if (!fromLine || !toLine) return;
    const idSet = new Set(soundIds);
    const sounds = fromLine.sounds.filter((s) => idSet.has(s.id));
    if (sounds.length !== soundIds.length) return;
    if (fromLineId !== toLineId && piece.beatsPerLine > 0) {
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
    piece.selectedLineId = toLineId;
    piece._commit();
  },

  removeSound(lineId, soundId) {
    const line = piece.lines.find((l) => l.id === lineId);
    if (!line) return;
    line.sounds = line.sounds.filter((s) => s.id !== soundId);
    piece.selectedLineId = lineId;
    piece._commit();
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

anim.sync(piece.lines, { animate: false }); // seed the baseline at boot
history.init(piece._snapshot());
