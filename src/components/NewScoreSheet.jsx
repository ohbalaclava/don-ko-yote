import m from 'mithril';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { TAIKO_GROUPS, ALL_JIUCHIS, getSymbolSet } from '../data/symbolSets.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';

export function NewScoreSheet() {
  let taiko;
  let jiuchi;
  let bpm;
  let beatsPerLine;

  return {
    oninit() {
      taiko = piece.taiko;
      jiuchi = piece.jiuchi;
      bpm = piece.bpm;
      beatsPerLine = piece.beatsPerLine;
    },
    view({ attrs: { onClose, onCreated } }) {
      const valid = !!getSymbolSet(taiko, jiuchi);

      return (
        <div class="fixed inset-0 z-40 bg-black/50 flex flex-col justify-end" onclick={onClose}>
          <div
            class="bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onclick={(e) => e.stopPropagation()}
          >
            <div class="flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            <div class="px-5 pb-8">
              <div class="flex items-center justify-between mb-5">
                <h2 class="text-xl font-bold dark:text-white">New score</h2>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                  onclick={onClose}
                >
                  ×
                </button>
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-2">Taiko</div>
                {TAIKO_GROUPS.map((group) => (
                  <div key={group.label} class="mb-2 last:mb-0">
                    <div class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                      {group.label}
                    </div>
                    <div class="flex flex-wrap gap-1">
                      {group.taikos.map((t) => (
                        <button
                          key={t.name}
                          class={`rounded border px-2 py-1 text-sm font-medium ${taiko === t.name ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                          onclick={() => {
                            taiko = t.name;
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-2">Jiuchi</div>
                <div class="flex flex-wrap gap-1">
                  {ALL_JIUCHIS.map((j) => (
                    <button
                      key={j}
                      class={`rounded border px-2 py-1 text-sm font-medium ${jiuchi === j ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      onclick={() => {
                        jiuchi = j;
                      }}
                    >
                      {j}
                    </button>
                  ))}
                </div>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">BPM</div>
                <input
                  type="number"
                  min="0"
                  max="300"
                  class="w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={bpm}
                  oninput={(e) => {
                    bpm = Number(e.target.value);
                  }}
                />
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">Beats per line</div>
                <input
                  type="number"
                  min="1"
                  max="32"
                  class="w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={beatsPerLine}
                  oninput={(e) => {
                    beatsPerLine = Number(e.target.value);
                  }}
                />
              </div>

              <div class="pt-5 flex gap-3">
                <button
                  class="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onclick={onClose}
                >
                  Cancel
                </button>
                <button
                  class={`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold ${valid ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'}`}
                  disabled={!valid}
                  onclick={() => {
                    if (!valid) return;
                    player.stop();
                    piece.reset({
                      taiko,
                      jiuchi,
                      bpm: bpm || 120,
                      beatsPerLine: beatsPerLine || 8,
                      author: settings.defaultAuthor,
                      icon: settings.defaultBackground,
                      showVolume: settings.defaultShowVolume,
                    });
                    patternStore.setItems([]);
                    onCreated?.();
                    onClose();
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    },
  };
}
