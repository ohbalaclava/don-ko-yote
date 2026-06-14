import m from 'mithril';
import { ALL_JIUCHIS } from '../data/symbolSets.js';
import { piece } from '../data/piece.js';
import { Toggle } from './SettingsModal.jsx';

export function MetronomeSettingsModal() {
  return {
    view({ attrs: { onClose } }) {
      // Standard jiuchis (ticked subdivisions) plus an "Inline" choice that plays
      // the jiuchi sections authored in the score as looping drum rhythms. Inline
      // is only meaningful when the score actually contains a jiuchi section.
      const hasInline = piece.lines.some((l) => l.type === 'jiuchi-section');
      const options = [{ label: 'Match score', value: 'auto' }]
        .concat(ALL_JIUCHIS.map((j) => ({ label: j, value: j })))
        .concat([{ label: 'Inline', value: 'inline', inline: true, disabled: !hasInline }]);
      // Inline plays each section's drum pattern as authored, so the head-only and
      // emphasise tick options don't apply to it.
      const inlineSelected = piece.metronomeJiuchi === 'inline';
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
                  checked={piece.metronome}
                  onChange={(v) => piece.setMetronome('metronome', v)}
                />
              </div>

              <div
                class={`flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${inlineSelected ? 'opacity-50' : ''}`}
              >
                <div>
                  <div class="font-medium dark:text-white">Head beat only</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Tick once per beat, not every subdivision
                  </div>
                </div>
                <Toggle
                  checked={piece.metronomeHeadOnly}
                  disabled={inlineSelected}
                  onChange={(v) => piece.setMetronome('metronomeHeadOnly', v)}
                />
              </div>

              <div
                class={`flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${inlineSelected ? 'opacity-50' : ''}`}
              >
                <div>
                  <div class="font-medium dark:text-white">Emphasise head beat</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Accent the start of each beat
                  </div>
                </div>
                <Toggle
                  checked={piece.metronomeEmphasiseHead}
                  disabled={inlineSelected}
                  onChange={(v) => piece.setMetronome('metronomeEmphasiseHead', v)}
                />
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-1">Jiuchi</div>
                <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  The base rhythm to play — ticked subdivisions, or the jiuchi sections in the score
                </div>
                <div class="flex flex-wrap gap-1">
                  {options.map((o) => {
                    // Only Inline-without-a-section is unselectable. The jiuchi
                    // choice stays changeable regardless of head-only (which just
                    // flattens a tick pattern) so the auto-selected Inline can
                    // always be switched away from.
                    const disabled = o.disabled;
                    return (
                      <button
                        key={o.value}
                        disabled={disabled}
                        title={
                          o.inline && o.disabled
                            ? 'Add a jiuchi section to the score first'
                            : undefined
                        }
                        class={`rounded border px-2 py-1 text-sm font-medium ${disabled ? 'opacity-50 cursor-not-allowed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300' : piece.metronomeJiuchi === o.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        onclick={() => piece.setMetronome('metronomeJiuchi', o.value)}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                class={`flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${inlineSelected ? 'opacity-50' : ''}`}
              >
                <div>
                  <div class="font-medium dark:text-white">Use Shime sound</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Tick with the Shime TEN sample instead of a synth click
                  </div>
                </div>
                <Toggle
                  checked={piece.metronomeShime}
                  disabled={inlineSelected}
                  onChange={(v) => piece.setMetronome('metronomeShime', v)}
                />
              </div>

              <div class="py-4">
                <div class="flex items-center justify-between mb-1">
                  <div class="font-medium dark:text-white">Metronome volume</div>
                  <div class="text-sm tabular-nums text-gray-500 dark:text-gray-400 w-10 text-right">
                    {Math.round(piece.metronomeVolume * 100)}%
                  </div>
                </div>
                <input
                  type="range"
                  class="w-full accent-indigo-600"
                  min="0"
                  max="2"
                  step="0.05"
                  value={piece.metronomeVolume}
                  oninput={(e) => piece.setMetronomeVolumeLive(Number(e.target.value))}
                  onchange={(e) => piece.setMetronome('metronomeVolume', Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      );
    },
  };
}
