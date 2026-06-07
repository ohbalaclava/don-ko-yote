// Pure beat-grid logic for the optional playback metronome. The player schedules
// these ticks against the AudioContext clock (see audio/player.js); the engine
// renders each tick as a synth click or a Shime TEN sample (see audio/engine.js).

/**
 * Subdivision positions a jiuchi ticks on, 1-indexed within a beat of `time`
 * divisions. Gobu Gobu / Mitsu-uchi are straight (time 4); Shichisan is swing
 * (time 3), where 1 & 3 of a 3-division beat give the long-short feel.
 */
export const JIUCHI_PATTERNS = {
  'Gobu Gobu': [1, 3],
  'Mitsu-uchi': [1, 3, 4],
  Shichisan: [1, 3],
};

/**
 * Builds the metronome ticks over a sequence of `totalDiv` divisions.
 * @param {number} totalDiv - Total divisions to cover; ticks fall in [0, totalDiv).
 * @param {number} time - Divisions per beat (4 straight, 3 swing).
 * @param {object} opts
 * @param {number[]} opts.positions - 1-indexed subdivisions to tick on within each
 *   beat (from JIUCHI_PATTERNS). Positions past `time` are skipped.
 * @param {boolean} opts.headOnly - When true, ignore `positions` and tick only the
 *   beat head (subdivision 1).
 * @param {boolean} opts.emphasise - When true, the head of every beat is accented.
 * @returns {Array<{ div: number, accent: boolean }>} Ordered ticks.
 */
export function metronomeTicks(totalDiv, time, { positions, headOnly, emphasise }) {
  if (!(totalDiv > 0) || !(time > 0)) return [];
  const subs = headOnly ? [1] : positions;
  const ticks = [];
  const beats = Math.ceil(totalDiv / time);
  for (let b = 0; b < beats; b++) {
    for (const p of subs) {
      if (p > time) continue;
      const div = b * time + (p - 1);
      if (div >= totalDiv) continue;
      ticks.push({ div, accent: emphasise && p === 1 });
    }
  }
  return ticks;
}
