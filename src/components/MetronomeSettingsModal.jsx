import m from 'mithril';
import { settings } from '../data/settings.js';
import { ALL_JIUCHIS } from '../data/symbolSets.js';
import { piece } from '../data/piece.js';
import { jiuchiStore } from '../data/jiuchis.js';
import { Toggle } from './SettingsModal.jsx';

export function MetronomeSettingsModal() {
  // Tick-grid editor state for creating a custom clicks-kind jiuchi. Closure-
  // scoped, so it resets each time the sheet is reopened.
  let editorOpen = false;
  let editorName = '';
  let editorTime = piece.time;
  let editorPositions = [1];

  function togglePosition(p) {
    editorPositions = editorPositions.includes(p)
      ? editorPositions.filter((x) => x !== p)
      : [...editorPositions, p].sort((a, b) => a - b);
  }

  async function saveEditor() {
    const name = editorName.trim();
    if (!name || editorPositions.length === 0) return;
    const record = await jiuchiStore.save({
      name,
      kind: 'ticks',
      time: editorTime,
      positions: editorPositions,
    });
    if (record.time === piece.time) await settings.set('metronomeJiuchi', `custom:${record.id}`);
    editorOpen = false;
    editorName = '';
    editorPositions = [1];
    m.redraw();
  }

  return {
    view({ attrs: { onClose } }) {
      // Standard jiuchis plus the custom library; a custom entry whose time
      // (straight/swing) doesn't match the score can't tick meaningfully, so it
      // renders disabled with a hint rather than being hidden.
      const options = [{ label: 'Match score', value: 'auto' }]
        .concat(ALL_JIUCHIS.map((j) => ({ label: j, value: j })))
        .concat(
          jiuchiStore.items.map((j) => ({
            label: j.name,
            value: `custom:${j.id}`,
            custom: j,
            mismatch: j.time !== piece.time,
          }))
        );
      const selected = options.find((o) => o.value === settings.metronomeJiuchi);
      // A sounds-kind jiuchi plays its drum pattern as authored: head-only and
      // emphasise don't apply to it, and head-only must not lock it out either.
      const soundsSelected = selected?.custom?.kind === 'sounds' && !selected.mismatch;
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

              <div
                class={`flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${soundsSelected ? 'opacity-50' : ''}`}
              >
                <div>
                  <div class="font-medium dark:text-white">Head beat only</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Tick once per beat, not every subdivision
                  </div>
                </div>
                <Toggle
                  checked={settings.metronomeHeadOnly}
                  disabled={soundsSelected}
                  onChange={(v) => settings.set('metronomeHeadOnly', v)}
                />
              </div>

              <div
                class={`flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${soundsSelected ? 'opacity-50' : ''}`}
              >
                <div>
                  <div class="font-medium dark:text-white">Emphasise head beat</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Accent the start of each beat
                  </div>
                </div>
                <Toggle
                  checked={settings.metronomeEmphasiseHead}
                  disabled={soundsSelected}
                  onChange={(v) => settings.set('metronomeEmphasiseHead', v)}
                />
              </div>

              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="font-medium dark:text-white mb-1">Jiuchi</div>
                <div class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  The base rhythm to play — ticked subdivisions, or a custom drum pattern
                </div>
                <div class="flex flex-wrap gap-1">
                  {options.map((o) => {
                    // Head-only overrides which subdivisions tick, so ticks-kind
                    // choices are moot while it's on; sounds-kind stay selectable.
                    const isSounds = o.custom?.kind === 'sounds';
                    const disabled = o.mismatch || (settings.metronomeHeadOnly && !isSounds);
                    return (
                      <span key={o.value} class="inline-flex items-center">
                        <button
                          disabled={disabled}
                          title={
                            o.mismatch
                              ? `Needs a ${o.custom.time === 3 ? 'swing' : 'straight'} score`
                              : undefined
                          }
                          class={`rounded border px-2 py-1 text-sm font-medium ${o.custom ? 'rounded-r-none border-r-0' : ''} ${disabled ? 'opacity-50 cursor-not-allowed border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300' : settings.metronomeJiuchi === o.value ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                          onclick={() => settings.set('metronomeJiuchi', o.value)}
                        >
                          {o.label}
                          {o.mismatch ? (
                            <span class="text-[10px] ml-1">
                              ({o.custom.time === 3 ? 'swing' : 'straight'})
                            </span>
                          ) : null}
                        </button>
                        {o.custom ? (
                          <button
                            class="rounded-r border border-gray-300 dark:border-gray-600 px-1.5 py-1 text-sm leading-[1.25rem] text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title={`Delete "${o.label}"`}
                            onclick={() => jiuchiStore.delete(o.custom.id)}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    );
                  })}
                  <button
                    class="rounded border border-dashed border-gray-400 dark:border-gray-500 px-2 py-1 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onclick={() => {
                      editorOpen = !editorOpen;
                      editorTime = piece.time;
                    }}
                  >
                    + New jiuchi
                  </button>
                </div>

                {editorOpen ? (
                  <div class="mt-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <input
                      type="text"
                      placeholder="Name"
                      class="w-full mb-3 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 dark:text-white text-sm"
                      value={editorName}
                      oninput={(e) => {
                        editorName = e.target.value;
                      }}
                    />
                    <div class="flex items-center gap-3 mb-3">
                      <span class="text-sm text-gray-500 dark:text-gray-400">Time</span>
                      {[
                        { t: 4, label: 'Straight (4)' },
                        { t: 3, label: 'Swing (3)' },
                      ].map(({ t, label }) => (
                        <button
                          key={t}
                          class={`rounded border px-2 py-1 text-sm font-medium ${editorTime === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
                          onclick={() => {
                            editorTime = t;
                            editorPositions = editorPositions.filter((p) => p <= t);
                            if (editorPositions.length === 0) editorPositions = [1];
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div class="flex items-center gap-3 mb-3">
                      <span class="text-sm text-gray-500 dark:text-gray-400">Ticks</span>
                      {Array.from({ length: editorTime }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          class={`w-9 h-9 rounded-full border text-sm font-semibold ${editorPositions.includes(p) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
                          onclick={() => togglePosition(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <div class="flex justify-end gap-2">
                      <button
                        class="rounded px-3 py-1.5 text-sm font-semibold text-gray-500 dark:text-gray-400"
                        onclick={() => {
                          editorOpen = false;
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        class={`rounded px-3 py-1.5 text-sm font-semibold text-white ${editorName.trim() && editorPositions.length ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed'}`}
                        disabled={!editorName.trim() || editorPositions.length === 0}
                        onclick={saveEditor}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div class="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <div class="font-medium dark:text-white">Use Shime sound</div>
                  <div class="text-sm text-gray-500 dark:text-gray-400">
                    Tick with the Shime TEN sample instead of a synth click; play custom drum
                    patterns on the Shime instead of the score's taiko
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
