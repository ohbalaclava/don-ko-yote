import m from 'mithril';

const DEFAULT_DURATION = 5000;

let current = null; // { message, actionLabel, onAction }
let hideTimer = null;

/**
 * Shows a transient toast at the bottom of the screen, optionally with a single
 * action button (e.g. "Undo"). Showing a new toast replaces the current one.
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [opts]
 */
export function showToast(message, { actionLabel, onAction, duration = DEFAULT_DURATION } = {}) {
  clearTimeout(hideTimer);
  current = { message, actionLabel, onAction };
  hideTimer = setTimeout(() => {
    current = null;
    m.redraw();
  }, duration);
  m.redraw();
}

function dismiss() {
  clearTimeout(hideTimer);
  current = null;
  m.redraw();
}

/** Renders the active toast, if any. Mount once near the app root. */
export function Toast() {
  return {
    view() {
      if (!current) return null;
      return m(
        'div',
        {
          class:
            'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 dark:bg-gray-700 text-white rounded-xl shadow-2xl px-4 py-2.5 max-w-[calc(100vw-2rem)]',
          role: 'status',
        },
        [
          m('span', { class: 'text-sm truncate' }, current.message),
          current.actionLabel
            ? m(
                'button',
                {
                  class:
                    'text-sm font-semibold text-indigo-300 hover:text-indigo-200 shrink-0 uppercase tracking-wide',
                  onclick: () => {
                    const fn = current.onAction;
                    dismiss();
                    fn?.();
                  },
                },
                current.actionLabel
              )
            : null,
          m(
            'button',
            {
              class: 'text-gray-400 hover:text-white leading-none shrink-0',
              onclick: dismiss,
              'aria-label': 'Dismiss notification',
            },
            '✕'
          ),
        ]
      );
    },
  };
}
