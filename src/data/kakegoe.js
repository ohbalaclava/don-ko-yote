// Kakegoe (vocal calls) shared across every symbol set: HUP, HA, SO, RE, sore.
// These carry no hand in the symbol sets, so by the usual rest rule they would be
// silent; the playback layer treats them as audible vocal samples instead (one
// shared recording per call, independent of the taiko). This module is the single
// source of truth for which names are calls — imported by both the sequence builder
// (to make them audible) and the sample resolver (to route them to their sample).

/** Base syllables of the calls, after stripping articulation marks (apostrophes,
 *  brackets). The swing sets write `so're`; it normalises to `sore`. Case-sensitive
 *  so the lowercase strike `re` is never mistaken for the `RE` call. */
const CALL_KEYS = new Set(['HUP', 'HA', 'SO', 'RE', 'sore']);

/** Playback volume for a kakegoe call (1–8). A neutral mid value: the recordings
 *  carry their own level, and there is no synth voice for calls. */
export const KAKEGOE_VOLUME = 4;

/**
 * Strips a sound name to its bare syllables (drops apostrophes, brackets, spaces),
 * preserving case. Used to fold articulation variants (`TE'`→`TE`, `so're`→`sore`)
 * onto a single key for both call detection and sample lookup.
 * @param {string} name
 * @returns {string}
 */
export function baseSyllable(name) {
  return (name || '').replace(/[^a-z]/gi, '');
}

/**
 * True when a sound name is a kakegoe vocal call (HUP/HA/SO/RE/sore, including the
 * swing `so're` variant). Bracketed/silent forms like `[HU]` do not match.
 * @param {string} name
 * @returns {boolean}
 */
export function isKakegoe(name) {
  return CALL_KEYS.has(baseSyllable(name));
}
