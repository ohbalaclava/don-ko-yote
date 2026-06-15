import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { resolvePattern } from '../data/symbolSets.js';
import { formatBeats } from '../util.js';

export function JiuchiPatternsSheet() {
  return {
    view({ attrs: { onClose } }) {
      const symbolSet = piece.symbolSet;
      const patterns = (symbolSet.patterns ?? []).map((p) => resolvePattern(p, symbolSet));
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
                m('div', [
                  m('h2', { class: 'text-xl font-bold dark:text-white' }, 'Jiuchi patterns'),
                  m('p', { class: 'text-xs text-gray-500 dark:text-gray-400' }, piece.jiuchi),
                ]),
                m(
                  'button',
                  {
                    class:
                      'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center',
                    onclick: onClose,
                  },
                  '×'
                ),
              ]),

              !piece.selectedLineId
                ? m(
                    'p',
                    { class: 'text-sm text-amber-600 dark:text-amber-400 mb-4' },
                    'Select a line in the score first, then tap a pattern to add it.'
                  )
                : null,

              m(
                'div',
                { class: 'flex flex-col gap-1.5' },
                patterns.map((p) => {
                  const dur = formatBeats(
                    p.sounds.reduce((s, x) => s + x.duration, 0),
                    piece.time
                  );
                  return m(
                    'button',
                    {
                      key: p.name,
                      class: `flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${piece.selectedLineId ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700 hover:border-purple-400 dark:hover:border-purple-500 active:bg-purple-100 dark:active:bg-purple-900/40' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'}`,
                      onclick: () => {
                        if (!piece.selectedLineId) return;
                        piece.addGroup(piece.selectedLineId, p);
                        onClose();
                      },
                    },
                    [
                      m(
                        'span',
                        {
                          class: `font-bold text-purple-800 dark:text-purple-300 font-${settings.font}`,
                        },
                        p.name
                      ),
                      m(
                        'span',
                        { class: 'text-xs text-purple-400 dark:text-purple-500 ml-4' },
                        `${dur}b`
                      ),
                    ]
                  );
                })
              ),
            ]),
          ]
        )
      );
    },
  };
}
