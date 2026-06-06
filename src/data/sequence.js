import { isSoundLine } from './piece.js';
import { effectiveVolume } from '../util.js';
import { isKakegoe, KAKEGOE_VOLUME } from './kakegoe.js';

/**
 * Expands block-repeat markers into a flat, ordered list of sound lines ready for
 * playback. Each repeat (single-line or multi-line, including nested ones) is
 * unrolled `count` times — `count` is the total number of plays, so ×2 yields two
 * copies. Structural rows (headings, notes, dividers) produce no entries but do
 * not break the surrounding range.
 *
 * @param {Array<{ id: string, type?: string, count?: number, lineIds?: string[], sounds?: Array }>} lines
 *   The piece's lines array (mixed sound lines, structural rows, and block-repeat markers).
 * @returns {Array<object>} Sound-line objects in play order, with repeats unrolled.
 *   The same line object may appear multiple times when repeated.
 */
export function expandRepeats(lines) {
  const idToIdx = new Map(lines.map((l, i) => [l.id, i]));

  // Each marker spans the contiguous index range covering its member lines; the
  // marker row itself sits just after that range. `markerIdx` lets the recursion
  // skip the marker row, and the `markerIdx <= hi` guard below stops a marker
  // from re-catching itself while expanding its own block.
  const markers = lines.filter((l) => l.type === 'block-repeat');
  const ranges = markers.map((mk) => {
    const idxs = mk.lineIds.map((id) => idToIdx.get(id)).filter((i) => i != null);
    return {
      mk,
      start: Math.min(...idxs),
      end: Math.max(...idxs),
      markerIdx: idToIdx.get(mk.id),
    };
  });

  // A nested repeat's marker row sits just past its last member line, which can be
  // beyond the member-line span of the block enclosing it. Extend each block's end
  // to cover the marker rows of repeats nested within it (their lineIds ⊆ ours), so
  // the recursion still sees those inner markers inside the parent's range.
  for (const r of ranges) {
    const lineSet = new Set(r.mk.lineIds);
    for (const o of ranges) {
      if (o !== r && o.mk.lineIds.every((id) => lineSet.has(id))) {
        r.end = Math.max(r.end, o.markerIdx);
      }
    }
  }

  /**
   * Expands the inclusive index range [lo, hi], unrolling any block-repeats that
   * begin within it. At each position the outermost marker starting there (largest
   * span) is expanded first; the recursion handles nested markers inside it.
   */
  function expand(lo, hi) {
    const out = [];
    let i = lo;
    while (i <= hi) {
      const candidates = ranges.filter((r) => r.start === i && r.end <= hi && r.markerIdx <= hi);
      if (candidates.length) {
        const r = candidates.reduce((a, b) => (b.end > a.end ? b : a));
        const block = expand(r.start, r.end);
        for (let c = 0; c < r.mk.count; c++) out.push(...block);
        i = r.markerIdx + 1; // skip past the block and its marker row
        continue;
      }
      const item = lines[i];
      if (isSoundLine(item)) out.push(item);
      i++;
    }
    return out;
  }

  return lines.length ? expand(0, lines.length - 1) : [];
}

/**
 * Flattens a piece's lines into a timed event stream for playback. Lines are
 * concatenated continuously (line wrapping is purely visual), block-repeats are
 * unrolled, and each sound becomes one event positioned in beat divisions.
 *
 * Rest sounds (no hand → `effectiveVolume` is null) are included so a playhead can
 * sweep through them; their `volume` is null and the audio engine skips them.
 * Kakegoe calls (HUP/HA/SO/RE/sore) also carry no hand but are vocal samples, so
 * they are given a fixed audible volume here rather than treated as rests.
 *
 * Accented sounds (`emphasis: true`) play at 1.5× their effective volume; the engine
 * caps the result at 8, so accents read louder without altering the displayed volume.
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {number} time - Divisions per beat (e.g. 4 straight, 3 swing).
 * @returns {{ events: Array<{ lineId: string, soundId: string, name: string, hand: string|undefined, skin: string|undefined, volume: number|null, startDiv: number, durationDiv: number }>, totalDiv: number }}
 */
export function buildSequence(lines, time) {
  const events = [];
  let pos = 0;
  for (const line of expandRepeats(lines)) {
    for (const s of line.sounds) {
      const vol = isKakegoe(s.name) ? KAKEGOE_VOLUME : effectiveVolume(s);
      events.push({
        lineId: line.id,
        soundId: s.id,
        name: s.name,
        hand: s.hand,
        skin: s.skin, // selects the Katsugi front/back recording
        volume: vol != null && s.emphasis ? vol * 1.5 : vol,
        startDiv: pos,
        durationDiv: s.duration,
      });
      pos += s.duration;
    }
  }
  return { events, totalDiv: pos };
}

/**
 * Returns the lines belonging to a heading-delimited section: everything after the
 * heading up to (but excluding) the next heading, or the end of the list. Markers
 * and other rows within the range are kept so repeats inside the section still
 * apply when the slice is passed to {@link buildSequence}.
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {string} headingId - The id of the section's heading row.
 * @returns {Array<object>} The section's lines (empty if the heading isn't found).
 */
export function sectionSlice(lines, headingId) {
  const start = lines.findIndex((l) => l.id === headingId);
  if (start < 0) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].type === 'heading') {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/**
 * Returns the lines covered by a block-repeat, from its first member line through
 * the marker row inclusive. Including the marker means {@link expandRepeats} applies
 * the block's repeat count when the slice is played.
 *
 * Note: if the block's members span a heading and the caller has already sliced by
 * section, out-of-range member indices are simply dropped, yielding a partial
 * repeat — an accepted limitation for unusual authoring shapes.
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {string} markerId - The id of the block-repeat marker row.
 * @returns {Array<object>} The block's lines (empty if the marker is missing/invalid).
 */
export function blockRepeatSlice(lines, markerId) {
  const markerIdx = lines.findIndex((l) => l.id === markerId);
  if (markerIdx < 0 || lines[markerIdx].type !== 'block-repeat') return [];
  const idxs = lines[markerIdx].lineIds
    .map((id) => lines.findIndex((l) => l.id === id))
    .filter((i) => i >= 0);
  if (!idxs.length) return [];
  return lines.slice(Math.min(...idxs), markerIdx + 1);
}

/**
 * Converts a position in beat divisions to seconds at the given tempo.
 * @param {number} div - Position/duration in divisions.
 * @param {number} bpm - Beats per minute.
 * @param {number} time - Divisions per beat.
 * @returns {number} Seconds.
 */
export function divToSeconds(div, bpm, time) {
  return (div / time) * (60 / bpm);
}
