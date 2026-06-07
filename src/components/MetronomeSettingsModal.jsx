import m from 'mithril';
import { settings } from '../data/settings.js';
import { ALL_JIUCHIS } from '../data/symbolSets.js';
import { Toggle } from './SettingsModal.jsx';

// 'Match score' maps to the 'auto' setting value (follow piece.jiuchi).
const JIUCHI_OPTIONS = [{ label: 'Match score', value: 'auto' }].concat(
  ALL_JIUCHIS.map((j) => ({ label: j, value: j }))
);

export function MetronomeSettingsModal() {
  return {
    view({ attrs: { onClose } }) {
      // The jiuchi pattern is only used when ticking every subdivision.
      const jiuchiDisabled = settings.metronomeHeadOnly;
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
                <h2 class="text-xl font-bold dark:text-white">Metronome</h2>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                  onclick={onClose}
                >
                  ×
                </button>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Metronome</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Play a beat track during playback
                  </div>
                </div>
                <Toggle
                  checked={settings.metronome}
                  onChange={(v) => settings.set('metronome', v)}
                />
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Head beat only</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Tick once per beat, not every subdivision
                  </div>
                </div>
                <Toggle
                  checked={settings.metronomeHeadOnly}
                  onChange={(v) => settings.set('metronomeHeadOnly', v)}
                />
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Emphasise head beat</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Accent the start of each beat
                  </div>
                </div>
                <Toggle
                  checked={settings.metronomeEmphasiseHead}
                  onChange={(v) => settings.set('metronomeEmphasiseHead', v)}
                />
              </div>

              <div
                class={`py-4 border-b border-gray-200 dark:border-gray-700 ${jiuchiDisabled ? 'opacity-50' : ''}`}
              >
                <div class="font-medium dark:text-white mb-1">Jiuchi</div>
                <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Which subdivisions to tick (when not head-only)
                </div>
                <div class="flex flex-wrap gap-1">
                  {JIUCHI_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      disabled={jiuchiDisabled}
                      class={`rounded border px-2 py-1 text-sm font-medium ${settings.metronomeJiuchi === o.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      onclick={() => settings.set('metronomeJiuchi', o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Use Shime sound</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Shime TEN sample instead of a synth click
                  </div>
                </div>
                <Toggle
                  checked={settings.metronomeShime}
                  onChange={(v) => settings.set('metronomeShime', v)}
                />
              </div>

              <div class="py-4">
                <div class="flex items-center justify-between mb-1">
                  <div class="font-medium dark:text-white">Metronome volume</div>
                  <div class="text-sm tabular-nums text-gray-500 dark:text-gray-400 w-10 text-right">
                    {Math.round(settings.metronomeVolume * 100)}%
                  </div>
                </div>
                <input
                  type="range"
                  class="w-full accent-indigo-600"
                  min="0"
                  max="2"
                  step="0.05"
                  value={settings.metronomeVolume}
                  oninput={(e) => settings.set('metronomeVolume', Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      );
    },
  };
}
