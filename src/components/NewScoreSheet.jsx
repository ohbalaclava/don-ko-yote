import m from 'mithril';
import { piece } from '../data/piece.js';
import { JIUCHI } from '../data/symbols.js';

export function NewScoreSheet() {
  let jiuchi;
  let beatsPerLine;

  return {
    oninit() {
      jiuchi = piece.jiuchi;
      beatsPerLine = piece.beatsPerLine;
    },
    view({ attrs: { onClose } }) {
      return (
        <div
          class="fixed inset-0 z-40 bg-black/50 flex flex-col justify-end"
          onclick={onClose}
        >
          <div
            class="bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl"
            onclick={e => e.stopPropagation()}
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
                >×</button>
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-2">Jiuchi</div>
                <select
                  class="w-full bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1.5 border border-gray-300 dark:border-gray-600"
                  onchange={e => { jiuchi = e.target.value; }}
                >
                  {JIUCHI.map(j => (
                    <option value={j.id} selected={jiuchi === j.id}>{j.label}</option>
                  ))}
                </select>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">Beats per line</div>
                <input
                  type="number" min="1" max="32"
                  class="w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={beatsPerLine}
                  oninput={e => { beatsPerLine = Number(e.target.value); }}
                />
              </div>

              <div class="pt-5 flex gap-3">
                <button
                  class="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onclick={onClose}
                >Cancel</button>
                <button
                  class="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                  onclick={() => { piece.reset(jiuchi, beatsPerLine || 4); onClose(); }}
                >Create</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };
}