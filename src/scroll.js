import { piece, isSoundLine } from './data/piece.js';

/** Scrolls the first match of `selector` into view, if present, by the minimum amount. */
function scrollIntoViewIfPresent(selector) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Scrolls the add-row toolbar (+ Add line / heading / note / divider / jiuchi)
 * into view. The toolbar follows the selected line, so after adding a row this
 * keeps the buttons — and the freshly inserted row beside them — on screen. Runs
 * on the next frame, after the committed redraw patches the DOM (m.redraw's rAF is
 * registered before this one, so it runs first).
 */
export function scrollToScoreBottom() {
  requestAnimationFrame(() => scrollIntoViewIfPresent('.score-actions'));
}

/**
 * After an edit that adds sounds, keeps the active editing position on screen.
 * When the selected line is the last sound line — the usual case while building a
 * score — the bottom action bar is scrolled into view so it stays reachable;
 * otherwise the selected line itself is brought into view. `block: 'nearest'`
 * only moves when the target is off-screen, so adding to an already-visible line
 * doesn't jump the page. Runs on the next frame for the same reason as above.
 */
export function ensureEditTargetVisible() {
  requestAnimationFrame(() => {
    const lineId = piece.selectedLineId;
    if (!lineId) return;
    const idx = piece.lines.findIndex((l) => l.id === lineId);
    const isLast = idx !== -1 && !piece.lines.slice(idx + 1).some(isSoundLine);
    if (isLast) scrollIntoViewIfPresent('.score-actions');
    else scrollIntoViewIfPresent(`[data-line-id="${lineId}"]`);
  });
}
