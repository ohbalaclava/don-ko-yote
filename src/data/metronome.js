// Pure beat-grid logic for the optional playback metronome. The player schedules
// these ticks against the AudioContext clock (see audio/player.js); the engine
// renders each tick as a synth click or a Shime TEN sample (see audio/engine.js).

/**
 * Subdivision positions a jiuchi ticks on, 1-indexed within a beat of `time`
 * divisions. Gobu Gobu / Mitsu-uchi are straight (time 4); Shichisan is swing
 * (time 3), where 1 & 3 of a 3-division beat give the long-short feel.
 * Shiberoku is not here — it ticks on fractional, wave-modulated positions that
 * don't fit the integer subdivision grid (see `shiberokuTicks`).
 */
export const JIUCHI_PATTERNS = {
  'Gobu Gobu': [1, 3],
  'Mitsu-uchi': [1, 3, 4],
  Shichisan: [1, 3],
};

/**
 * Resolves a `piece.metronomeJiuchi` value to a jiuchi name. 'auto' follows the
 * piece's own jiuchi; any other value is the name itself.
 * @param {string} value - The setting value ('auto' or a jiuchi name).
 * @param {{ jiuchi: string }} piece
 * @returns {string} The resolved jiuchi name.
 */
export function resolveJiuchi(value, piece) {
  return value === 'auto' ? piece.jiuchi : value;
}

/**
 * Resolves a standard `piece.metronomeJiuchi` value to its tick subdivisions.
 * 'auto' follows the piece's jiuchi; any other value is treated as a jiuchi name.
 * Unknown names fall back to ticking the beat head only. The 'inline' value is
 * handled separately by the player (per-region drum loops), not here.
 * @param {string} value - The setting value ('auto' or a standard jiuchi name).
 * @param {{ jiuchi: string }} piece
 * @returns {number[]} 1-indexed subdivisions to tick on.
 */
export function jiuchiPositions(value, piece) {
  return JIUCHI_PATTERNS[resolveJiuchi(value, piece)] ?? [1];
}

// --- Shiberoku ---------------------------------------------------------------
// A double-time straight-time jiuchi: four strikes per beat. The first and third
// (the beat head and the half-beat) are in perfect time; the second and fourth
// split their half-beat ~7:5. The swung strikes aren't fixed — they drift in a
// slow sine wave between straighter (6:6) and more swung (8:4), giving the
// groove a human breathing feel. The perfect-time strikes never move.
const SHIBEROKU_CENTRE = 7 / 12; // mean swung position: 7:5 into the half-beat
const SHIBEROKU_AMP = 1 / 100; // drift: 6/12 (straight) .. 8/12 (more swing)
const SHIBEROKU_PERIOD = 16; // beats per full in-and-out wave cycle

/**
 * Swung-strike position within a half-beat for Shiberoku at beat position `b`
 * (half-integer values sample the second half of a beat), as a fraction of the
 * half-beat in (0, 1). Waves smoothly around 7/12 so the swing breathes in and
 * out across the piece rather than jumping.
 * @param {number} b - Beat position from the start of the sequence (may be x.5).
 * @returns {number} Swung-strike position as a fraction of the half-beat.
 */
export function shiberokuOffset(b) {
  return SHIBEROKU_CENTRE + SHIBEROKU_AMP * Math.sin((2 * Math.PI * b) / SHIBEROKU_PERIOD);
}

/**
 * Builds Shiberoku metronome ticks over `totalDiv` divisions. Each beat gets four
 * ticks: the beat head and the half-beat in perfect time, plus (unless `headOnly`)
 * one wave-modulated swung tick inside each half (see `shiberokuOffset`).
 * `headOnly` reduces the beat to its head tick alone, like the other jiuchis.
 * @param {number} totalDiv - Total divisions to cover; ticks fall in [0, totalDiv).
 * @param {number} time - Divisions per beat (4 straight).
 * @param {object} opts
 * @param {boolean} opts.headOnly - When true, emit only the head tick per beat.
 * @param {boolean} opts.emphasise - When true, accent the head of every beat.
 * @returns {Array<{ div: number, accent: boolean }>} Ordered ticks (div may be fractional).
 */
export function shiberokuTicks(totalDiv, time, { headOnly, emphasise }) {
  if (!(totalDiv > 0) || !(time > 0)) return [];
  const ticks = [];
  const beats = Math.ceil(totalDiv / time);
  const half = time / 2;
  for (let b = 0; b < beats; b++) {
    const head = b * time;
    if (head < totalDiv) ticks.push({ div: head, accent: !!emphasise });
    if (headOnly) continue;
    for (let h = 0; h < 2; h++) {
      const start = head + h * half;
      // The half-beat strike (perfect time); the head itself is already pushed.
      if (h === 1 && start < totalDiv) ticks.push({ div: start, accent: false });
      const off = start + half * shiberokuOffset(b + h / 2);
      if (off < totalDiv) ticks.push({ div: off, accent: false });
    }
  }
  return ticks;
}

/**
 * Builds metronome ticks for a named jiuchi, dispatching the special-cased
 * Shiberoku wave to `shiberokuTicks` and everything else to the integer
 * subdivision grid (`metronomeTicks` + `JIUCHI_PATTERNS`).
 * @param {number} totalDiv - Total divisions to cover.
 * @param {number} time - Divisions per beat.
 * @param {string} name - Resolved jiuchi name.
 * @param {{ headOnly: boolean, emphasise: boolean }} opts
 * @returns {Array<{ div: number, accent: boolean }>} Ordered ticks.
 */
export function jiuchiTicks(totalDiv, time, name, opts) {
  if (name === 'Shiberoku') return shiberokuTicks(totalDiv, time, opts);
  return metronomeTicks(totalDiv, time, { ...opts, positions: JIUCHI_PATTERNS[name] ?? [1] });
}

/**
 * One seamless loop cycle of jiuchi ticks, for standalone metronome looping:
 * 1 beat for grid patterns (accents are per-beat, so nothing is lost), and
 * SHIBEROKU_PERIOD beats for Shiberoku — its swing wave is periodic there, so
 * the cycle joins without a jump.
 * @param {number} time - Divisions per beat (4 straight, 3 swing).
 * @param {string} name - Resolved jiuchi name.
 * @param {{ headOnly: boolean, emphasise: boolean }} opts
 * @returns {{ ticks: Array<{ div: number, accent: boolean }>, lengthDiv: number }}
 */
export function jiuchiLoop(time, name, { headOnly, emphasise }) {
  const beats = name === 'Shiberoku' ? SHIBEROKU_PERIOD : 1;
  const lengthDiv = beats * time;
  return { ticks: jiuchiTicks(lengthDiv, time, name, { headOnly, emphasise }), lengthDiv };
}

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
/**
 * Tiles a custom jiuchi's captured events across a sequence, for playing a
 * sounds-kind jiuchi as the base rhythm. The pattern repeats every `lengthDiv`
 * divisions; events whose start falls at or past `totalDiv` are dropped, so the
 * final repetition may be truncated.
 *
 * @param {number} totalDiv - Total divisions to cover; events fall in [0, totalDiv).
 * @param {Array<{ startDiv: number, [key: string]: * }>} events - One loop's events,
 *   positioned relative to the loop start.
 * @param {number} lengthDiv - The loop period in divisions (≥ max event startDiv + 1).
 * @returns {Array<object>} The tiled events, each with `div` (absolute position)
 *   replacing `startDiv`, other fields copied through.
 */
export function loopEvents(totalDiv, events, lengthDiv) {
  if (!(totalDiv > 0) || !(lengthDiv > 0)) return [];
  const out = [];
  for (let base = 0; base < totalDiv; base += lengthDiv) {
    for (const { startDiv, ...rest } of events) {
      const div = base + startDiv;
      if (div >= totalDiv) break;
      out.push({ div, ...rest });
    }
  }
  return out;
}

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
