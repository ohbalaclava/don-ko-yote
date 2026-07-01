import { HIGH_STRAIGHT } from './symbols-high-straight.js';
import { HIGH_SWING } from './symbols-high-swing.js';
import { LOW_STRAIGHT } from './symbols-low-straight.js';
import { LOW_SWING } from './symbols-low-swing.js';
import { hasVariant } from './variant.js';

export const SYMBOL_SETS = [HIGH_STRAIGHT, HIGH_SWING, LOW_STRAIGHT, LOW_SWING];

/**
 * Finds the symbol set whose taikos include `taiko` and whose jiuchis include `jiuchi`.
 * Returns null when no set matches the combination.
 * @param {string} taiko - Taiko display name (e.g. 'Shime').
 * @param {string} jiuchi - Jiuchi display name (e.g. 'Gobu Gobu').
 */
export function getSymbolSet(taiko, jiuchi) {
  return (
    SYMBOL_SETS.find((s) => s.taiko.some((t) => t.name === taiko) && s.jiuchis.includes(jiuchi)) ??
    null
  );
}

/**
 * Finds a symbol set by taiko and beat division (straight=4, swing=3), ignoring
 * the jiuchi. Used for jiuchi sections, which choose a taiko but inherit the
 * score's straight/swing feel rather than naming a jiuchi.
 * @param {string} taiko - Taiko display name.
 * @param {number} time - Divisions per beat.
 * @returns {object|null} The matching symbol set, or null.
 */
export function symbolSetForTaiko(taiko, time) {
  return SYMBOL_SETS.find((s) => s.time === time && s.taiko.some((t) => t.name === taiko)) ?? null;
}

/**
 * Returns the distinct taikos usable at the given beat division, grouped by drum
 * family (High vs Low) for picker UI. A taiko qualifies when some symbol set with
 * that `time` lists it, so a jiuchi section's taiko choices are constrained to the
 * score's straight/swing feel.
 * @param {number} time - Divisions per beat.
 * @returns {Array<{ label: string, taikos: Array<{ name: string, skins: number }> }>}
 */
export function taikoGroupsForTime(time) {
  const sets = SYMBOL_SETS.filter((s) => s.time === time);
  const pick = (family) => {
    const seen = new Set();
    const out = [];
    for (const s of sets) {
      if (s.id.split('-')[0] !== family) continue;
      for (const t of s.taiko) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        out.push(t);
      }
    }
    return out;
  };
  return [
    { label: 'High', taikos: pick('high') },
    { label: 'Low', taikos: pick('low') },
  ].filter((g) => g.taikos.length);
}

/**
 * A jiuchi's native beat division: the `time` of the first symbol set that lists
 * it (Shichisan is swing-only → 3; the straight jiuchis → 4). Used by the
 * standalone practice metronome, which has no score grid to align with and so
 * plays each jiuchi in its own feel.
 * @param {string} jiuchi - Jiuchi display name.
 * @returns {number|null} Divisions per beat, or null for an unknown name.
 */
export function timeForJiuchi(jiuchi) {
  return SYMBOL_SETS.find((s) => s.jiuchis.includes(jiuchi))?.time ?? null;
}

/** Taikos grouped by drum family (High vs Low), for picker UI. */
export const TAIKO_GROUPS = [
  { label: 'High', taikos: HIGH_STRAIGHT.taiko },
  { label: 'Low', taikos: LOW_STRAIGHT.taiko },
];

/**
 * Resolves a built-in pattern's sound names against a symbol set, returning
 * a pattern whose sounds are `{ name, hand, duration }` objects ready for
 * `piece.addGroup`. Sound names that aren't found are dropped.
 * @param {{ name: string, sounds: string[] }} pattern
 * @param {{ symbols: Array<{ name: string, hand?: string, duration: number, alternatives?: Array<{ hand?: string, duration: number }> }> }} symbolSet
 */
export function resolvePattern(pattern, symbolSet) {
  const sounds = pattern.sounds
    .map((soundName) => {
      const sym = symbolSet.symbols.find((s) => s.name === soundName);
      if (!sym) return null;
      const alt = sym.alternatives?.[0];
      return {
        name: sym.name,
        hand: sym.hand ?? alt?.hand,
        duration: sym.duration ?? alt?.duration,
      };
    })
    .filter(Boolean);
  return { name: pattern.name, sounds };
}

/** Maps a variant-gated jiuchi name to the hash variant that reveals it. */
const VARIANT_JIUCHIS = {
  Shiberoku: 'shiberoku',
};

/**
 * Filters jiuchi names down to those visible under the active hash variant.
 * Ungated jiuchis always pass; a gated one passes only when its variant is on.
 * The jiuchi stays a valid combo in the data layer either way, so a saved score
 * using a gated jiuchi still loads and plays without the variant.
 * @param {string[]} jiuchis
 * @returns {string[]}
 */
export function visibleJiuchis(jiuchis) {
  return jiuchis.filter((j) => !VARIANT_JIUCHIS[j] || hasVariant(VARIANT_JIUCHIS[j]));
}

/** All distinct jiuchi names across every set, in first-seen order. */
export const ALL_JIUCHIS = (() => {
  const seen = new Set();
  const out = [];
  for (const set of SYMBOL_SETS) {
    for (const j of set.jiuchis) {
      if (!seen.has(j)) {
        seen.add(j);
        out.push(j);
      }
    }
  }
  return out;
})();
