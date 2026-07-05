import m from 'mithril';
import { scoreStore } from '../data/scoreStore.js';
import { isSoundLine } from '../data/piece.js';
import { showToast } from './Toast.jsx';

// Show the filter input only when the list is long enough for scanning to hurt.
const SEARCH_THRESHOLD = 6;

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function LoadScoreSheet() {
  let query = '';

  return {
    view({ attrs: { onClose, onLoaded } }) {
      const items = [...scoreStore.items].sort((a, b) => b.savedAt - a.savedAt);
      const q = query.trim().toLowerCase();
      const filtered = q
        ? items.filter((s) => (s.title || 'Untitled').toLowerCase().includes(q))
        : items;

      return m(
        'div',
        { class: 'fixed inset-0 z-40 bg-black/50 flex flex-col justify-end', onclick: onClose },
        m(
          'div',
          {
            class:
              'bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto',
            onclick: (e) => e.stopPropagation(),
          },
          [
            m('div', { class: 'flex justify-center pt-3 pb-1' }, [
              m('div', { class: 'w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full' }),
            ]),
            m('div', { class: 'px-5 pb-8' }, [
              m('div', { class: 'flex items-center justify-between mb-4' }, [
                m('h2', { class: 'text-xl font-bold dark:text-white' }, 'Saved scores'),
                m(
                  'button',
                  {
                    class:
                      'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center',
                    onclick: onClose,
                    'aria-label': 'Close',
                  },
                  '×'
                ),
              ]),
              items.length >= SEARCH_THRESHOLD
                ? m('input', {
                    class:
                      'w-full mb-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white px-3 py-2 text-sm',
                    type: 'search',
                    placeholder: 'Search scores…',
                    value: query,
                    oninput: (e) => {
                      query = e.target.value;
                    },
                  })
                : null,
              items.length === 0
                ? m(
                    'p',
                    { class: 'text-sm text-gray-500 dark:text-gray-400 text-center py-8' },
                    'No saved scores yet.'
                  )
                : filtered.length === 0
                  ? m(
                      'p',
                      { class: 'text-sm text-gray-500 dark:text-gray-400 text-center py-8' },
                      'No scores match your search.'
                    )
                  : filtered.map((score) => {
                      const lineCount = (score.lines ?? []).filter(isSoundLine).length;
                      return m(
                        'div',
                        {
                          key: score.id,
                          class:
                            'flex items-center gap-3 py-3 border-b border-gray-200 dark:border-gray-700',
                        },
                        [
                          score.icon
                            ? m('img', {
                                src: score.icon,
                                class: 'w-10 h-10 rounded-lg object-cover shrink-0',
                                alt: '',
                                'aria-hidden': 'true',
                              })
                            : null,
                          m('div', { class: 'flex-1 min-w-0' }, [
                            m(
                              'div',
                              { class: 'font-medium dark:text-white truncate' },
                              score.title || 'Untitled'
                            ),
                            m(
                              'div',
                              { class: 'text-xs text-gray-400 dark:text-gray-500 mt-0.5' },
                              `${formatDate(score.savedAt)} · ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
                            ),
                          ]),
                          m(
                            'button',
                            {
                              class:
                                'shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold',
                              onclick: async () => {
                                if (!scoreStore.confirmDiscard()) return;
                                await scoreStore.loadScore(score.id);
                                onLoaded?.();
                                onClose();
                              },
                            },
                            'Load'
                          ),
                          m(
                            'button',
                            {
                              class: 'shrink-0 text-red-400 hover:text-red-600 text-sm px-2 py-1.5',
                              title: 'Delete',
                              'aria-label': `Delete ${score.title || 'Untitled'}`,
                              onclick: () => {
                                // Reversible via the toast, so no blocking confirm.
                                scoreStore.delete(score.id);
                                showToast(`Deleted "${score.title || 'Untitled'}"`, {
                                  actionLabel: 'Undo',
                                  onAction: () => scoreStore.restoreScore(score),
                                });
                              },
                            },
                            '✕'
                          ),
                        ]
                      );
                    }),
            ]),
          ]
        )
      );
    },
  };
}
