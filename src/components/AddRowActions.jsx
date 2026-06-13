import m from 'mithril';
import { piece } from '../data/piece.js';
import { scrollToScoreBottom } from '../scroll.js';

/**
 * The contextual "add row" toolbar. Rendered after the selected line (and as a
 * fallback at the foot of the score when no line is selected); each button adds
 * its row immediately after the selected line via the matching `piece` method.
 */
export function AddRowActions() {
  return {
    view() {
      const act = (fn) => () => {
        fn();
        scrollToScoreBottom();
      };
      return (
        <div
          class="score-actions px-3 py-2 flex flex-wrap items-center gap-3"
          onclick={(e) => e.stopPropagation()}
        >
          <button
            class="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
            onclick={act(() => piece.addLine())}
          >
            + Add line
          </button>
          <button
            class="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onclick={act(() => piece.addHeading())}
          >
            + Add heading
          </button>
          <button
            class="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onclick={act(() => piece.addNote())}
          >
            + Add note
          </button>
          <button
            class="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onclick={act(() => piece.addDivider())}
          >
            + Add divider
          </button>
          <button
            class="text-sm font-semibold text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
            onclick={act(() => piece.addJiuchiSection())}
          >
            + Add jiuchi
          </button>
        </div>
      );
    },
  };
}
