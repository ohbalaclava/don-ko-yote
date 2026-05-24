import m from 'mithril';
import { piece } from '../data/piece.js';

function readImageFile(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => callback(e.target.result);
  reader.readAsDataURL(file);
}

export function ScoreSettingsModal() {
  return {
    view({ attrs: { onClose } }) {
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
                <h2 class="text-xl font-bold dark:text-white">Score settings</h2>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                  onclick={onClose}
                >
                  ×
                </button>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">Beats per line</div>
                <input
                  type="number"
                  min="1"
                  max="32"
                  class="w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={piece.beatsPerLine}
                  oninput={(e) => piece.setBeatsPerLine(e.target.value)}
                />
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">BPM</div>
                <input
                  type="number"
                  min="0"
                  max="300"
                  class="w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={piece.bpm}
                  oninput={(e) => piece.setBpm(e.target.value)}
                />
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-2">Author</div>
                <input
                  type="text"
                  class="w-full bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={piece.author}
                  oninput={(e) => piece.setAuthor(e.target.value)}
                  placeholder="Composer name"
                />
              </div>

              <div class="py-4">
                <div class="font-medium dark:text-white mb-3">Background</div>
                {piece.icon ? (
                  <div class="flex items-start gap-3">
                    <img
                      src={piece.icon}
                      class="w-20 h-20 rounded-lg object-cover border border-gray-300 dark:border-gray-600 shrink-0"
                      alt="Background"
                    />
                    <div class="flex flex-col gap-2">
                      <label class="py-1.5 px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-center">
                        Replace
                        <input
                          type="file"
                          accept="image/*"
                          class="sr-only"
                          onchange={(e) => {
                            const file = e.target.files[0];
                            if (file) readImageFile(file, piece.setIcon.bind(piece));
                          }}
                        />
                      </label>
                      <button
                        class="py-1.5 px-3 rounded-lg border border-red-300 dark:border-red-700 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onclick={() => piece.setIcon(null)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                      Tap to upload background image
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      class="sr-only"
                      onchange={(e) => {
                        const file = e.target.files[0];
                        if (file) readImageFile(file, piece.setIcon.bind(piece));
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    },
  };
}
