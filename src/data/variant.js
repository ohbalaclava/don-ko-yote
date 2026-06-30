import m from 'mithril';

// Hash-based app variants. The URL hash (e.g. `#shiberoku`) selects an optional
// variant that toggles in-progress or experimental content anywhere in the app.
// This module is the generic primitive — it knows nothing about what each
// variant unlocks. Feature code reads `hasVariant(name)` and gates its own UI
// (e.g. jiuchi gating lives in symbolSets.js). The data layer should stay
// variant-agnostic so toggling a variant never invalidates stored data.

/** Current variant name from the URL hash (without '#'), lowercased; '' if none. */
export function variant() {
  return location.hash.slice(1).toLowerCase();
}

/** True when the named variant is active in the URL hash. */
export function hasVariant(name) {
  return variant() === name.toLowerCase();
}

// Live swap: re-render when the user edits the hash in place, no reload needed.
// Guarded for non-browser (test) environments where `window` is absent.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => m.redraw());
}
