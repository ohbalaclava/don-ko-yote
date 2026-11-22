// Taiko sets: the drums one player plays. A set is a group of parts sharing a
// `setId`, and the thing that makes it special is the player — one person, two
// hands — so the set's lanes are read as a single timeline rather than as
// independent parts. Everything here is pure and keyed on `setId` **membership**,
// deliberately not on the consecutive runs `System.jsx` / `pdf.js` bracket for
// display: `reorderPart` can split a run, and a split run is still one player.
//
// Positions are in divisions and are always **system-local**: a set's cursor and
// its conflicts are computed inside one system, since `systemSpan` is what keeps
// lanes from drifting across systems.

import { lanesOf, laneDur } from './piece.js';
import { isKakegoe } from './kakegoe.js';

/** Rest symbol names, in preference order within a symbol set. These are the only
 *  hand-less symbols that are true silence — `[HU]` and the kakegoe calls are also
 *  hand-less but are vocal, not rests. */
const REST_NAMES = new Set(['SU', 'su', "s'", "'", 'un']);

/** Highest beat number the `implicit` tile's editor stepper can reach; past it the
 *  tile shows its neutral `—` face (see `SoundTile`'s Stepper). */
const MAX_BEAT_NAME = 8;

/**
 * The set a lane belongs to, via its part.
 * @param {Array} parts - `piece.parts`.
 * @param {{ partId: ?string }} lane
 * @returns {string|null} The `setId`, or null for an independent part / a jiuchi
 *   definition lane (`partId: null`).
 */
export function setIdForLane(parts, lane) {
  if (!lane?.partId) return null;
  return parts.find((p) => p.id === lane.partId)?.setId ?? null;
}

/**
 * The lanes of one system belonging to one set, in `piece.parts` order (top → bottom
 * as drawn), regardless of where the lanes sit in the system.
 * @param {object} system - A `piece.lines` sound row.
 * @param {Array} parts - `piece.parts`.
 * @param {string} setId
 * @returns {Array} Lane objects.
 */
export function setLanes(system, parts, setId) {
  if (!setId) return [];
  const order = new Map(parts.map((p, i) => [p.id, i]));
  return lanesOf(system)
    .filter((l) => setIdForLane(parts, l) === setId)
    .sort((a, b) => (order.get(a.partId) ?? 0) - (order.get(b.partId) ?? 0));
}

/**
 * The set's shared cursor: the division at which the player's next strike lands,
 * whichever drum of the set it is played on. That is the end of the set's *combined*
 * timeline — the longest of its lanes — so a new sound never lands under something
 * the player is already playing on another drum.
 * @param {object} system
 * @param {Array} parts
 * @param {string} setId
 * @returns {number} Divisions from the start of the system; 0 for an empty set.
 */
export function setCursor(system, parts, setId) {
  return setLanes(system, parts, setId).reduce((max, l) => Math.max(max, laneDur(l)), 0);
}

/** True when a sound is an actual strike of a stick on a drum: it has a hand, it is
 *  not a vocal call, and it has not been silenced. Rests have no hand at all. */
function isStrike(sound) {
  return sound.hand != null && !sound.silent && !isKakegoe(sound.name);
}

/**
 * The set's playing path: every strike across the set's lanes on one timeline,
 * ordered as the player performs them. Rests, kakegoe calls and silenced sounds are
 * omitted — they occupy time on a lane but the player's hands are free.
 * @param {object} system
 * @param {Array} parts
 * @param {string} setId
 * @returns {Array<{ partId: string, soundId: string, hand: string, startDiv: number,
 *   durationDiv: number }>} Sorted by `startDiv`, ties broken in part order.
 */
export function setStream(system, parts, setId) {
  const out = [];
  for (const [laneIdx, lane] of setLanes(system, parts, setId).entries()) {
    let pos = 0;
    for (const s of lane.sounds ?? []) {
      pos += s.gap ?? 0;
      if (isStrike(s)) {
        out.push({
          partId: lane.partId,
          soundId: s.id,
          hand: s.hand,
          startDiv: pos,
          durationDiv: s.duration,
          _lane: laneIdx,
        });
      }
      pos += s.duration;
    }
  }
  out.sort((a, b) => a.startDiv - b.startDiv || a._lane - b._lane);
  return out.map(({ _lane, ...rest }) => rest);
}

/**
 * The division a set lane's strike should start at so the player strikes it
 * *together* with the set's previous strike on another of their drums — the
 * "align to cursor" target. Authoring appends to the set's shared cursor, which
 * is what keeps a set reading as one path, so simultaneity is never a by-product
 * of adding a sound: this is how the author asks for it afterwards.
 *
 * The target is the latest strike on another of the set's lanes that starts
 * before this one and no earlier than the end of this lane's own previous sound
 * — a lane is sequential, so a sound cannot move back past its neighbour. Null
 * when there is no such strike (nothing to pair with, or no room), when the
 * sound already starts with one, or when it is not a strike at all.
 * @param {object} system
 * @param {Array} parts - `piece.parts`.
 * @param {string} laneId
 * @param {string} soundId
 * @returns {number|null} Divisions from the start of the system.
 */
export function alignDiv(system, parts, laneId, soundId) {
  const lane = lanesOf(system).find((l) => l.id === laneId);
  const setId = lane ? setIdForLane(parts, lane) : null;
  if (!setId) return null;

  let prevEnd = 0;
  let start = null;
  for (const s of lane.sounds ?? []) {
    const at = prevEnd + (s.gap ?? 0);
    if (s.id === soundId) {
      if (!isStrike(s)) return null;
      start = at;
      break;
    }
    prevEnd = at + s.duration;
  }
  if (start == null) return null;

  let best = null;
  for (const st of setStream(system, parts, setId)) {
    if (st.partId === lane.partId) continue;
    if (st.startDiv >= start || st.startDiv < prevEnd) continue;
    if (best == null || st.startDiv > best) best = st.startDiv;
  }
  return best;
}

/** The hands a strike occupies. `'B'` (both sticks together — `KI`/`ki`) occupies
 *  both, so it is fine alone and conflicts with anything else sounding. */
function handsOf(strike) {
  return strike.hand === 'B' ? ['L', 'R'] : [strike.hand];
}

/**
 * Two-hand violations in a system: places where the set's notation asks one player
 * for more than two sticks, or for the same hand twice at once. Advisory only —
 * nothing blocks the edit, the author is shown the clash and picks the partner
 * stroke themselves.
 *
 * A conflict is judged at each strike's start division, over the strikes sounding
 * there (`start <= div < start + duration`), so a strike ending exactly where the
 * next begins is clean:
 * - `too-many` — three or more strikes sounding at once, whatever their hands.
 * - `same-hand` — two strikes beginning together that need the same hand.
 * - `hand-busy` — a strike begins on a hand that is still mid-stroke.
 * @param {object} system
 * @param {Array} parts - `piece.parts`.
 * @returns {Array<{ soundIds: string[], div: number, kind: string }>} Ordered by `div`.
 */
export function setConflicts(system, parts) {
  const out = [];
  const setIds = [...new Set(parts.map((p) => p.setId).filter(Boolean))];
  for (const setId of setIds) {
    const stream = setStream(system, parts, setId);
    const seen = new Set();
    for (const s of stream) {
      const div = s.startDiv;
      const active = stream.filter((x) => x.startDiv <= div && div < x.startDiv + x.durationDiv);
      if (active.length < 2) continue;
      const soundIds = active.map((x) => x.soundId);
      const key = `${div}:${soundIds.join(',')}`;
      if (seen.has(key)) continue;

      let kind = null;
      if (active.length > 2) {
        kind = 'too-many';
      } else {
        const [a, b] = active;
        const shares = handsOf(a).some((h) => handsOf(b).includes(h));
        if (shares) kind = a.startDiv === b.startDiv ? 'same-hand' : 'hand-busy';
      }
      if (!kind) continue;
      seen.add(key);
      out.push({ soundIds, div, kind });
    }
  }
  return out.sort((a, b) => a.div - b.div);
}

/** The symbol set's own rests, longest first, as `{ name, duration }`. Ties keep the
 *  symbol set's own order, so each drum family fills a sub-beat with its own idiom. */
function restSymbols(symbolSet) {
  return (symbolSet?.symbols ?? [])
    .filter((s) => REST_NAMES.has(s.name))
    .map((s, i) => ({ name: s.name, duration: s.duration, _i: i }))
    .sort((a, b) => b.duration - a.duration || a._i - b._i);
}

/** Greedily composes `divs` divisions of silence from a symbol set's rests. Returns
 *  the sounds it managed to make — nothing, if the set has no small enough rest. */
function fillWithRests(symbolSet, divs) {
  const rests = restSymbols(symbolSet);
  const out = [];
  let left = divs;
  while (left > 0) {
    const r = rests.find((x) => x.duration <= left);
    if (!r) break;
    out.push({ name: r.name, duration: r.duration });
    left -= r.duration;
  }
  return out;
}

/**
 * Turns a stretch of a set lane's blank space into real rest sounds — the fill used
 * when a part leaves its set and goes back to being an ordinary contiguous lane.
 *
 * Whole beats become the numbered `implicit` tile (the `—` tile whose editor steps
 * its name through 1-8), named for the beat's 1-indexed position **within the
 * system**, so the materialised rests read as the count the player would speak;
 * past beat 8 the tile keeps its neutral `—` face. Anything short of a whole beat
 * — at either end, since a gap need not be beat-aligned — falls back to the symbol
 * set's own rests.
 * @param {object} symbolSet - The lane's symbol set (`piece.activeSymbolSet` shape).
 * @param {number} startDiv - Where the silence begins, in divisions from the start
 *   of the system.
 * @param {number} divs - Length of the silence in divisions.
 * @param {number} time - Divisions per beat.
 * @returns {Array<{ name: string, duration: number, implicit?: boolean }>} Symbol-shaped
 *   objects (no ids) totalling `divs`, ready for `piece.addSound`.
 */
export function restsForGap(symbolSet, startDiv, divs, time) {
  if (!(divs > 0)) return [];
  const out = [];
  let pos = startDiv;
  let left = divs;

  // Lead-in: silence starting mid-beat cannot be a numbered beat tile.
  const toBeat = (time - (pos % time)) % time;
  if (toBeat > 0) {
    const lead = Math.min(toBeat, left);
    out.push(...fillWithRests(symbolSet, lead));
    pos += lead;
    left -= lead;
  }

  while (left >= time) {
    const beat = Math.floor(pos / time) + 1;
    out.push({ name: beat > MAX_BEAT_NAME ? '—' : String(beat), duration: time, implicit: true });
    pos += time;
    left -= time;
  }

  if (left > 0) out.push(...fillWithRests(symbolSet, left));
  return out;
}

/**
 * The holes in a set's combined timeline: spans of one system where **no** lane of
 * the set plays anything at all.
 *
 * Silence inside a set is never authored as blank — a blank lane means *this drum is
 * not being struck here, another one is*, and real silence is a rest sound, which
 * occupies its span. So a span the whole set is blank through is a hole left by an
 * edit rather than music, and `piece`'s move mutators close it. Trailing silence past
 * the set's last sound is not a hole: it has no representation, and it is where the
 * player's next strike lands.
 * @param {object} system
 * @param {Array} parts - `piece.parts`.
 * @param {string} setId
 * @returns {Array<{ startDiv: number, divs: number }>} Ordered, non-adjacent spans;
 *   empty for a set with no music.
 */
export function setBlankSpans(system, parts, setId) {
  const spans = [];
  const occupied = [];
  for (const lane of setLanes(system, parts, setId)) {
    let pos = 0;
    for (const s of lane.sounds ?? []) {
      pos += s.gap ?? 0;
      occupied.push([pos, pos + s.duration]);
      pos += s.duration;
    }
  }
  occupied.sort((a, b) => a[0] - b[0]);
  let end = 0;
  for (const [start, stop] of occupied) {
    if (start > end) spans.push({ startDiv: end, divs: start - end });
    end = Math.max(end, stop);
  }
  return spans;
}
