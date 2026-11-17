import m from 'mithril';
import { piece } from '../data/piece.js';
import { partRow } from './PartsSection.jsx';

// Module state rather than a flag in `main.jsx`, because the sheet is opened from
// a part badge deep inside `Score` → `System`, which take no attrs. Same pattern
// as `Toast`: mount the component once near the root and it renders itself.
let openPartId = null;

/**
 * Opens the part sheet for one part — the drum picker, name, set, volume, mute,
 * solo, reorder and remove that the ensemble gutter used to repeat in every
 * system. Opened by tapping a part badge.
 * @param {string} partId
 */
export function openPartSheet(partId) {
  openPartId = partId;
  m.redraw();
}

export function closePartSheet() {
  openPartId = null;
  m.redraw();
}

/** Whether the part sheet is up — `main.jsx` needs this for Escape and shortcuts. */
export function isPartSheetOpen() {
  return openPartId != null;
}

/**
 * Bottom sheet holding the full editor for a single part. Mount once near the app
 * root; it renders nothing while closed. A part removed from under it (from here
 * or by undo) closes the sheet rather than showing a stale editor.
 */
export function PartSheet() {
  return {
    view() {
      if (openPartId == null) return null;
      const idx = piece.parts.findIndex((p) => p.id === openPartId);
      if (idx === -1) {
        openPartId = null;
        return null;
      }
      const part = piece.parts[idx];
      const set = part.setId ? piece.sets.find((s) => s.id === part.setId) : null;

      return m(
        'div',
        {
          class: 'fixed inset-0 z-40 bg-black/50 flex flex-col justify-end',
          onclick: closePartSheet,
        },
        m(
          'div',
          {
            class:
              'bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto px-4 pb-6',
            onclick: (e) => e.stopPropagation(),
          },
          [
            m('div', { class: 'flex justify-center pt-3 pb-2' }, [
              m('div', { class: 'w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full' }),
            ]),
            m('div', { class: 'flex items-baseline justify-between' }, [
              m('div', { class: 'font-medium dark:text-white' }, part.name || `Part ${idx + 1}`),
              m(
                'div',
                { class: 'text-xs text-gray-400 dark:text-gray-500' },
                `Part ${idx + 1} of ${piece.parts.length}`
              ),
            ]),
            // `partRow` keys itself for the list in `PartsSection`, so it needs a
            // wrapper here: Mithril refuses a fragment that mixes keyed and
            // unkeyed children.
            m('div', [partRow(part, idx)]),
            set
              ? m('div', { class: 'pt-3' }, [
                  m(
                    'div',
                    { class: 'text-xs text-gray-500 dark:text-gray-400 mb-1' },
                    'Player (taiko set)'
                  ),
                  m('input', {
                    type: 'text',
                    class:
                      'w-full bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 text-sm border border-gray-300 dark:border-gray-600',
                    value: set.name,
                    placeholder: 'Player name',
                    oninput: (e) => piece.setSetName(set.id, e.target.value),
                  }),
                ])
              : null,
            m(
              'button',
              {
                class:
                  'mt-4 w-full py-2.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-sm font-semibold',
                onclick: closePartSheet,
              },
              'Done'
            ),
          ]
        )
      );
    },
  };
}
