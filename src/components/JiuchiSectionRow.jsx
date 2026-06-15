import m from 'mithril';
import { piece } from '../data/piece.js';
import { anim } from '../anim.js';
import { repeatDecoration } from './repeatDecoration.js';
import { taikoGroupsForTime } from '../data/symbolSets.js';

/**
 * A jiuchi-section marker row. Begins a base-rhythm region: the sound lines below
 * it (up to the next heading/divider) define one loop, authored with this row's
 * taiko, and play as the looping underlay during playback. Renders a compact
 * taiko picker constrained to the score's straight/swing feel.
 */
export function JiuchiSectionRow() {
  return {
    oncreate({ dom, attrs: { section } }) {
      if (anim.consumeAdded(section.id)) anim.flashIn(dom);
    },
    onbeforeremove({ dom, attrs: { section } }) {
      if (anim.consumeRemoved(section.id)) return anim.flashOut(dom);
    },
    view({ attrs: { section, repeatDepth = 0 } }) {
      const isLineSelected = piece.lineSelectMode && piece.lineSelection.includes(section.id);
      const inRepeat = !isLineSelected && repeatDepth > 0;
      const sideClass = isLineSelected
        ? 'border-l-4 border-l-teal-400 bg-teal-50 dark:bg-teal-900/20'
        : 'border-l-4 border-l-green-400 bg-green-50 dark:bg-green-900/20';
      const decoration = inRepeat ? repeatDecoration(repeatDepth) : null;
      const groups = taikoGroupsForTime(piece.time);

      return m(
        'div',
        {
          class: `flex items-center gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 group ${sideClass}`,
          style: decoration ?? { paddingLeft: '12px' },
        },
        [
          m(
            'div',
            {
              class:
                'line-drag-handle shrink-0 cursor-grab select-none text-gray-300 dark:text-gray-600 text-sm leading-none',
              title: 'Drag to reorder',
            },
            '⠿'
          ),
          m(
            'span',
            {
              class:
                'shrink-0 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 select-none cursor-pointer',
              onclick: (e) => {
                e.stopPropagation();
                if (piece.lineSelectMode) piece.toggleLineSelection(section.id);
              },
              title: piece.lineSelectMode ? 'Click to select' : 'Jiuchi section',
            },
            'Jiuchi'
          ),
          m(
            'div',
            { class: 'flex-1 flex flex-wrap items-center gap-1 min-w-0' },
            groups.map((group) =>
              group.taikos.map((t) =>
                m(
                  'button',
                  {
                    key: t.name,
                    class: `rounded border px-1.5 py-0.5 text-xs font-medium ${
                      section.taiko === t.name
                        ? 'bg-green-600 text-white border-green-600'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    } ${piece.lineSelectMode ? 'opacity-50 pointer-events-none' : ''}`,
                    onclick: (e) => {
                      e.stopPropagation();
                      piece.setJiuchiSectionTaiko(section.id, t.name);
                    },
                  },
                  t.name
                )
              )
            )
          ),
          m(
            'button',
            {
              class:
                'shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity',
              onclick: (e) => {
                e.stopPropagation();
                piece.removeJiuchiSection(section.id);
              },
              title: 'Remove jiuchi section',
            },
            '✕'
          ),
        ]
      );
    },
  };
}
