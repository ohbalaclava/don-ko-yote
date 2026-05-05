import m from 'mithril';
import { scoreStore } from '../data/scoreStore.js';

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function LoadScoreSheet() {
  return {
    view({ attrs: { onClose } }) {
      const items = [...scoreStore.items].sort((a, b) => b.savedAt - a.savedAt);

      return (
        <div
          class="fixed inset-0 z-40 bg-black/50 flex flex-col justify-end"
          onclick={onClose}
        >
          <div
            class="bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onclick={e => e.stopPropagation()}
          >
            <div class="flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            <div class="px-5 pb-8">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xl font-bold dark:text-white">Saved scores</h2>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                  onclick={onClose}
                >×</button>
              </div>

              {items.length === 0
                ? <p class="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No saved scores yet.</p>
                : items.map(score => (
                  <div
                    key={score.id}
                    class="flex items-center gap-3 py-3 border-b border-gray-200 dark:border-gray-700"
                  >
                    <div class="flex-1 min-w-0">
                      <div class="font-medium dark:text-white truncate">{score.title || 'Untitled'}</div>
                      <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatDate(score.savedAt)}</div>
                    </div>
                    <button
                      class="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                      onclick={() => { scoreStore.loadScore(score.id); onClose(); }}
                    >Load</button>
                    <button
                      class="shrink-0 text-red-400 hover:text-red-600 text-sm px-1"
                      title="Delete"
                      onclick={() => {
                        if (window.confirm(`Delete "${score.title || 'Untitled'}"?`))
                          scoreStore.delete(score.id);
                      }}
                    >✕</button>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      );
    }
  };
}