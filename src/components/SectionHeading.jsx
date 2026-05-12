import m from 'mithril';
import { piece } from '../data/piece.js';

export function SectionHeading() {
  let editing = false;

  return {
    view({ attrs: { heading } }) {
      function commit(value) {
        piece.setHeadingText(heading.id, value);
        editing = false;
        m.redraw();
      }

      return (
        <div class="flex items-center gap-2 px-3 py-1 border-b border-gray-200 dark:border-gray-700 group">
          <div
            class="line-drag-handle shrink-0 cursor-grab select-none text-gray-300 dark:text-gray-600 text-sm leading-none"
            title="Drag to reorder"
          >
            ⠿
          </div>
          {editing ? (
            <input
              class="flex-1 text-sm font-semibold bg-transparent border-b border-indigo-400 outline-none text-gray-700 dark:text-gray-200 min-w-0"
              value={heading.text}
              placeholder="Section name"
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
              class="flex-1 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-text min-w-0 truncate"
              onclick={(e) => {
                e.stopPropagation();
                editing = true;
                m.redraw();
              }}
              title="Click to edit"
            >
              {heading.text || (
                <span class="text-gray-300 dark:text-gray-600 italic font-normal">Section</span>
              )}
            </span>
          )}
          <button
            class="shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            onclick={(e) => {
              e.stopPropagation();
              piece.removeHeading(heading.id);
            }}
            title="Remove section"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
