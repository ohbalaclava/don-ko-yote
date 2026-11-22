import m from 'mithril';
import { history } from './history.js';
import { anim } from '../anim.js';
import { getSymbolSet, symbolSetForTaiko, SYMBOL_SETS } from './symbolSets.js';
import {
  alignDiv,
  setBlankSpans,
  setConflicts,
  setCursor,
  setLanes,
  restsForGap,
  setIdForLane as laneSetId,
} from './sets.js';
import { uid } from '../uid.js';

/**
 * Score data format. 1 = pre-3.0 (flat `lines` of `{ id, sounds }`); 2 = parts
 * with systems of lanes. Stamped on every snapshot; `migrateScore` reads it.
 */
export const FORMAT = 2;

/** Upper bound on the part count a new ensemble score can be created with. */
export const MAX_NEW_PARTS = 8;

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

/**
 * Creates a part: one drum played by one person, drawn as one lane in every
 * system. `name` falls back to the taiko name in the UI; `setId` links the part
 * to a taiko set (a player holding several drums) when non-null.
 * @param {{ name?: string, taiko?: string, setId?: string|null, volume?: number, muted?: boolean }} [opts]
 */
export function makePart(opts = {}) {
  return {
    id: uid(),
    name: opts.name ?? '',
    taiko: opts.taiko ?? _defaultTaiko,
    setId: opts.setId ?? null,
    volume: opts.volume ?? 1,
    muted: opts.muted ?? false,
  };
}

/**
 * Creates a taiko set: a named group of parts played by one person, drawn with a
 * bracket linking their lanes.
 * @param {string} name
 */
export function makeSet(name) {
  return { id: uid(), name: name ?? '' };
}

/**
 * Creates a lane: one part's sounds within one system. A lane is exactly what a
 * sound line used to be, plus the part it belongs to. `partId` is null for a
 * jiuchi-section definition lane, which takes its drum from the section marker.
 * @param {string|null} partId
 */
export function makeLane(partId = null) {
  return { id: uid(), partId: partId ?? null, sounds: [] };
}

/**
 * Creates a system: one score row holding one lane per part, in `piece.parts`
 * order. A system carries no `type`, so every structural helper (isSoundLine,
 * block-repeat membership, the jiuchi-section scan, the Sortable index mapping)
 * treats it exactly as it treated a sound line.
 * @param {Array<string|null>} partIds - Part ids, in order. Empty → one part-less lane.
 */
export function makeSystem(partIds = [null]) {
  const ids = partIds.length ? partIds : [null];
  return { id: uid(), lanes: ids.map((partId) => makeLane(partId)) };
}

/**
 * The lanes of a sound row. Tolerates a pre-3.0 row (`{ id, sounds }`) by
 * presenting it as one part-less lane, so pure readers (sequence, pdf, anim) and
 * older test fixtures work on un-migrated data.
 * @param {{ id: string, lanes?: object[], sounds?: object[] }} row
 * @returns {Array<{ id: string, partId: string|null, sounds: object[] }>}
 */
export function lanesOf(row) {
  return row.lanes ?? [{ id: row.id, partId: null, sounds: row.sounds ?? [] }];
}

/**
 * The lane a part owns in `row`. A single-lane row serves any part when either
 * side is part-less, which is what keeps a solo score (and a jiuchi definition
 * row) behaving exactly as it did before parts existed.
 * @param {object} row
 * @param {string|null} partId
 * @returns {object|null}
 */
export function laneFor(row, partId) {
  const lanes = lanesOf(row);
  if (lanes.length === 1 && (partId == null || lanes[0].partId == null)) return lanes[0];
  return lanes.find((l) => l.partId === partId) ?? null;
}

/**
 * Locates a lane by id anywhere in `lines`.
 * @param {Array<object>} lines
 * @param {string} laneId
 * @returns {{ system: object, lane: object, systemIdx: number, laneIdx: number }|null}
 */
export function findLane(lines, laneId) {
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    if (!isSoundLine(row)) continue;
    const lanes = lanesOf(row);
    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j].id === laneId) return { system: row, lane: lanes[j], systemIdx: i, laneIdx: j };
    }
  }
  return null;
}

/**
 * Total extent of a lane's sounds, in divisions: every sound's own duration plus
 * the leading silence (`gap`) in front of it. A sparse set lane therefore reports
 * the position its last sound ends at, not just the sound it holds.
 */
export function laneDur(lane) {
  return lane.sounds.reduce((sum, s) => sum + (s.gap ?? 0) + s.duration, 0);
}

/**
 * A system's span in divisions: its longest lane. Shorter lanes rest out the
 * remainder, so parts cannot drift apart. With one lane this is that lane's own
 * duration, which is why a single-part score's timing is unchanged.
 * @param {object} row
 */
export function systemSpan(row) {
  return lanesOf(row).reduce((max, lane) => Math.max(max, laneDur(lane)), 0);
}

/** Id of the first lane of the first sound row, or null. */
export function firstLaneId(lines) {
  const row = lines.find(isSoundLine);
  return row ? lanesOf(row)[0].id : null;
}

/** Id of the first lane of the last sound row, or the last row's id, or null. */
export function lastLaneId(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isSoundLine(lines[i])) return lanesOf(lines[i])[0].id;
  }
  return lines[lines.length - 1]?.id ?? null;
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
  const found = findLane(piece.lines, piece.selectedLineId);
  const idx = found ? found.systemIdx : piece.lines.findIndex((l) => l.id === piece.selectedLineId);
  if (idx >= 0) piece.lines.splice(idx + 1, 0, ...items);
  else piece.lines.push(...items);
}

/** The set a lane belongs to, or null. Sparse lanes — silence as `gap` rather than
 *  as typed rests — are a set-lane behaviour; an independent part edits as it always
 *  has, which is why every mutator below branches on this and no reader does. */
function laneSet(lane) {
  return laneSetId(piece.parts, lane);
}

/**
 * Leading silence a sound appended to a lane needs so it lands on its set's shared
 * cursor — the end of the set's combined timeline, since one player plays all the
 * drums of the set. 0 for an independent part, and 0 when the lane is already the
 * longest of its set.
 * @param {object} lane
 * @returns {number} Divisions.
 */
function appendGap(lane) {
  const setId = laneSet(lane);
  if (!setId) return 0;
  const found = findLane(piece.lines, lane.id);
  if (!found) return 0;
  return Math.max(0, setCursor(found.system, piece.parts, setId) - laneDur(lane));
}

/**
 * Returns the first lane that can fit `duration` divisions: the lane itself, else
 * the same part's lane in a later system, else a lane in a system appended to the
 * end. Overflow always stays within one part. When beatsPerLine is 0 (unlimited)
 * or the item is too large to fit anywhere, returns the starting lane.
 *
 * The gap is recomputed **per candidate system**, because a set's cursor and the
 * lane's own extent both differ from system to system — a single precomputed
 * `duration + gap` budget would only be valid for the starting one.
 * @param {string} fromLaneId
 * @param {number} duration - Duration to accommodate, in divisions.
 * @returns {{ lane: object, gap: number }|null} Target lane and the leading silence
 *   an appended sound needs there, or null when fromLaneId is unknown.
 */
function targetLane(fromLaneId, duration) {
  const from = findLane(piece.lines, fromLaneId);
  if (!from) return null;
  const setId = laneSet(from.lane);
  const gapIn = (row, lane) =>
    setId ? Math.max(0, setCursor(row, piece.parts, setId) - laneDur(lane)) : 0;
  const max = piece.beatsPerLine * piece.time;
  if (!piece.beatsPerLine || duration > max) {
    return { lane: from.lane, gap: gapIn(piece.lines[from.systemIdx], from.lane) };
  }
  for (let i = from.systemIdx; i < piece.lines.length; i++) {
    const row = piece.lines[i];
    if (!isSoundLine(row)) continue;
    const lane = i === from.systemIdx ? from.lane : laneFor(row, from.lane.partId);
    if (!lane) continue;
    const gap = gapIn(row, lane);
    if (laneDur(lane) + gap + duration <= max) return { lane, gap };
  }
  const system = makeSystem(piece.partIds());
  piece.lines.push(system);
  return { lane: laneFor(system, from.lane.partId) ?? system.lanes[0], gap: 0 };
}

/**
 * Opens `divs` divisions of silence at `div` in every lane of a set, so that an
 * insert which does not fit the blank space already there moves the whole set's
 * later music together and the lanes stay mutually aligned. A sound straddling
 * `div` is not split — the sound after it takes the shift.
 * @param {object} system
 * @param {string} setId
 * @param {number} div - Division at which the silence opens.
 * @param {number} divs
 * @param {string} [exceptLaneId] - Lane the caller is shifting itself.
 */
function openSetTime(system, setId, div, divs, exceptLaneId) {
  if (divs <= 0) return;
  for (const lane of setLanes(system, piece.parts, setId)) {
    if (lane.id === exceptLaneId) continue;
    let pos = 0;
    for (const s of lane.sounds) {
      const start = pos + (s.gap ?? 0);
      if (start >= div) {
        s.gap = start - pos + divs;
        break;
      }
      pos = start + s.duration;
    }
    // A lane whose music all precedes `div` has nothing to push: trailing silence
    // needs no representation, since the set cursor is derived from the last sound.
  }
}

/**
 * Closes every hole in a set's combined timeline — the spans no lane of the set
 * plays through (`setBlankSpans`) — by shifting each lane's later music back by the
 * blank before it, so the set keeps its mutual alignment and stays one continuous
 * playing path.
 *
 * Run after a **move**, the one edit that can vacate a span the whole set is silent
 * through: the sound it took out of the player's path is put back somewhere else, so
 * the span left behind is not silence anyone asked for. A delete deliberately keeps
 * its span (`removeFromLane`) — re-timing the other drums is not what deleting one
 * strike means.
 * @param {object} system
 * @param {string} setId
 */
function closeSetBlank(system, setId) {
  const spans = setBlankSpans(system, piece.parts, setId);
  if (!spans.length) return;
  // Spans are maximal, so one starting before a division also ends at or before it.
  const blankBefore = (div) => spans.reduce((t, s) => t + (s.startDiv < div ? s.divs : 0), 0);
  for (const lane of setLanes(system, piece.parts, setId)) {
    let pos = 0; // end of the previous sound, as written
    let out = 0; // end of the previous sound, once shifted
    for (const s of lane.sounds) {
      const start = pos + (s.gap ?? 0);
      const moved = start - blankBefore(start);
      if (moved > out) s.gap = moved - out;
      else delete s.gap;
      pos = start + s.duration;
      out = moved + s.duration;
    }
  }
}

/**
 * Closes the set holes around the lanes a move touched — source and target, which may
 * sit in different systems. A lane with no set, and a gapless set, are no-ops.
 * @param {...string} laneIds
 */
function closeSetBlankFor(...laneIds) {
  const done = new Set();
  for (const id of laneIds) {
    const found = findLane(piece.lines, id);
    const setId = found ? laneSet(found.lane) : null;
    if (!setId) continue;
    const key = `${found.system.id}:${setId}`;
    if (done.has(key)) continue;
    done.add(key);
    closeSetBlank(found.system, setId);
  }
}

/**
 * Inserts a run of sounds into a lane at a data index, taking the run's position
 * from the lane rather than from the run (its leading `gap` is always dropped).
 *
 * On a set lane, an insert where the lane is blank consumes that silence; where the
 * lane is occupied it opens the same silence across every lane of the set, so the
 * set stays mutually aligned. An independent part keeps today's behaviour, where
 * the insert simply ripples what follows along.
 * @param {object} lane
 * @param {Array<object>} sounds - At least one; mutated (leading `gap` stripped).
 * @param {number} atIndex - Data index; at or past the end means append.
 */
function insertIntoLane(lane, sounds, atIndex) {
  delete sounds[0].gap;
  const setId = laneSet(lane);
  if (atIndex == null || atIndex >= lane.sounds.length) {
    const gap = appendGap(lane);
    if (gap) sounds[0].gap = gap;
    lane.sounds.push(...sounds);
    return;
  }
  if (!setId) {
    lane.sounds.splice(atIndex, 0, ...sounds);
    return;
  }
  const span = sounds.reduce((t, s) => t + (s.gap ?? 0) + s.duration, 0);
  const before = lane.sounds.slice(0, atIndex).reduce((t, s) => t + (s.gap ?? 0) + s.duration, 0);
  const next = lane.sounds[atIndex];
  const blank = next.gap ?? 0;
  const found = findLane(piece.lines, lane.id);
  if (span > blank && found)
    openSetTime(found.system, setId, before + blank, span - blank, lane.id);
  if (blank > span) next.gap = blank - span;
  else delete next.gap;
  lane.sounds.splice(atIndex, 0, ...sounds);
}

/**
 * Snaps a division to the nearest legal insert point in a lane, the way a drop
 * between two tiles reads: a division inside blank space is taken as it is, one
 * inside a sound rounds to that sound's nearer edge, and one past the lane's
 * music becomes the end of it.
 * @param {{ sounds: Array }} lane
 * @param {number} div
 * @returns {{ index: number, div: number }} Data index to insert at, and the
 *   division the inserted run starts on.
 */
function snapToLane(lane, div) {
  let prevEnd = 0;
  for (const [i, s] of lane.sounds.entries()) {
    const start = prevEnd + (s.gap ?? 0);
    if (div <= start) return { index: i, div: Math.max(div, prevEnd) };
    const end = start + s.duration;
    if (div < end) {
      return div - start < end - div ? { index: i, div: start } : { index: i + 1, div: end };
    }
    prevEnd = end;
  }
  return { index: lane.sounds.length, div: Math.max(div, prevEnd) };
}

/**
 * Inserts a run of sounds at a **division** rather than at an index — where a
 * drag was dropped, instead of at the set's shared cursor. The run takes the
 * blank space it lands in as its leading `gap`; whatever no longer fits before
 * the next sound moves the whole set along (`openSetTime`), so the player's other
 * drums keep their alignment. A lane with no set has no blank to land in, so
 * there the division only picks the index and the insert stays contiguous.
 * @param {object} lane
 * @param {Array<object>} sounds - At least one; mutated (leading `gap` rewritten).
 * @param {number} div - Target division from the start of the system.
 */
function insertAtDiv(lane, sounds, div) {
  const setId = laneSet(lane);
  const { index, div: at } = snapToLane(lane, div);
  const prevEnd = lane.sounds.slice(0, index).reduce((t, x) => t + (x.gap ?? 0) + x.duration, 0);
  const leading = setId ? at - prevEnd : 0;
  delete sounds[0].gap;
  if (leading > 0) sounds[0].gap = leading;
  const span = sounds.reduce((t, s, i) => t + (i ? (s.gap ?? 0) : 0) + s.duration, 0);
  const next = lane.sounds[index];
  if (next) {
    const blank = next.gap ?? 0;
    const after = blank - leading - span;
    if (after > 0) next.gap = after;
    else delete next.gap;
    const found = after < 0 && setId ? findLane(piece.lines, lane.id) : null;
    if (found) openSetTime(found.system, setId, prevEnd + blank, -after, lane.id);
  }
  lane.sounds.splice(index, 0, ...sounds);
}

/**
 * Clamps a drop division so the landing run still fits inside `beatsPerLine`.
 * A lane is only ever as wide as its system, so this is a guard rather than
 * something a drag can normally reach.
 * @param {number} div
 * @param {number} duration - Divisions the dropped run needs.
 * @returns {number}
 */
function clampDropDiv(div, duration) {
  const max = piece.beatsPerLine * piece.time;
  if (!max) return Math.max(0, div);
  return Math.max(0, Math.min(div, max - duration));
}

/**
 * Removes sounds from a lane. On a set lane the removed span becomes leading
 * silence on the next surviving sound, so everything after keeps its absolute
 * position — deleting a strike out of a set's playing path must not re-time the
 * other drums. An independent part keeps today's rippling. Deleting the tail has
 * nothing to absorb into and legitimately moves the set cursor back.
 * @param {object} lane
 * @param {Set<string>} idSet - Sound ids to remove.
 */
function removeFromLane(lane, idSet) {
  if (laneSet(lane)) {
    let span = 0;
    for (const s of lane.sounds) {
      if (idSet.has(s.id)) {
        span += (s.gap ?? 0) + s.duration;
      } else if (span) {
        s.gap = (s.gap ?? 0) + span;
        span = 0;
      }
    }
  }
  lane.sounds = lane.sounds.filter((s) => !idSet.has(s.id));
}

/**
 * Turns a part's blank space into real rests, so its lanes become ordinary
 * contiguous ones with identical timing. Run when a part leaves its set: a `gap` is
 * a set-lane idea, and one left behind on an independent part would be silence the
 * author could never select or edit. The only place rests are synthesised rather
 * than authored — acceptable precisely because the author never typed them.
 * @param {string} partId
 */
function materialiseGaps(partId) {
  for (const row of piece.lines) {
    if (!isSoundLine(row)) continue;
    const lane = laneFor(row, partId);
    if (!lane?.sounds.some((s) => s.gap)) continue;
    const symbolSet = piece.symbolSetForLane(lane.id);
    const out = [];
    let pos = 0;
    for (const s of lane.sounds) {
      const gap = s.gap ?? 0;
      if (gap) {
        for (const r of restsForGap(symbolSet, pos, gap, piece.time)) out.push(makeSound(r));
        delete s.gap;
      }
      out.push(s);
      pos += gap + s.duration;
    }
    lane.sounds = out;
  }
}

/** Reorders `piece.parts` so each set's members are consecutive — what makes the
 *  display bracket (a run of adjacent parts) agree with set membership. Order is
 *  otherwise untouched: a part belonging to an already-placed set slides in behind
 *  that set's last member, so part 0 never moves. */
function groupSetsContiguous() {
  const out = [];
  for (const p of piece.parts) {
    const last = p.setId ? out.map((x) => x.setId).lastIndexOf(p.setId) : -1;
    if (last !== -1) out.splice(last + 1, 0, p);
    else out.push(p);
  }
  piece.parts = out;
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
 * Finds the lane that differs between two `lines` arrays — used to follow a
 * change with the selection after undo/redo. Prefers a lane whose content changed,
 * then a lane newly present in `newLines` (e.g. redo of an add), then the lane
 * nearest a removal. Only lanes are considered (selectedLineId tracks a lane);
 * returns null when no lane changed.
 * @param {Array<object>} oldLines
 * @param {Array<object>} newLines
 * @returns {string|null} id of the changed lane, or null.
 */
function changedLaneId(oldLines, newLines) {
  const flatten = (lines) => lines.filter(isSoundLine).flatMap((row) => lanesOf(row));
  const oldLanes = flatten(oldLines);
  const newLanes = flatten(newLines);
  const oldById = new Map(oldLanes.map((l) => [l.id, l]));
  const newById = new Map(newLanes.map((l) => [l.id, l]));
  for (const l of newLanes) {
    const o = oldById.get(l.id);
    if (o && JSON.stringify(o) !== JSON.stringify(l)) return l.id;
  }
  for (const l of newLanes) if (!oldById.has(l.id)) return l.id;
  for (let i = 0; i < oldLanes.length; i++) {
    if (!newById.has(oldLanes[i].id)) {
      return newLanes[Math.min(i, newLanes.length - 1)]?.id ?? null;
    }
  }
  return null;
}

const _defaultSet = SYMBOL_SETS[0];
const _defaultTaiko = _defaultSet.taiko[0].name;
const _defaultJiuchi = _defaultSet.jiuchis[0];
const _firstPart = makePart({ taiko: _defaultTaiko });
const _firstLine = makeSystem([_firstPart.id]);

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
  // `parts` is defaulted from `taiko` (part 0's drum), so it must follow it here.
  // Lanes are not repaired by this default — migrateScore owns the lines array.
  format: () => FORMAT,
  parts: () => [makePart({ taiko: piece.taiko })],
  sets: () => [],
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
  format: FORMAT,
  // The drum of part 0. Kept as a scalar — `symbolSet`, `time`, the PDF header
  // and pattern tagging all resolve through it — with the invariant
  // `piece.taiko === piece.parts[0].taiko`, maintained by setTaiko/setPartTaiko.
  taiko: _defaultTaiko,
  /** @type {Array<{ id: string, name: string, taiko: string, setId: string|null, volume: number, muted: boolean }>} Ordered top → bottom. */
  parts: [_firstPart],
  /** @type {Array<{ id: string, name: string }>} Named taiko sets (one player, several drums). */
  sets: [],
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
  selectedLineId: _firstLine.lanes[0].id,

  // Bumped by every commit/restore/load so derived maps over `lines` can be
  // memoised: with P lanes per system the per-row scans would otherwise be
  // re-run P times per redraw.
  _rev: 0,
  _jiuchiMap: null,
  _jiuchiMapRev: -1,
  _conflictIds: null,
  _conflictIdsRev: -1,

  /** Memoised jiuchiLineMap over the current lines: system id → section taiko. */
  get jiuchiMap() {
    if (this._jiuchiMapRev !== this._rev) {
      this._jiuchiMap = jiuchiLineMap(this.lines);
      this._jiuchiMapRev = this._rev;
    }
    return this._jiuchiMap;
  },

  /**
   * Sound ids involved in a two-hand violation: a set asking its one player for
   * three sticks at once, or for the same hand twice (`setConflicts`). Memoised
   * on `_rev` and whole-score, because `SoundTile` asks once per tile per redraw
   * and the playhead redraws at 60 fps.
   * @returns {Set<string>} Empty for a score with no taiko sets.
   */
  get setConflictIds() {
    if (this._conflictIdsRev !== this._rev) {
      const ids = new Set();
      if (this.parts.some((p) => p.setId)) {
        for (const row of this.lines) {
          if (!isSoundLine(row)) continue;
          for (const c of setConflicts(row, this.parts)) for (const id of c.soundIds) ids.add(id);
        }
      }
      this._conflictIds = ids;
      this._conflictIdsRev = this._rev;
    }
    return this._conflictIds;
  },

  /** Active symbol set, resolved lazily from (taiko, jiuchi). */
  get symbolSet() {
    return getSymbolSet(this.taiko, this.jiuchi) ?? _defaultSet;
  },

  /**
   * The symbol set to author with for the currently selected lane.
   * @see symbolSetForLane
   */
  get activeSymbolSet() {
    return this.symbolSetForLane(this.selectedLineId);
  },

  /**
   * The symbol set to author a lane with: a jiuchi section's taiko set when the
   * lane is part of a section definition, its part's taiko set otherwise. The
   * straight/swing `time` is the score's either way.
   * @param {string} laneId
   */
  symbolSetForLane(laneId) {
    const taiko = this.taikoForLane(laneId);
    if (taiko === this.taiko) return this.symbolSet;
    return symbolSetForTaiko(taiko, this.time) ?? this.symbolSet;
  },

  /**
   * Every taiko this score can sound with: every part's, each jiuchi section's,
   * and Shime when the metronome is set to tick with its sample. Used to warm the
   * sample cache - a taiko whose buffers are still undecoded falls back to the
   * synth for its first strikes, so all of them are preloaded rather than just
   * the score's.
   * @returns {string[]} Distinct taiko names.
   */
  taikosInUse() {
    const taikos = new Set([piece.taiko]);
    for (const part of piece.parts) taikos.add(part.taiko);
    for (const line of piece.lines) {
      if (line.type === 'jiuchi-section' && line.taiko) taikos.add(line.taiko);
    }
    if (piece.metronomeShime) taikos.add('Shime');
    return [...taikos];
  },

  /** Part ids in score order — the lane template for a new system. */
  partIds() {
    return piece.parts.map((p) => p.id);
  },

  /**
   * @param {string} partId
   * @returns {object|undefined}
   */
  partById(partId) {
    return piece.parts.find((p) => p.id === partId);
  },

  /** The lane `selectedLineId` names, or null. */
  get selectedLane() {
    return findLane(this.lines, this.selectedLineId)?.lane ?? null;
  },

  /** The system containing the selected lane, or null. */
  get selectedSystem() {
    return findLane(this.lines, this.selectedLineId)?.system ?? null;
  },

  /** The part the selected lane belongs to, or null (a jiuchi definition lane). */
  get selectedPartId() {
    return this.selectedLane?.partId ?? null;
  },

  /**
   * The taiko a lane should sound with: its jiuchi section's taiko when the lane
   * is part of a section definition, else its part's taiko. Also accepts a system
   * id, for callers that address a whole row.
   * @param {string} id - A lane id, or a system id.
   * @returns {string}
   */
  taikoForLane(id) {
    const found = findLane(this.lines, id);
    if (!found) return this.jiuchiMap.get(id) ?? this.taiko;
    if (found.lane.partId == null) return this.jiuchiMap.get(found.system.id) ?? this.taiko;
    return (
      this.jiuchiMap.get(found.system.id) ?? this.partById(found.lane.partId)?.taiko ?? this.taiko
    );
  },

  /**
   * The taiko set a lane belongs to — the player whose drums it is one of. Null for
   * an independent part and for a jiuchi definition lane. Set lanes are the sparse
   * ones: silence in them is a `gap`, not typed rests.
   * @param {string} laneId
   * @returns {string|null}
   */
  setIdForLane(laneId) {
    const found = findLane(this.lines, laneId);
    return found ? laneSetId(this.parts, found.lane) : null;
  },

  /**
   * Divisions of blank space a set lane has after its last sound: the span of its
   * system less its own music. A sparse lane's trailing silence has no `gap` to
   * render it, so `Lane` asks for it to draw the guide — and to give a drag
   * somewhere to land — under the drums the player is busy with. 0 for an
   * independent part and for a jiuchi definition lane, which have no blank.
   * @param {string} laneId
   * @returns {number}
   */
  blankTailFor(laneId) {
    const found = findLane(piece.lines, laneId);
    if (!found || !laneSetId(piece.parts, found.lane)) return 0;
    return Math.max(0, systemSpan(found.system) - laneDur(found.lane));
  },

  /** Number of beat divisions for the active symbol set (e.g. 4 straight, 3 swing). */
  get time() {
    return this.symbolSet.time;
  },

  /**
   * Number of skins on a lane's taiko (1 or 2). Sounds with a hand can target
   * either skin when 2.
   * @param {string} laneId
   */
  skinsForLane(laneId) {
    const taiko = this.taikoForLane(laneId);
    const set = this.symbolSetForLane(laneId);
    return set.taiko.find((t) => t.name === taiko)?.skins ?? 1;
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

  /** Invalidates the memoised derived maps. Call after any change to `lines`. */
  _touch() {
    piece._rev++;
  },

  /**
   * Pushes the current state onto the undo history and triggers a redraw.
   * Diffs the lines against the previous baseline so added/removed tiles and
   * rows animate. Pass `{ animate: false }` for wholesale replacements (e.g.
   * clear) where animating every tile would just be noise.
   * @param {{ animate?: boolean }} [opts]
   */
  _commit(opts) {
    piece._touch();
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
    // Named-jiuchi metronome values predate the auto/inline toggle; play them
    // as 'auto' so the UI reflects what actually sounds.
    if (piece.metronomeJiuchi !== 'auto' && piece.metronomeJiuchi !== 'inline') {
      piece.metronomeJiuchi = 'auto';
    }
    piece.format = FORMAT;
    if (!piece.parts.length) piece.parts = [makePart({ taiko: piece.taiko })];
    piece._normaliseParts();
    piece._touch();
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
    piece._touch();
    anim.sync(piece.lines, { animate: true }); // animate undo/redo add/remove
    piece._resetTransientState();
    // Follow the change: select the lane the undo/redo altered.
    const changed = changedLaneId(prevLines, state.lines);
    if (changed) piece.selectedLineId = changed;
    if (!findLane(piece.lines, piece.selectedLineId)) {
      piece.selectedLineId = firstLaneId(piece.lines);
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
   * @param {{ taiko?: string, jiuchi?: string, bpm?: number, beatsPerLine?: number, author?: string, icon?: string|null, parts?: number }} opts
   *   `parts` is the part count (clamped to 1-`MAX_NEW_PARTS`, default 1 — a
   *   solo score). Every part starts on `taiko`; drums, names and sets are
   *   refined afterwards in Score settings → Parts.
   */
  reset(opts = {}) {
    piece.id = null;
    piece.title = 'Untitled';
    piece.format = FORMAT;
    piece.taiko = opts.taiko ?? _defaultTaiko;
    const partCount = Math.max(1, Math.min(Math.round(Number(opts.parts) || 1), MAX_NEW_PARTS));
    piece.parts = Array.from({ length: partCount }, () => makePart({ taiko: piece.taiko }));
    piece.sets = [];
    const line = makeSystem(piece.partIds());
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
    piece.selectedLineId = line.lanes[0].id;
    piece._touch();
    piece._resetTransientState();
    anim.sync(piece.lines, { animate: false });
    history.reset(piece._snapshot());
    m.redraw();
  },

  clearLines() {
    const line = makeSystem(piece.partIds());
    piece.lines = [line];
    piece.selectedLineId = line.lanes[0].id;
    piece._resetTransientState();
    piece._commit({ animate: false }); // wholesale reset — don't flash every old tile out
  },

  setTitle(v) {
    piece.title = v;
    piece._commit();
  },
  /** Sets the score's (part 0's) taiko, keeping the taiko/parts[0] invariant. */
  setTaiko(v) {
    piece.taiko = v;
    if (piece.parts[0]) piece.parts[0].taiko = v;
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
    const line = findLane(piece.lines, lineId)?.lane;
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

  /**
   * Deletes all sounds in the current tile selection from their line, then
   * clears the selection (select mode stays active for further edits).
   */
  deleteSelectedSounds() {
    const { lineId, soundIds } = piece.selection;
    if (!lineId || soundIds.length === 0) return;
    const line = findLane(piece.lines, lineId)?.lane;
    if (!line) return;
    removeFromLane(line, new Set(soundIds));
    piece.selection = { lineId: null, anchorId: null, soundIds: [] };
    piece.selectedLineId = lineId;
    piece._commit();
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

  /** Adds a system (one lane per part) after the selection, staying in the same part. */
  addLine() {
    const partId = piece.selectedPartId;
    const line = makeSystem(piece.partIds());
    insertAfterSelected(line);
    piece.selectedLineId = (laneFor(line, partId) ?? line.lanes[0]).id;
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
   * Removes a whole system (every part's lane on that row). Selects the same
   * part's lane in the nearest remaining system when the selection went with it.
   * Always ensures at least one system exists.
   * @param {string} id - A system id, or any lane id within it.
   */
  removeLine(id) {
    const found = findLane(piece.lines, id);
    const sysId = found ? found.system.id : id;
    const partId = piece.selectedPartId;
    const idx = piece.lines.findIndex((l) => l.id === sysId);
    piece.lines = piece.lines.filter((l) => l.id !== sysId);
    // Prune the system from block-repeat markers; drop markers that become empty
    piece.lines = piece.lines.filter((item) => {
      if (item.type !== 'block-repeat') return true;
      item.lineIds = item.lineIds.filter((lid) => lid !== sysId);
      return item.lineIds.length > 0;
    });
    const systems = piece.lines.filter(isSoundLine);
    if (systems.length === 0) {
      const line = makeSystem(piece.partIds());
      piece.lines.push(line);
      piece.selectedLineId = line.lanes[0].id;
    } else if (!findLane(piece.lines, piece.selectedLineId)) {
      const nearIdx = Math.min(Math.max(idx, 0), systems.length - 1);
      const near = systems[nearIdx];
      piece.selectedLineId = (laneFor(near, partId) ?? lanesOf(near)[0]).id;
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
      lanes: lanesOf(item).map((lane) => ({
        id: uid(),
        partId: lane.partId,
        sounds: lane.sounds.map((s) => ({ ...s, id: uid() })),
      })),
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
   * Duplicates a single row (sound line, heading, note, or divider) and inserts
   * the clone immediately after it. A sound-line clone becomes the selected line.
   * Marker rows (block-repeat, jiuchi-section) are not duplicable.
   * @param {string} id
   */
  duplicateLine(id) {
    const sysId = findLane(piece.lines, id)?.system.id ?? id;
    const idx = piece.lines.findIndex((l) => l.id === sysId);
    if (idx === -1) return;
    const item = piece.lines[idx];
    if (item.type === 'block-repeat' || item.type === 'jiuchi-section') return;
    const partId = piece.selectedPartId;
    const clone = piece._cloneItem(item);
    piece.lines.splice(idx + 1, 0, clone);
    if (isSoundLine(clone)) {
      piece.selectedLineId = (laneFor(clone, partId) ?? lanesOf(clone)[0]).id;
    }
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
    if (!piece.lines.some(isSoundLine)) {
      const line = makeSystem(piece.partIds());
      piece.lines.push(line);
      piece.selectedLineId = line.lanes[0].id;
    } else if (!findLane(piece.lines, piece.selectedLineId)) {
      piece.selectedLineId = firstLaneId(piece.lines);
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
    // A base rhythm is one drum's, so a definition row is a single part-less lane.
    const line = makeSystem([null]);
    insertAfterSelected(makeJiuchiSection(piece.taiko), line, makeDivider());
    piece.selectedLineId = line.lanes[0].id;
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
   * Adds a sound to the lane. If the lane is full (beatsPerLine), overflows to the
   * same part's lane in the next system with space, creating one if needed.
   * @param {string} lineId - Lane id.
   * @param {{ name: string, hand: string, duration: number }} symbol
   * @param {number} [atIndex] - Insert position within the lane; appends if omitted.
   */
  addSound(lineId, symbol, atIndex) {
    const s = makeSound(symbol);
    const target = targetLane(lineId, s.duration);
    if (!target) return;
    const { lane, gap } = target;
    if (lane.id === lineId && atIndex != null && atIndex < lane.sounds.length) {
      insertIntoLane(lane, [s], atIndex);
    } else {
      if (gap) s.gap = gap;
      lane.sounds.push(s);
    }
    piece.selectedLineId = lane.id;
    piece._commit();
  },

  /**
   * Adds a sound at a division of the lane — where a drag was dropped, rather
   * than at the set's shared cursor. The division is snapped to the nearest
   * insert point (`snapToLane`), so dropping into blank space lands there and
   * dropping on a tile lands against its nearer edge.
   * @param {string} lineId - Lane id.
   * @param {{ name: string, hand: string, duration: number }} symbol
   * @param {number} div - Target division from the start of the system.
   * @returns {boolean} False when the lane is unknown.
   */
  addSoundAtDiv(lineId, symbol, div) {
    const lane = findLane(piece.lines, lineId)?.lane;
    if (!lane) return false;
    const s = makeSound(symbol);
    insertAtDiv(lane, [s], clampDropDiv(div, s.duration));
    piece.selectedLineId = lineId;
    piece._commit();
    return true;
  },

  /**
   * Moves a sound within or between lanes. Rejects cross-lane moves that would
   * overflow the target lane's beat budget and calls m.redraw() to revert the
   * SortableJS DOM change in that case.
   * @param {string} fromLineId - Source lane id.
   * @param {string} soundId
   * @param {string} toLineId - Target lane id.
   * @param {number} toIndex
   */
  moveSound(fromLineId, soundId, toLineId, toIndex) {
    const fromLine = findLane(piece.lines, fromLineId)?.lane;
    const toLine = findLane(piece.lines, toLineId)?.lane;
    if (!fromLine || !toLine) return;
    const idx = fromLine.sounds.findIndex((s) => s.id === soundId);
    if (idx === -1) return;
    const sound = fromLine.sounds[idx];
    if (fromLineId !== toLineId && piece.beatsPerLine > 0) {
      const gap = toIndex >= toLine.sounds.length ? appendGap(toLine) : 0;
      if (laneDur(toLine) + gap + sound.duration > piece.beatsPerLine * piece.time) {
        // Overflow: reject the move. The dragged node was already reverted in the
        // Sortable onEnd handler, so a redraw repaints the unchanged line.
        m.redraw();
        return;
      }
    }
    removeFromLane(fromLine, new Set([sound.id]));
    // The move's position is re-derived at the destination; carrying the sound's
    // old leading silence there would inject a gap it never had.
    insertIntoLane(toLine, [sound], toIndex);
    closeSetBlankFor(fromLineId, toLineId);
    piece.selectedLineId = toLineId;
    piece._commit();
  },

  /**
   * Moves multiple sounds as a contiguous unit within or between lanes.
   * @param {string} fromLineId - Source lane id.
   * @param {string[]} soundIds - Must all exist in fromLine; their relative order is preserved.
   * @param {string} toLineId - Target lane id.
   * @param {number} toIndex - Insertion point in the target lane's data array.
   */
  moveSounds(fromLineId, soundIds, toLineId, toIndex) {
    const fromLine = findLane(piece.lines, fromLineId)?.lane;
    const toLine = findLane(piece.lines, toLineId)?.lane;
    if (!fromLine || !toLine) return;
    const idSet = new Set(soundIds);
    const sounds = fromLine.sounds.filter((s) => idSet.has(s.id));
    if (sounds.length !== soundIds.length) return;
    if (fromLineId !== toLineId && piece.beatsPerLine > 0) {
      // The run's own leading silence is dropped on insert, but silence *between*
      // its members travels with it: it is part of the rhythm being moved.
      const totalDur = sounds.reduce((sum, s, i) => sum + (i ? (s.gap ?? 0) : 0) + s.duration, 0);
      const gap = toIndex >= toLine.sounds.length ? appendGap(toLine) : 0;
      if (laneDur(toLine) + gap + totalDur > piece.beatsPerLine * piece.time) {
        // Overflow: reject the move. The dragged node was already reverted in the
        // Sortable onEnd handler, so a redraw repaints the unchanged line.
        m.redraw();
        return;
      }
    }
    removeFromLane(fromLine, idSet);
    insertIntoLane(toLine, sounds, toIndex);
    closeSetBlankFor(fromLineId, toLineId);
    piece.selectedLineId = toLineId;
    piece._commit();
  },

  /**
   * Moves a sound to a division of a lane — the drag-and-drop counterpart of
   * `moveSound`, for a drop in a set lane where a bare index cannot say *when*
   * the sound should play. The source lane absorbs the vacated span as usual, so
   * the rest of the set stays put.
   * @param {string} fromLineId - Source lane id.
   * @param {string} soundId
   * @param {string} toLineId - Target lane id.
   * @param {number} div - Target division from the start of the system.
   * @returns {boolean} False when a lane or the sound is unknown.
   */
  moveSoundToDiv(fromLineId, soundId, toLineId, div) {
    const from = findLane(piece.lines, fromLineId)?.lane;
    const to = findLane(piece.lines, toLineId)?.lane;
    if (!from || !to) return false;
    const sound = from.sounds.find((s) => s.id === soundId);
    if (!sound) return false;
    removeFromLane(from, new Set([soundId]));
    insertAtDiv(to, [sound], clampDropDiv(div, sound.duration));
    closeSetBlankFor(fromLineId, toLineId);
    piece.selectedLineId = toLineId;
    piece._commit();
    return true;
  },

  removeSound(lineId, soundId) {
    const line = findLane(piece.lines, lineId)?.lane;
    if (!line) return;
    removeFromLane(line, new Set([soundId]));
    piece.selectedLineId = lineId;
    piece._commit();
  },

  /**
   * Merges patch properties onto the matching sound object.
   * @param {string} lineId - Lane id.
   * @param {string} soundId
   * @param {Partial<{ hand: string, instruction: string }>} patch
   */
  updateSound(lineId, soundId, patch) {
    const line = findLane(piece.lines, lineId)?.lane;
    if (!line) return;
    const idx = line.sounds.findIndex((s) => s.id === soundId);
    if (idx === -1) return;
    const s = line.sounds[idx];
    const wasDur = s.duration;
    Object.assign(s, patch);
    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) delete s[key];
    }
    // On a set lane a duration change trades with the blank space after it — a
    // shrink donates the difference, a grow consumes it (and ripples once the
    // blank runs out) — so the rest of the set's playing path stays put.
    const next = line.sounds[idx + 1];
    if (next && laneSet(line) && s.duration !== wasDur) {
      const gap = (next.gap ?? 0) - (s.duration - wasDur);
      if (gap > 0) next.gap = gap;
      else delete next.gap;
    }
    piece._commit();
  },

  /**
   * The division `alignSound` would move a sound back to, or null when it cannot
   * be aligned — what the inline editor asks before offering the button.
   * @param {string} lineId - Lane id.
   * @param {string} soundId
   * @returns {number|null}
   */
  alignTargetFor(lineId, soundId) {
    const found = findLane(piece.lines, lineId);
    return found ? alignDiv(found.system, piece.parts, lineId, soundId) : null;
  },

  /**
   * Pulls a set lane's strike back onto the set's previous strike on another of
   * the player's drums, so the two sound together. The shared cursor means an
   * appended sound always lands *after* everything the set is already playing, so
   * this is the only gesture that produces two drums struck at once (short of
   * inserting in front of an existing sound).
   *
   * Only this sound moves: the silence it vacates is handed to the next sound's
   * `gap`, so the rest of the lane — and every other lane of the set — keeps its
   * absolute position. Two strikes on one division are legal when the hands
   * differ; when they do not, `setConflicts` marks them as it does any clash.
   * @param {string} lineId - Lane id.
   * @param {string} soundId
   * @returns {boolean} False when there was nothing to align to.
   */
  alignSound(lineId, soundId) {
    const found = findLane(piece.lines, lineId);
    if (!found) return false;
    const div = alignDiv(found.system, piece.parts, lineId, soundId);
    if (div == null) return false;
    const { lane } = found;
    const idx = lane.sounds.findIndex((s) => s.id === soundId);
    const s = lane.sounds[idx];
    const prevEnd = lane.sounds.slice(0, idx).reduce((t, x) => t + (x.gap ?? 0) + x.duration, 0);
    const moved = prevEnd + (s.gap ?? 0) - div;
    const gap = div - prevEnd;
    if (gap > 0) s.gap = gap;
    else delete s.gap;
    const next = lane.sounds[idx + 1];
    if (next) next.gap = (next.gap ?? 0) + moved;
    piece.selectedLineId = lineId;
    piece._commit();
    return true;
  },

  // ── Group tiles (pattern instances) ──────────────────────────────────────

  /**
   * Expands a pattern and adds its individual sounds to the score, distributing
   * them across the part's lanes from lineId when beatsPerLine is set.
   * @param {string} lineId - Lane id.
   * @param {{ sounds: Array<{ duration: number }> }} pattern
   */
  addGroup(lineId, pattern, atIndex) {
    let lane = findLane(piece.lines, lineId)?.lane;
    if (!lane) return;
    let insertAt = atIndex;
    for (const s of pattern.sounds) {
      const target = targetLane(lane.id, s.duration);
      lane = target.lane;
      // A pattern is a rhythm, not a position: a `gap` captured in one set lane
      // would inject silence wherever the pattern is reused.
      const sound = { ...s, id: uid() };
      delete sound.gap;
      if (lane.id === lineId && insertAt != null && insertAt < lane.sounds.length) {
        insertIntoLane(lane, [sound], insertAt);
        insertAt++;
      } else {
        if (target.gap) sound.gap = target.gap;
        lane.sounds.push(sound);
      }
    }
    piece.selectedLineId = lane.id;
    piece._commit();
  },

  /**
   * Drops a pattern at a division of the lane. The pattern's own rhythm is
   * contiguous, so only its first sound takes the blank space it landed in; it
   * never overflows to another system, since a drop names one spot in one lane.
   * @param {string} lineId - Lane id.
   * @param {{ sounds: Array<{ duration: number }> }} pattern
   * @param {number} div - Target division from the start of the system.
   * @returns {boolean} False when the lane is unknown or the pattern is empty.
   */
  addGroupAtDiv(lineId, pattern, div) {
    const lane = findLane(piece.lines, lineId)?.lane;
    if (!lane || !pattern.sounds?.length) return false;
    // A pattern is a rhythm, not a position: any captured gap is dropped.
    const sounds = pattern.sounds.map((s) => {
      const sound = { ...s, id: uid() };
      delete sound.gap;
      return sound;
    });
    const span = sounds.reduce((t, s) => t + s.duration, 0);
    insertAtDiv(lane, sounds, clampDropDiv(div, span));
    piece.selectedLineId = lineId;
    piece._commit();
    return true;
  },

  // ── Parts and sets ────────────────────────────────────────────────────────

  /**
   * Repairs the part list invariants: at least one part, `piece.taiko` mirrors
   * part 0's drum, and no set survives with no members.
   */
  _normaliseParts() {
    if (!piece.parts.length) piece.parts = [makePart({ taiko: piece.taiko })];
    piece.taiko = piece.parts[0].taiko;
    const used = new Set(piece.parts.map((p) => p.setId).filter(Boolean));
    piece.sets = piece.sets.filter((s) => used.has(s.id));
    for (const p of piece.parts) {
      if (p.setId && !piece.sets.some((s) => s.id === p.setId)) p.setId = null;
    }
  },

  /**
   * Repairs the one-lane-per-part invariant across every system: lanes in
   * `piece.parts` order, missing ones added empty, orphaned ones dropped. A
   * jiuchi-section definition row is exempt — it stays a single part-less lane.
   */
  _normaliseSystems() {
    const jiuchi = jiuchiLineMap(piece.lines);
    for (const row of piece.lines) {
      if (!isSoundLine(row) || jiuchi.has(row.id)) continue;
      const existing = lanesOf(row);
      row.lanes = piece.parts.map((p) => existing.find((l) => l.partId === p.id) ?? makeLane(p.id));
    }
  },

  /**
   * Appends a part and gives it an empty lane in every system. The new part's
   * lane in the selected system becomes the selection, so the user can play
   * straight into it.
   * @param {{ name?: string, taiko?: string, setId?: string|null }} [opts]
   */
  addPart(opts = {}) {
    const part = makePart({ taiko: opts.taiko ?? piece.taiko, ...opts });
    piece.parts.push(part);
    piece._normaliseParts();
    piece._normaliseSystems();
    const system = piece.selectedSystem ?? piece.lines.find(isSoundLine);
    const lane = system ? laneFor(system, part.id) : null;
    if (lane) piece.selectedLineId = lane.id;
    piece._commit();
    return part;
  },

  /**
   * Removes a part and its lane (with its music) from every system. Refuses to
   * remove the last part — a score always has one. Undoable via history.
   * @param {string} partId
   */
  removePart(partId) {
    if (piece.parts.length < 2) return;
    const idx = piece.parts.findIndex((p) => p.id === partId);
    if (idx === -1) return;
    piece.parts.splice(idx, 1);
    piece._normaliseParts();
    piece._normaliseSystems();
    if (!findLane(piece.lines, piece.selectedLineId)) {
      const system = piece.lines.find(isSoundLine);
      const near = piece.parts[Math.min(idx, piece.parts.length - 1)];
      piece.selectedLineId = system ? (laneFor(system, near.id) ?? lanesOf(system)[0]).id : null;
    }
    piece._commit();
  },

  /**
   * Moves a part to a new position, reordering every system's lanes to match so
   * the lane order always mirrors `piece.parts`.
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  reorderPart(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= piece.parts.length) return;
    const [moved] = piece.parts.splice(fromIndex, 1);
    piece.parts.splice(Math.max(0, Math.min(toIndex, piece.parts.length)), 0, moved);
    groupSetsContiguous();
    piece._normaliseParts();
    piece._normaliseSystems();
    piece._commit();
  },

  /**
   * Changes a part's drum. Part 0 mirrors to `piece.taiko`, which also moves the
   * score's symbol set.
   * @param {string} partId
   * @param {string} taiko
   */
  setPartTaiko(partId, taiko) {
    const part = piece.partById(partId);
    if (!part) return;
    part.taiko = taiko;
    piece._normaliseParts();
    piece._commit();
  },

  setPartName(partId, name) {
    const part = piece.partById(partId);
    if (!part) return;
    part.name = name;
    piece._commit();
  },

  setPartVolume(partId, v) {
    const part = piece.partById(partId);
    if (!part) return;
    part.volume = Number(v);
    piece._commit();
  },

  /** Live (non-committing) part-volume update for slider drags; commit via setPartVolume. */
  setPartVolumeLive(partId, v) {
    const part = piece.partById(partId);
    if (!part) return;
    part.volume = Number(v);
    m.redraw();
  },

  togglePartMute(partId) {
    const part = piece.partById(partId);
    if (!part) return;
    part.muted = !part.muted;
    piece._commit();
  },

  /**
   * Puts a part in a taiko set (one player, several drums) or takes it out.
   * Sets left with no members are pruned, and the parts are regrouped so the set's
   * members stay adjacent. A part leaving a set has its blank space materialised as
   * real rests, since sparse lanes are a set-lane behaviour.
   * @param {string} partId
   * @param {string|null} setId
   */
  assignPartToSet(partId, setId) {
    const part = piece.partById(partId);
    if (!part) return;
    const left = part.setId && !setId;
    part.setId = setId ?? null;
    if (left) materialiseGaps(partId);
    groupSetsContiguous();
    piece._normaliseParts();
    piece._normaliseSystems();
    piece._commit();
  },

  /**
   * Creates a named taiko set and returns it. A set only persists while a part
   * references it (see _normaliseParts), so assign a part in the same gesture.
   * @param {string} name
   */
  addSet(name) {
    const set = makeSet(name);
    piece.sets.push(set);
    return set;
  },

  setSetName(id, name) {
    const set = piece.sets.find((s) => s.id === id);
    if (!set) return;
    set.name = name;
    piece._commit();
  },

  /** Removes a set and unlinks its parts, materialising each one's blank space as
   *  real rests so the music it held survives as an ordinary contiguous lane. */
  removeSet(id) {
    piece.sets = piece.sets.filter((s) => s.id !== id);
    for (const p of piece.parts) {
      if (p.setId !== id) continue;
      p.setId = null;
      materialiseGaps(p.id);
    }
    piece._commit();
  },
};

anim.sync(piece.lines, { animate: false }); // seed the baseline at boot
history.init(piece._snapshot());
