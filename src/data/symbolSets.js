import { HIGH_STRAIGHT } from './symbols-high-straight.js';
import { HIGH_SWING } from './symbols-high-swing.js';
import { LOW_STRAIGHT } from './symbols-low-straight.js';
import { LOW_SWING } from './symbols-low-swing.js';

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

/** Taikos grouped by drum family (High vs Low), for picker UI. */
export const TAIKO_GROUPS = [
  { label: 'High', taikos: HIGH_STRAIGHT.taiko },
  { label: 'Low', taikos: LOW_STRAIGHT.taiko },
];

/**
 * All taikos usable with a given jiuchi, in first-seen order across the sets that
 * include that jiuchi (deduped by name). Used by the per-section taiko picker:
 * with the jiuchi fixed score-wide, these are the taikos a section can switch to.
 * @param {string} jiuchi
 * @returns {Array<{ name: string, skins: number }>}
 */
export function taikosForJiuchi(jiuchi) {
  const seen = new Set();
  const out = [];
  for (const set of SYMBOL_SETS) {
    if (!set.jiuchis.includes(jiuchi)) continue;
    for (const t of set.taiko) {
      if (!seen.has(t.name)) {
        seen.add(t.name);
        out.push(t);
      }
    }
  }
  return out;
}

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
