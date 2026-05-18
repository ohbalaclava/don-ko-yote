import m from 'mithril';
import { piece } from '../data/piece.js';

export function BlockRepeatRow() {
  return {
    view({ attrs: { item } }) {
      return (
        <div class="block-repeat-row flex items-center pl-5 pr-3 py-0.5 border-b border-l-4 border-l-orange-400 border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/10">
          <div class="flex-1 flex items-center gap-1">
            <button
              class="text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
              onclick={(e) => {
                e.stopPropagation();
                piece.setBlockRepeatCount(item.id, item.count - 1);
              }}
              disabled={item.count <= 2}
              title="Decrease repeat count"
            >
              −
            </button>
            <span class="text-sm font-bold text-orange-600 dark:text-orange-300 px-2 py-0.5 select-none">
              ×{item.count}
            </span>
            <button
              class="text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30"
              onclick={(e) => {
                e.stopPropagation();
                piece.setBlockRepeatCount(item.id, item.count + 1);
              }}
              title="Increase repeat count"
            >
              +
            </button>
          </div>
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
