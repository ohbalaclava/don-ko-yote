import m from 'mithril';
import { settings } from '../data/settings.js';

function readImageFile(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => callback(e.target.result);
  reader.readAsDataURL(file);
}

const FONTS = [
  { id: 'sans', label: 'Sans-serif', style: 'font-family: ui-sans-serif, system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', style: 'font-family: ui-serif, Georgia, serif' },
  { id: 'mono', label: 'Monospace', style: 'font-family: ui-monospace, monospace' },
  { id: 'script', label: 'Script', style: "font-family: 'Permanent Marker', cursive" },
];

export function Toggle() {
  return {
    view({ attrs: { checked, onChange } }) {
      return (
        <button
          type="button"
          role="switch"
          aria-checked={String(checked)}
          class={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none shrink-0 ${checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          onclick={() => onChange(!checked)}
        >
          <span
            class={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
          />
        </button>
      );
    },
  };
}

export function SettingsModal() {
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
                <h2 class="text-xl font-bold dark:text-white">Settings</h2>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                  onclick={onClose}
                >
                  ×
                </button>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Proportional tile width</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Tile width reflects beat duration
                  </div>
                </div>
                <Toggle
                  checked={settings.proportionalWidth}
                  onChange={(v) => settings.set('proportionalWidth', v)}
                />
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium mb-3 dark:text-white">Font</div>
                <div class="grid grid-cols-2 gap-2">
                  {FONTS.map((f) => (
                    <label
                      key={f.id}
                      class={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${settings.font === f.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      <input
                        type="radio"
                        class="sr-only"
                        name="font"
                        value={f.id}
                        checked={settings.font === f.id}
                        onchange={() => settings.set('font', f.id)}
                      />
                      <span style={f.style} class="text-sm dark:text-white">
                        {f.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">Dark mode</div>
                <Toggle checked={settings.darkMode} onChange={(v) => settings.set('darkMode', v)} />
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Count-in</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Play one bar of clicks before playback
                  </div>
                </div>
                <Toggle checked={settings.countIn} onChange={(v) => settings.set('countIn', v)} />
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white">Use volume (default)</div>
                <Toggle
                  checked={settings.defaultShowVolume}
                  onChange={(v) => settings.set('defaultShowVolume', v)}
                />
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-2">Author (default)</div>
                <input
                  type="text"
                  class="w-full bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600"
                  value={settings.defaultAuthor}
                  oninput={(e) => settings.set('defaultAuthor', e.target.value)}
                  placeholder="Composer name"
                />
              </div>

              <div class="py-4">
                <div class="font-medium dark:text-white mb-3">Background (default)</div>
                {settings.defaultBackground ? (
                  <div class="flex items-start gap-3">
                    <img
                      src={settings.defaultBackground}
                      class="w-20 h-20 rounded-lg object-cover border border-gray-300 dark:border-gray-600 shrink-0"
                      alt="Default background"
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
                            if (file)
                              readImageFile(file, (url) => settings.set('defaultBackground', url));
                          }}
                        />
                      </label>
                      <button
                        class="py-1.5 px-3 rounded-lg border border-red-300 dark:border-red-700 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onclick={() => settings.set('defaultBackground', null)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                    <span class="text-sm text-gray-500 dark:text-gray-400">
                      Tap to upload default background image
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      class="sr-only"
                      onchange={(e) => {
                        const file = e.target.files[0];
                        if (file)
                          readImageFile(file, (url) => settings.set('defaultBackground', url));
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
