import m from 'mithril';
import { piece } from '../data/piece.js';
import { repeatDecoration } from './repeatDecoration.js';
import { player } from '../audio/player.js';
import { anim } from '../anim.js';
import { sectionSlice } from '../data/sequence.js';

export function SectionHeading() {
  let editing = false;

  return {
    oncreate({ dom, attrs: { heading } }) {
      if (anim.consumeAdded(heading.id)) anim.flashIn(dom);
    },
    onbeforeremove({ dom, attrs: { heading } }) {
      if (anim.consumeRemoved(heading.id)) return anim.flashOut(dom);
    },
    view({ attrs: { heading, repeatDepth = 0 } }) {
      function commit(value) {
        piece.setHeadingText(heading.id, value);
        editing = false;
        m.redraw();
      }

      const isLineSelected = piece.lineSelectMode && piece.lineSelection.includes(heading.id);
      const inRepeat = !isLineSelected && repeatDepth > 0;
      const sideClass = isLineSelected
        ? 'border-l-4 border-l-teal-400 bg-teal-50 dark:bg-teal-900/20'
        : inRepeat
          ? 'bg-orange-50 dark:bg-orange-900/20'
          : 'border-l-4 border-l-transparent';
      const decoration = inRepeat ? repeatDecoration(repeatDepth) : null;

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
          editing
            ? m('input', {
                class:
                  'flex-1 text-xl font-semibold bg-transparent border-b border-indigo-400 outline-none text-gray-700 dark:text-gray-200 min-w-0',
                value: heading.text,
                placeholder: 'Heading name',
                oncreate: ({ dom }) => {
                  dom.focus();
                  dom.select();
                },
                oninput: (e) => {
                  heading.text = e.target.value;
                },
                onblur: (e) => commit(e.target.value),
                onkeydown: (e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    commit(e.target.value);
                  }
                  e.stopPropagation();
                },
                onclick: (e) => e.stopPropagation(),
              })
            : m(
                'span',
                {
                  class:
                    'flex-1 text-xl font-semibold text-gray-600 dark:text-gray-300 cursor-text min-w-0 truncate',
                  onclick: (e) => {
                    e.stopPropagation();
                    if (piece.lineSelectMode) {
                      piece.toggleLineSelection(heading.id);
                    } else {
                      editing = true;
                      m.redraw();
                    }
                  },
                  title: piece.lineSelectMode ? 'Click to select' : 'Click to edit',
                },
                heading.text ||
                  m(
                    'span',
                    { class: 'text-gray-300 dark:text-gray-600 italic font-normal' },
                    'Heading'
                  )
              ),
          m(
            'button',
            {
              class: `shrink-0 text-base leading-none ${player.isScope('section', heading.id) ? 'text-green-600 dark:text-green-400' : 'text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'}`,
              onclick: (e) => {
                e.stopPropagation();
                player.toggleScope(piece, sectionSlice(piece.lines, heading.id), {
                  type: 'section',
                  id: heading.id,
                });
              },
              title: player.isScope('section', heading.id) ? 'Stop' : 'Play this section',
            },
            player.isScope('section', heading.id) ? '⏹' : '▶'
          ),
          m(
            'button',
            {
              class:
                'shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity',
              onclick: (e) => {
                e.stopPropagation();
                piece.removeHeading(heading.id);
              },
              title: 'Remove heading',
            },
            '✕'
          ),
        ]
      );
    },
  };
}
