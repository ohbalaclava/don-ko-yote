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
// A double-time straight-time jiuchi: each beat is a head strike on the beat
// (perfect time) plus one off-beat strike that splits the beat ~7:5. The off-beat
// isn't fixed — it drifts in a slow sine wave between straighter (6:6) and more
// swung (8:4), giving the groove a human breathing feel. The head never moves.
const SHIBEROKU_CENTRE = 7 / 12; // mean off-beat position: 7:5 into the beat
const SHIBEROKU_AMP = 1 / 48; // drift: 6/12 (straight) .. 8/12 (more swing)
const SHIBEROKU_PERIOD = 16; // beats per full in-and-out wave cycle

/**
 * Off-beat position within a beat for Shiberoku at beat index `b`, as a fraction
 * of the beat in (0, 1). Waves smoothly around 7/12 so the swing breathes in and
 * out across the piece rather than jumping.
 * @param {number} b - Beat index from the start of the sequence.
 * @returns {number} Off-beat position as a fraction of the beat.
 */
export function shiberokuOffset(b) {
  return SHIBEROKU_CENTRE + SHIBEROKU_AMP * Math.sin((2 * Math.PI * b) / SHIBEROKU_PERIOD);
}

/**
 * Builds Shiberoku metronome ticks over `totalDiv` divisions. Each beat gets a
 * head tick at the beat boundary (perfect time) and, unless `headOnly`, an
 * off-beat tick at a wave-modulated fractional position (see `shiberokuOffset`).
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
  for (let b = 0; b < beats; b++) {
    const head = b * time;
    if (head < totalDiv) ticks.push({ div: head, accent: !!emphasise });
    if (headOnly) continue;
    const off = b * time + time * shiberokuOffset(b);
    if (off < totalDiv) ticks.push({ div: off, accent: false });
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
