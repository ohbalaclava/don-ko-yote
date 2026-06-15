import m from 'mithril';
import { piece } from '../data/piece.js';
import { repeatDecoration, repeatBarsWidth } from './repeatDecoration.js';
import { player } from '../audio/player.js';
import { anim } from '../anim.js';
import { blockRepeatSlice } from '../data/sequence.js';

export function BlockRepeatRow() {
  return {
    oncreate({ dom, attrs: { item } }) {
      if (anim.consumeAdded(item.id)) anim.flashIn(dom);
    },
    onbeforeremove({ dom, attrs: { item } }) {
      if (anim.consumeRemoved(item.id)) return anim.flashOut(dom);
    },
    view({ attrs: { item, depth = 0 } }) {
      // Marker row shows its own bar plus one for each enclosing repeat.
      const bars = depth + 1;
      const barsWidth = repeatBarsWidth(bars);
      const style = {
        ...repeatDecoration(bars),
        paddingLeft: `${barsWidth + 16}px`,
      };
      return m(
        'div',
        {
          class:
            'block-repeat-row flex items-center pr-3 py-0.5 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20',
          style,
        },
        [
          m('div', { class: 'flex-1 flex items-center gap-1' }, [
            m(
              'button',
              {
                class:
                  'text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 disabled:opacity-40 disabled:cursor-not-allowed',
                onclick: (e) => {
                  e.stopPropagation();
                  piece.setBlockRepeatCount(item.id, item.count - 1);
                },
                disabled: item.count <= 2,
                title: 'Decrease repeat count',
              },
              '−'
            ),
            m(
              'span',
              {
                class:
                  'text-sm font-bold text-orange-600 dark:text-orange-300 px-2 py-0.5 select-none',
              },
              `×${item.count}`
            ),
            m(
              'button',
              {
                class:
                  'text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30',
                onclick: (e) => {
                  e.stopPropagation();
                  piece.setBlockRepeatCount(item.id, item.count + 1);
                },
                title: 'Increase repeat count',
              },
              '+'
            ),
          ]),
          m(
            'button',
            {
              class: `ml-2 text-base leading-none ${player.isScope('block', item.id) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-300 hover:text-orange-800 dark:hover:text-orange-100'}`,
              onclick: (e) => {
                e.stopPropagation();
                player.toggleScope(piece, blockRepeatSlice(piece.lines, item.id), {
                  type: 'block',
                  id: item.id,
                });
              },
              title: player.isScope('block', item.id) ? 'Stop' : 'Play this repeat block',
            },
            player.isScope('block', item.id) ? '⏹' : '▶'
          ),
          m(
            'button',
            {
              class: 'ml-2 text-xs text-red-400 hover:text-red-600',
              onclick: (e) => {
                e.stopPropagation();
                piece.removeBlockRepeat(item.id);
              },
              title: 'Remove block repeat',
            },
            '✕'
          ),
        ]
      );
    },
  };
}
