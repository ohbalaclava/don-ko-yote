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
