import { isSoundLine, lanesOf, laneFor, systemSpan } from './piece.js';
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
 * they are given a fixed audible volume here rather than treated as rests. Silent
 * tiles (`silent: true`) are always muted, even if their editable text happens to
 * match a kakegoe word.
 *
 * Accented sounds (`emphasis: true`) play at 1.5× their effective volume; the engine
 * caps the result at 8, so accents read louder without altering the displayed volume.
 *
 * One part at a time: each system contributes that part's lane, anchored at the
 * system's start, so a part with a short lane rests out the remainder instead of
 * drifting ahead of the others. With one lane per system the span equals that
 * lane's duration, which is why a single-part score's timing is unchanged.
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {number} time - Divisions per beat (e.g. 4 straight, 3 swing).
 * @param {string} [partId] - Which part to voice; omitted plays each system's first lane.
 * @returns {{ events: Array<{ lineId: string, soundId: string, name: string, hand: string|undefined, skin: string|undefined, volume: number|null, startDiv: number, durationDiv: number }>, totalDiv: number }}
 */
export function buildSequence(lines, time, partId) {
  const events = [];
  let pos = 0;
  for (const system of expandRepeats(lines)) {
    const lane = partId === undefined ? lanesOf(system)[0] : laneFor(system, partId);
    let p = pos;
    for (const s of lane?.sounds ?? []) {
      p += s.gap ?? 0; // leading silence: a sparse set lane's blank space
      const vol = s.silent ? null : isKakegoe(s.name) ? KAKEGOE_VOLUME : effectiveVolume(s);
      events.push({
        lineId: lane.id,
        soundId: s.id,
        name: s.name,
        hand: s.hand,
        skin: s.skin, // selects the Katsugi front/back recording
        volume: vol != null && s.emphasis ? vol * 1.5 : vol,
        startDiv: p,
        durationDiv: s.duration,
      });
      p += s.duration;
    }
    pos += systemSpan(system);
  }
  return { events, totalDiv: pos };
}

/**
 * Builds one event stream per part, all on the same division timeline, so the
 * parts sound together. Each stream is exactly what `buildSequence` produces for
 * that part — every system anchors its lane at the system's start, which is what
 * keeps the parts in step when their lanes differ in length.
 *
 * With a single part this is `buildSequence` with one stream, including its
 * `totalDiv`, so solo playback is untouched.
 *
 * @param {Array<object>} lines - The piece's lines array (melody; exclude jiuchi sections first).
 * @param {Array<{ id: string, taiko: string, volume: number, muted: boolean }>} parts
 * @param {number} time - Divisions per beat.
 * @returns {{ streams: Array<{ partId: string, taiko: string, events: Array<object> }>, totalDiv: number }}
 */
export function buildPartSequences(lines, parts, time) {
  const list = parts?.length ? parts : [null];
  let totalDiv = 0;
  const streams = list.map((part) => {
    const { events, totalDiv: span } = buildSequence(lines, time, part?.id);
    totalDiv = Math.max(totalDiv, span);
    return { partId: part?.id ?? null, taiko: part?.taiko ?? null, events };
  });
  return { streams, totalDiv };
}

/**
 * Total span of a lines array in divisions: the sum of every system's span, with
 * block-repeats unrolled. Equals `buildSequence(...).totalDiv` for a single-part
 * score, and is the ensemble length when parts have differing lane lengths.
 * @param {Array<object>} lines
 * @returns {number}
 */
export function totalSpan(lines) {
  return expandRepeats(lines).reduce((sum, system) => sum + systemSpan(system), 0);
}

/** True for rows that close a jiuchi section's definition run. */
function endsJiuchiDefinition(item) {
  return item.type === 'heading' || item.type === 'divider' || item.type === 'jiuchi-section';
}

/**
 * Collects the set of line ids that belong to jiuchi-section definitions: a
 * jiuchi-section marker plus the contiguous rows after it, up to (but not
 * including) the next heading, divider, or jiuchi-section marker.
 * @param {Array<object>} lines
 * @returns {Set<string>} Ids of the markers and their definition lines.
 */
function jiuchiDefinitionIds(lines) {
  const ids = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'jiuchi-section') continue;
    ids.add(lines[i].id);
    for (let j = i + 1; j < lines.length && !endsJiuchiDefinition(lines[j]); j++) {
      ids.add(lines[j].id);
    }
  }
  return ids;
}

/**
 * Removes jiuchi-section markers and their definition lines from a lines array,
 * leaving the linear melody. The base rhythm those lines define is played
 * separately as a looping underlay (see {@link jiuchiRegions}). Block-repeat
 * markers whose member lines are all part of jiuchi definitions are dropped too;
 * markers with a partial overlap keep their remaining members (the same
 * partial-repeat limitation already accepted in {@link blockRepeatSlice}).
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @returns {Array<object>} Lines with jiuchi-section content removed.
 */
export function excludeJiuchiSections(lines) {
  const excluded = jiuchiDefinitionIds(lines);
  if (!excluded.size) return lines;
  return lines.filter((l) => {
    if (excluded.has(l.id)) return false;
    if (l.type === 'block-repeat') return l.lineIds.some((id) => !excluded.has(id));
    return true;
  });
}

/**
 * Computes the inline jiuchi regions over the main-sequence timeline. Each
 * jiuchi-section marker starts a region whose looping rhythm is captured from the
 * marker's definition lines (the rows up to the next heading/divider/section).
 * The region underlays the score from the marker's position until the next
 * jiuchi-section marker (persisting across headings/dividers), played with the
 * marker's own taiko.
 *
 * `startDiv`/`endDiv` are positions in the main sequence — i.e. the timeline of
 * {@link buildSequence}({@link excludeJiuchiSections}(lines)) — so the regions
 * align with the audible score. Sections whose definition yields no audible
 * events produce no region.
 *
 * Limitation: a block-repeat whose members straddle a jiuchi-section boundary is
 * split across segments and yields a partial repeat (consistent with the
 * {@link blockRepeatSlice} caveat).
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {number} time - Divisions per beat.
 * @returns {Array<{ startDiv: number, endDiv: number, events: Array<object>, lengthDiv: number, taiko: string }>}
 */
export function jiuchiRegions(lines, time) {
  // Partition the lines into segments split at each jiuchi-section marker.
  const segments = [];
  let seg = { marker: null, items: [] };
  for (const item of lines) {
    if (item.type === 'jiuchi-section') {
      segments.push(seg);
      seg = { marker: item, items: [] };
    } else {
      seg.items.push(item);
    }
  }
  segments.push(seg);

  const regions = [];
  let mainPos = 0; // accumulated main-sequence divisions
  for (const { marker, items } of segments) {
    // Definition = leading rows up to the first heading/divider; the rest is body
    // (the audible score this segment's jiuchi underlays).
    let split = items.findIndex(endsJiuchiDefinition);
    if (!marker || split < 0) split = marker ? items.length : 0;
    const def = marker ? items.slice(0, split) : [];
    const body = items.slice(marker ? split : 0);
    const bodyDur = totalSpan(body);
    if (marker && bodyDur > 0) {
      const { events, lengthDiv } = jiuchiEventsFromLines(def, time);
      if (events.length && lengthDiv > 0) {
        regions.push({
          startDiv: mainPos,
          endDiv: mainPos + bodyDur,
          events,
          lengthDiv,
          taiko: marker.taiko,
        });
      }
    }
    mainPos += bodyDur;
  }
  return regions;
}

/**
 * Captures a set of lines as a custom jiuchi's looped event list: the lines are
 * flattened via {@link buildSequence} (repeats unrolled, volumes resolved), rest
 * events are dropped, and per-score identifiers are stripped so the result is
 * independent of the source score. `lengthDiv` keeps the full span including
 * trailing rests, so the loop period is preserved.
 *
 * @param {Array<object>} lines - The lines to capture (a jiuchi section's definition lines).
 * @param {number} time - Divisions per beat.
 * @returns {{ events: Array<{ name: string, hand: string|undefined, skin: string|undefined, volume: number, startDiv: number, durationDiv: number }>, lengthDiv: number }}
 */
export function jiuchiEventsFromLines(lines, time) {
  const { events, totalDiv } = buildSequence(lines, time);
  return {
    events: events.filter((e) => e.volume != null).map(({ lineId: _l, soundId: _s, ...e }) => e),
    lengthDiv: totalDiv,
  };
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
 * Returns a jiuchi section's definition lines: the rows after the marker up to
 * (but excluding) the next heading, divider, or jiuchi-section marker. The marker
 * itself is omitted so the slice is plain melody — passing it to
 * {@link buildSequence} plays the base rhythm once through with no looping.
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {string} sectionId - The id of the jiuchi-section marker row.
 * @returns {Array<object>} The definition lines (empty if the marker is missing/invalid).
 */
export function jiuchiSectionSlice(lines, sectionId) {
  const start = lines.findIndex((l) => l.id === sectionId);
  if (start < 0 || lines[start].type !== 'jiuchi-section') return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (endsJiuchiDefinition(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/**
 * The practice-loop source that chains every jiuchi section in the score, rather
 * than naming one marker. Marker ids are UUIDs, so it cannot collide with one.
 */
export const ALL_JIUCHI_SECTIONS = 'all';

/**
 * Resolves a practice-loop source to a self-contained looping rhythm: one jiuchi
 * section named by its marker id, or {@link ALL_JIUCHI_SECTIONS} to chain every
 * section in the score back to back into a single longer cycle. Combines the
 * section lookup, the definition slice, and the event capture so a caller only
 * needs the source, and each event carries the taiko of the section it came from
 * so a chained loop switches drum as it goes.
 *
 * A section contributes its whole span even when it is all rests, so authored
 * silence between sections survives chaining; sections with no span at all (an
 * empty definition) are skipped. Returns null for every unusable case — no
 * source, an id that is not a jiuchi-section marker, nothing audible in the
 * result — so the caller can fall back to ticks.
 *
 * @param {Array<object>} lines - The piece's lines array.
 * @param {string|null|undefined} source - A jiuchi-section marker id, or
 *   {@link ALL_JIUCHI_SECTIONS}.
 * @param {number} time - Divisions per beat (4 straight, 3 swing).
 * @returns {{ events: Array<object>, lengthDiv: number }|null} The one-cycle
 *   rhythm, each event tagged with its section's `taiko`, or null.
 */
export function jiuchiPracticeLoop(lines, source, time) {
  if (!source) return null;
  const markers =
    source === ALL_JIUCHI_SECTIONS
      ? lines.filter((l) => l.type === 'jiuchi-section')
      : lines.filter((l) => l.id === source && l.type === 'jiuchi-section');
  if (!markers.length) return null;

  const events = [];
  let lengthDiv = 0;
  for (const marker of markers) {
    const cycle = jiuchiEventsFromLines(jiuchiSectionSlice(lines, marker.id), time);
    if (!(cycle.lengthDiv > 0)) continue;
    for (const e of cycle.events) {
      events.push({ ...e, startDiv: e.startDiv + lengthDiv, taiko: marker.taiko });
    }
    lengthDiv += cycle.lengthDiv;
  }
  return events.length ? { events, lengthDiv } : null;
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
