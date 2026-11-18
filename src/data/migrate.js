import { uid } from '../uid.js';
import { isSoundLine, jiuchiLineMap, lanesOf, makeLane, makePart } from './piece.js';
import { restsForGap } from './sets.js';

/**
 * Expands any legacy group tiles in a lines array into their constituent sounds.
 * Group tiles were removed from the data model; scores saved before this change
 * may still contain them and must be migrated on load. Operates on either row
 * shape (pre-3.0 `{ id, sounds }` or a system of lanes).
 * @param {Array} lines
 * @returns {Array} Lines with no group-type sounds.
 */
export function expandGroupsInLines(lines) {
  const expand = (sounds) => {
    const out = [];
    for (const s of sounds) {
      if (s.type === 'group') for (const gs of s.sounds) out.push({ ...gs, id: uid() });
      else out.push(s);
    }
    return out;
  };
  return lines.map((line) => {
    if (line.lanes) {
      return { ...line, lanes: line.lanes.map((l) => ({ ...l, sounds: expand(l.sounds ?? []) })) };
    }
    if (!line.sounds) return line;
    return { ...line, sounds: expand(line.sounds) };
  });
}

/**
 * Wraps each pre-3.0 sound row in a one-lane system. The **system keeps the row's
 * id** — `block-repeat.lineIds`, the jiuchi-section scan and the PDF's section
 * bars all address rows of `lines` — and the lane gets a fresh id, since nothing
 * persisted names a lane. A row inside a jiuchi-section definition becomes a
 * part-less lane, which is how it keeps taking its drum from the marker.
 * @param {Array} lines
 * @param {string} partId
 * @returns {Array}
 */
function wrapLegacyLines(lines, partId) {
  const jiuchi = jiuchiLineMap(lines);
  return lines.map((row) => {
    if (!isSoundLine(row) || row.lanes) return row;
    const lane = {
      id: uid(),
      partId: jiuchi.has(row.id) ? null : partId,
      sounds: row.sounds ?? [],
    };
    const { sounds: _legacy, ...rest } = row; // keeps `repeat`, which lives on the system
    return { ...rest, lanes: [lane] };
  });
}

/**
 * Enforces the one-lane-per-part invariant on an array of lines: lanes in `parts`
 * order, missing ones added empty, orphaned ones (a part that no longer exists)
 * dropped. Jiuchi-section definition rows are exempt — a base rhythm is one
 * drum's, so they stay a single part-less lane.
 * @param {Array} lines
 * @param {Array<{ id: string }>} parts
 * @returns {Array}
 */
export function normaliseSystems(lines, parts) {
  const jiuchi = jiuchiLineMap(lines);
  return lines.map((row) => {
    if (!isSoundLine(row) || jiuchi.has(row.id)) return row;
    const existing = lanesOf(row);
    const { sounds: _legacy, ...rest } = row;
    return {
      ...rest,
      lanes: parts.map((p) => existing.find((l) => l.partId === p.id) ?? makeLane(p.id)),
    };
  });
}

/**
 * Normalises any score source (saved record, autosave, imported JSON) to the
 * current format: parts, sets, and lines of systems with one lane per part.
 * Idempotent — a format-2 source is only re-checked for the lane invariant.
 * @param {object} source - A score record; may be any format.
 * @returns {{ parts: object[], sets: object[], lines: object[] }}
 */
export function migrateScore(source) {
  const lines = expandGroupsInLines(source.lines ?? []);
  const legacy = (source.format ?? 1) < 2 || !source.parts?.length;
  const parts = legacy
    ? [makePart({ taiko: source.taiko })]
    : source.parts.map((p) => ({ ...makePart(), ...p }));
  const sets = (legacy ? [] : (source.sets ?? [])).filter((s) => s && s.id);
  const wrapped = legacy ? wrapLegacyLines(lines, parts[0].id) : lines;
  return { parts, sets, lines: normaliseSystems(wrapped, parts) };
}

/**
 * Materialises a sparse set lane's `gap` silence as real rests, so the sounds
 * array is contiguous and an app that knows nothing of `gap` still times it
 * correctly. Same fill as unlinking a part from its set: numbered beat tiles plus
 * the symbol set's own rests for a sub-beat remainder.
 * @param {Array} sounds
 * @param {object} symbolSet
 * @returns {Array}
 */
function materialiseGaps(sounds, symbolSet) {
  if (!sounds.some((s) => s.gap)) return sounds;
  const out = [];
  let pos = 0;
  for (const s of sounds) {
    const gap = s.gap ?? 0;
    for (const r of restsForGap(symbolSet, pos, gap, symbolSet.time)) {
      out.push({ ...r, id: uid() });
    }
    pos += gap;
    const { gap: _gap, ...rest } = s;
    out.push(rest);
    pos += s.duration;
  }
  return out;
}

/**
 * Adds a pre-3.0 `sounds` array (part 0's lane) alongside each system's `lanes`,
 * for exported JSON only. A 2.x app reads `sounds` and renders the primary part
 * instead of crashing on a row with no sounds; a 3.x app sees `format: 2` and
 * reads `lanes`. The cost is that a new → old → new round-trip through an old app
 * silently drops the other parts, so this is never written to IndexedDB.
 *
 * With a `symbolSet` the mirror also materialises part 0's blank space as rests
 * (`gap` is a 3.13 field, and an older app prefix-sums `duration` alone, so a
 * mirrored gap would play early). The lanes themselves keep their gaps.
 * @param {Array} lines
 * @param {object} [symbolSet] - Part 0's symbol set, for the rest fill.
 * @returns {Array}
 */
export function legacyMirror(lines, symbolSet) {
  return lines.map((row) => {
    if (!isSoundLine(row) || !row.lanes) return row;
    const sounds = lanesOf(row)[0]?.sounds ?? [];
    return { ...row, sounds: symbolSet ? materialiseGaps(sounds, symbolSet) : sounds };
  });
}
