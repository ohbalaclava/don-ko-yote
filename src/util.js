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
 * @returns {Array<{ sound: object, startPos: number } | { sounds: object[], startPos: number }>}
 */
/**
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
