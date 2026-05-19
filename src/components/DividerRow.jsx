import m from 'mithril';
import { piece } from '../data/piece.js';

export function DividerRow() {
  return {
    view({ attrs: { divider, inBlockRepeat } }) {
      const isSelected = piece.lineSelection.includes(divider.id);
      const isHighlighted =
        piece.lineSelectMode && isSelected
          ? 'bg-teal-50 dark:bg-teal-900/20 border-l-4 border-l-teal-400'
          : inBlockRepeat
            ? 'border-l-4 border-l-orange-400 bg-orange-50/40 dark:bg-orange-900/10'
            : 'border-l-4 border-l-transparent';

      return (
        <div
          class={`flex items-center gap-2 px-3 py-1 border-b border-gray-200 dark:border-gray-700 group ${isHighlighted}`}
          onclick={() => {
            if (piece.lineSelectMode) piece.toggleLineSelection(divider.id);
          }}
        >
          <div
            class="line-drag-handle shrink-0 cursor-grab select-none text-gray-300 dark:text-gray-600 text-sm leading-none"
            title="Drag to reorder"
          >
            ⠿
          </div>
          <div class="flex-1 flex items-center">
            <hr class="w-full border-gray-400 dark:border-gray-500" />
          </div>
          <button
            class="shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            onclick={(e) => {
              e.stopPropagation();
              piece.removeDivider(divider.id);
            }}
            title="Remove divider"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
