// Add/remove visual feedback for tiles and lines. A single id-set diff at commit
// time decides which sounds/rows just appeared or are about to vanish, so the
// components only have to consume the result in their lifecycle hooks.
//
// Why diff ids centrally instead of marking them in each add*/remove* method: a
// drag-move keeps the sound's id (present before and after), so it falls out of
// both the added and removed sets automatically and never animates as a
// remove+add. New mutation methods get the behaviour for free.

const ENTER_CLASS = 'anim-enter';
const LEAVE_CLASS = 'anim-leave';
// Slightly longer than the CSS animation (160ms) so flashOut still resolves if
// `animationend` never fires (e.g. reduced-motion zeroes the duration, or the
// node is hidden mid-animation).
const LEAVE_FALLBACK_MS = 250;

let baseline = new Set();
const added = new Set();
const removed = new Set();

/**
 * Collects every animatable id in a lines array: each row/item id plus each
 * contained sound id.
 * @param {Array<object>} lines
 * @returns {Set<string>}
 */
function collectIds(lines) {
  const ids = new Set();
  for (const item of lines) {
    ids.add(item.id);
    if (item.sounds) for (const s of item.sounds) ids.add(s.id);
  }
  return ids;
}

export const anim = {
  /**
   * Reconciles the current lines against the previous baseline. With
   * `animate: true`, ids that newly appeared are queued for an enter animation
   * and ids that vanished for a leave animation; with `animate: false` the
   * baseline is just reset (used on wholesale loads/new/clear so opening a
   * score doesn't animate every tile at once). The baseline always updates.
   * @param {Array<object>} lines
   * @param {{ animate?: boolean }} [opts]
   */
  sync(lines, { animate = true } = {}) {
    const current = collectIds(lines);
    if (animate) {
      // Append rather than clobber: a previous redraw may not have consumed the
      // sets yet (e.g. two commits before paint).
      for (const id of current) if (!baseline.has(id)) added.add(id);
      for (const id of baseline) if (!current.has(id)) removed.add(id);
    }
    baseline = current;
  },

  /**
   * One-shot check: true if `id` was queued for an enter animation, clearing it
   * so an unrelated later redraw of the same surviving node won't re-animate.
   * @param {string} id
   * @returns {boolean}
   */
  consumeAdded(id) {
    return added.delete(id);
  },

  /**
   * One-shot check for a queued leave animation (see consumeAdded).
   * @param {string} id
   * @returns {boolean}
   */
  consumeRemoved(id) {
    return removed.delete(id);
  },

  /**
   * Plays the enter animation on a freshly-created element.
   * @param {HTMLElement} el
   */
  flashIn(el) {
    el.classList.add(ENTER_CLASS);
    el.addEventListener('animationend', () => el.classList.remove(ENTER_CLASS), { once: true });
  },

  /**
   * Plays the leave animation and resolves when it finishes. Returned from a
   * Mithril `onbeforeremove` hook so the node lingers in the DOM for the
   * animation — that delay is the "about to be removed" feedback.
   * @param {HTMLElement} el
   * @returns {Promise<void>}
   */
  flashOut(el) {
    return new Promise((resolve) => {
      const done = () => resolve();
      el.addEventListener('animationend', done, { once: true });
      setTimeout(done, LEAVE_FALLBACK_MS);
      el.classList.add(LEAVE_CLASS);
    });
  },
};
