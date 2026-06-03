/**
 * Returns true when pos lies exactly on a beat boundary.
 * Positions accumulate in integer divisions; one full beat is `time` divisions.
 * @param {number} pos - Cumulative position in divisions.
 * @param {number} time - Divisions per beat (e.g. 4 for straight, 3 for swing).
 * @returns {boolean}
 */
export function isIntegerBeat(pos, time) {
  return pos % time === 0;
}

/**
 * Greedily packs labelled spans into the fewest horizontal tracks so that no two
 * spans on the same track overlap. Spans are placed in the given array order; each
 * goes on the first track whose previously-placed span ends at or before this span's
 * start, otherwise on a new track. Units (px, mm) are the caller's concern.
 * @param {Array<{ start: number, end: number }>} spans
 * @returns {{ tracks: number[], trackCount: number }} `tracks[i]` is the track index
 *   assigned to `spans[i]`; `trackCount` is the number of tracks used.
 */
export function packIntoTracks(spans) {
  const trackEnds = [];
  const tracks = spans.map(({ start, end }) => {
    let track = 0;
    while (track < trackEnds.length && trackEnds[track] > start) track++;
    trackEnds[track] = end;
    return track;
  });
  return { tracks, trackCount: trackEnds.length };
}

/**
 * Returns the effective volume for a sound (1–8), or null for rests (no hand).
 * Falls back to the casing rule for sounds loaded from old scores without a stored volume.
 * @param {object} sound
 * @returns {number|null}
 */
export function effectiveVolume(sound) {
  if (sound.hand == null) return null;
  return sound.volume ?? (sound.name === sound.name.toUpperCase() ? 4 : 2);
}

/**
 * Groups a flat sound array into ligature display items using the same auto-pairing
 * rules as the line-level display: adjacent sounds qualify when they share the same
 * beat, alternate hands, and (even time only) share the same duration. A sound with
 * `ligature: true` is force-joined to the previous group; `ligature: false` breaks it.
 * Groups of one are emitted as `{ sound, startPos }` single items.
 * @param {Array} sounds
 * @param {number} time - Divisions per beat.
 * @param {number} [offset=0] - Absolute position of the first sound in the line,
 *   used for beat-boundary detection and returned in each item's `startPos`.
 * @returns {Array<{ sound: object, startPos: number } | { sounds: object[], startPos: number }>}
 */
export function groupIntoLigatures(sounds, time, offset = 0) {
  const items = [];
  let pos = offset;
  let i = 0;
  while (i < sounds.length) {
    const s = sounds[i];
    const startPos = pos;
    pos += s.duration;
    i++;
    const group = [s];
    const dur = s.duration;
    while (i < sounds.length) {
      const next = sounds[i];
      if (next.ligature === false) break;
      if (next.ligature === true) {
        group.push(next);
        pos += next.duration;
        i++;
        continue;
      }
      if (time % 2 === 0 && next.duration !== dur) break;
      if (Math.floor((pos - dur) / time) !== Math.floor(pos / time)) break;
      if (next.hand !== group[group.length - 1].hand) {
        group.push(next);
        pos += next.duration;
        i++;
      } else break;
    }
    items.push(group.length === 1 ? { sound: group[0], startPos } : { sounds: group, startPos });
  }
  return items;
}

/**
 * Produces the per-line display items for rendering.
 *
 * In proportional mode each sound is emitted as its own `{ sound, startPos }`
 * item (no ligature grouping, no beat markers — tiles carry their own dots).
 *
 * In non-proportional mode sounds are grouped via {@link groupIntoLigatures},
 * and a `{ type: 'beat-marker', beat }` item is inserted after a tile for every
 * beat boundary strictly inside its trailing sound's span. Ligature tiles render
 * their own internal beat dots where a member *starts* on a beat; a beat landing
 * mid-way through the ligature's last member instead falls in the gap after the
 * tile (only the last member's end coincides with a tile boundary).
 * @param {Array} sounds
 * @param {boolean} proportional
 * @param {number} time - Divisions per beat.
 * @returns {Array}
 */
/** Total duration (in divisions) of a list of sounds. */
function sumDuration(sounds) {
  return sounds.reduce((s, x) => s + x.duration, 0);
}

export function groupSoundsForDisplay(sounds, proportional, time) {
  if (proportional) {
    let pos = 0;
    return sounds.map((s) => {
      const startPos = pos;
      pos += s.duration;
      return { sound: s, startPos };
    });
  }

  const items = [];
  for (const item of groupIntoLigatures(sounds, time)) {
    items.push(item);
    // The trailing sound is the only one whose end coincides with the tile's right
    // edge, so a beat strictly inside it lands in the gap after the tile. For a
    // single tile that's the sound itself; for a ligature it's the last member
    // (interior beats of earlier members would fall inside the seamless tile and
    // are rendered as start-of-member dots by LigatureTile instead).
    const last = 'sound' in item ? item.sound : item.sounds[item.sounds.length - 1];
    const end = item.startPos + ('sound' in item ? item.sound.duration : sumDuration(item.sounds));
    const lastStart = end - last.duration;
    for (let beat = Math.floor(lastStart / time) + 1; beat * time < end; beat++) {
      items.push({ type: 'beat-marker', beat });
    }
  }
  return items;
}
