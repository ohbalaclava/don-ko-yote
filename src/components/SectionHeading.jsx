import m from 'mithril';
import { piece } from '../data/piece.js';
import { repeatDecoration } from './repeatDecoration.js';

export function SectionHeading() {
  let editing = false;

  return {
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
          ? 'bg-orange-50/20 dark:bg-orange-900/5'
          : 'border-l-4 border-l-transparent';
      const decoration = inRepeat ? repeatDecoration(repeatDepth) : null;

      return (
        <div
          class={`flex items-center gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 group ${sideClass}`}
          style={decoration ?? { paddingLeft: '12px' }}
        >
          <div
            class="line-drag-handle shrink-0 cursor-grab select-none text-gray-300 dark:text-gray-600 text-sm leading-none"
            title="Drag to reorder"
          >
            ⠿
          </div>
          {editing ? (
            <input
              class="flex-1 text-xl font-semibold bg-transparent border-b border-indigo-400 outline-none text-gray-700 dark:text-gray-200 min-w-0"
              value={heading.text}
              placeholder="Heading name"
              oncreate={({ dom }) => {
                dom.focus();
                dom.select();
              }}
              oninput={(e) => {
                heading.text = e.target.value;
              }}
              onblur={(e) => commit(e.target.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  commit(e.target.value);
                }
                e.stopPropagation();
              }}
              onclick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              class="flex-1 text-xl font-semibold text-gray-600 dark:text-gray-300 cursor-text min-w-0 truncate"
              onclick={(e) => {
                e.stopPropagation();
                if (piece.lineSelectMode) {
                  piece.toggleLineSelection(heading.id);
                } else {
                  editing = true;
                  m.redraw();
                }
              }}
              title={piece.lineSelectMode ? 'Click to select' : 'Click to edit'}
            >
              {heading.text || (
                <span class="text-gray-300 dark:text-gray-600 italic font-normal">Heading</span>
              )}
            </span>
          )}
          <button
            class="shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            onclick={(e) => {
              e.stopPropagation();
              piece.removeHeading(heading.id);
            }}
            title="Remove heading"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
