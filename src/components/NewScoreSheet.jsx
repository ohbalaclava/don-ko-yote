import m from 'mithril';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { scoreStore } from '../data/scoreStore.js';
import { TAIKO_GROUPS, ALL_JIUCHIS, getSymbolSet } from '../data/symbolSets.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';

export function NewScoreSheet() {
  let taiko;
  let jiuchi;
  let bpm;
  let beatsPerLine;

  return {
    oninit() {
      taiko = piece.taiko;
      jiuchi = piece.jiuchi;
      bpm = piece.bpm;
      beatsPerLine = piece.beatsPerLine;
    },
    view({ attrs: { onClose, onCreated } }) {
      const valid = !!getSymbolSet(taiko, jiuchi);

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
              m('div', { class: 'flex items-center justify-between mb-5' }, [
                m('h2', { class: 'text-xl font-bold dark:text-white' }, 'New score'),
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
              m('div', { class: 'py-4 border-b border-gray-200 dark:border-gray-700' }, [
                m('div', { class: 'font-medium dark:text-white mb-2' }, 'Taiko'),
                TAIKO_GROUPS.map((group) =>
                  m('div', { key: group.label, class: 'mb-2 last:mb-0' }, [
                    m(
                      'div',
                      {
                        class:
                          'text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1',
                      },
                      group.label
                    ),
                    m(
                      'div',
                      { class: 'flex flex-wrap gap-1' },
                      group.taikos.map((t) =>
                        m(
                          'button',
                          {
                            key: t.name,
                            class: `rounded border px-2 py-1 text-sm font-medium ${taiko === t.name ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`,
                            onclick: () => {
                              taiko = t.name;
                            },
                          },
                          t.name
                        )
                      )
                    ),
                  ])
                ),
              ]),
              m('div', { class: 'py-4 border-b border-gray-200 dark:border-gray-700' }, [
                m('div', { class: 'font-medium dark:text-white mb-2' }, 'Jiuchi'),
                m(
                  'div',
                  { class: 'flex flex-wrap gap-1' },
                  ALL_JIUCHIS.map((j) =>
                    m(
                      'button',
                      {
                        key: j,
                        class: `rounded border px-2 py-1 text-sm font-medium ${jiuchi === j ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`,
                        onclick: () => {
                          jiuchi = j;
                        },
                      },
                      j
                    )
                  )
                ),
              ]),
              m(
                'div',
                {
                  class:
                    'flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700',
                },
                [
                  m('div', { class: 'font-medium dark:text-white' }, 'BPM'),
                  m('input', {
                    type: 'number',
                    min: '0',
                    max: '300',
                    class:
                      'w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600',
                    value: bpm,
                    oninput: (e) => {
                      bpm = Number(e.target.value);
                    },
                  }),
                ]
              ),
              m(
                'div',
                {
                  class:
                    'flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700',
                },
                [
                  m('div', { class: 'font-medium dark:text-white' }, 'Beats per line'),
                  m('input', {
                    type: 'number',
                    min: '1',
                    max: '32',
                    class:
                      'w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600',
                    value: beatsPerLine,
                    oninput: (e) => {
                      beatsPerLine = Number(e.target.value);
                    },
                  }),
                ]
              ),
              m('div', { class: 'pt-5 flex gap-3' }, [
                m(
                  'button',
                  {
                    class:
                      'flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                    onclick: onClose,
                  },
                  'Cancel'
                ),
                m(
                  'button',
                  {
                    class: `flex-1 py-2.5 rounded-lg text-white text-sm font-semibold ${valid ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'}`,
                    disabled: !valid,
                    onclick: () => {
                      if (!valid) return;
                      if (!scoreStore.confirmDiscard()) return;
                      player.stop();
                      piece.reset({
                        taiko,
                        jiuchi,
                        bpm: bpm || 120,
                        beatsPerLine: beatsPerLine || 8,
                        author: settings.defaultAuthor,
                        icon: settings.defaultBackground,
                        showVolume: settings.defaultShowVolume,
                      });
                      patternStore.setItems([]);
                      scoreStore.markClean();
                      onCreated?.();
                      onClose();
                    },
                  },
                  'Create'
                ),
              ]),
            ]),
          ]
        )
      );
    },
  };
}
