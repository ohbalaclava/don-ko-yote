import m from 'mithril';
import { piece } from '../data/piece.js';
import { repeatDecoration } from './repeatDecoration.js';

export function DividerRow() {
  return {
    view({ attrs: { divider, repeatDepth = 0 } }) {
      const isLineSelected = piece.lineSelectMode && piece.lineSelection.includes(divider.id);
      const inRepeat = !isLineSelected && repeatDepth > 0;
      const sideClass = isLineSelected
        ? 'border-l-4 border-l-teal-400 bg-teal-50 dark:bg-teal-900/20'
        : inRepeat
          ? 'bg-orange-50/20 dark:bg-orange-900/5'
          : 'border-l-4 border-l-transparent';
      const decoration = inRepeat ? repeatDecoration(repeatDepth) : null;

      return (
        <div
          class={`flex items-center gap-2 py-1 pr-3 border-b border-gray-200 dark:border-gray-700 group ${sideClass}`}
          style={decoration ?? { paddingLeft: '12px' }}
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
