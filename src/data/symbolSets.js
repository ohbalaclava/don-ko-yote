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
