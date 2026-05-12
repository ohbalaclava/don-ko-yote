import m from 'mithril';
import { piece } from '../data/piece.js';

export function BlockRepeatRow() {
  let editing = false;

  return {
    view({ attrs: { item } }) {
      function commit(value) {
        const n = Math.round(Number(value));
        if (n >= 2) piece.setBlockRepeatCount(item.id, n);
        editing = false;
        m.redraw();
      }

      return (
        <div class="block-repeat-row flex items-center pl-5 pr-3 py-0.5 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/10">
          <div class="flex-1 border-l-2 border-orange-400 pl-2">
            <span class="text-xs text-orange-500 dark:text-orange-400 select-none">end repeat</span>
          </div>
          {editing ? (
            <input
              type="number"
              min="2"
              class="text-sm font-bold w-12 text-center bg-transparent border-b border-orange-400 outline-none text-orange-600 dark:text-orange-300"
              value={item.count}
              oncreate={({ dom }) => {
                dom.focus();
                dom.select();
              }}
              onblur={(e) => commit(e.target.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') commit(e.target.value);
                e.stopPropagation();
              }}
              onclick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              class="text-sm font-bold text-orange-600 dark:text-orange-300 border border-orange-400 rounded px-2 py-0.5 hover:bg-orange-100 dark:hover:bg-orange-900/30"
              onclick={(e) => {
                e.stopPropagation();
                editing = true;
                m.redraw();
              }}
              title="Click to change repeat count"
            >
              ×{item.count}
            </button>
          )}
          <button
            class="ml-2 text-xs text-red-400 hover:text-red-600"
            onclick={(e) => {
              e.stopPropagation();
              piece.removeBlockRepeat(item.id);
            }}
            title="Remove block repeat"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
