import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { isIntegerBeat } from '../util.js';

const TE_WIDTH_REM = 2; // te/ke (duration=1/4) are the reference unit
const BEAT_WIDTH_REM = TE_WIDTH_REM * 4; // one full beat = 4× a te tile
const PROP_PAD_REM = 0.25; // left padding in proportional mode for non-quarter tiles

export function SoundTile() {
  return {
    view({ attrs: { sound, lineId, startPos, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;

      const borderClass = isSelected
        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/40'
        : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800';

      const widthStyle = settings.proportionalWidth
        ? `width: ${sound.duration * BEAT_WIDTH_REM}rem`
        : undefined;

      const prop = settings.proportionalWidth;
      const propPad = prop && sound.duration > 1 / 4 ? PROP_PAD_REM : 0;

      return (
        <div
          class={`sound-tile relative flex flex-col ${prop ? 'items-start' : 'items-center'} border rounded shadow-sm ${prop ? `${propPad ? 'pl-1' : 'pl-0'} pr-0 py-1` : 'px-2 py-1'} cursor-grab select-none ${prop ? '' : 'min-w-[3rem]'} ${borderClass}`}
          style={widthStyle}
          data-sound-id={sound.id}
          onpointerup={(e) => {
            if (!piece.selectMode) return;
            e.stopPropagation();
            piece.toggleSoundSelection(lineId, sound.id);
          }}
          onclick={(e) => {
            e.stopPropagation();
            if (piece.selectMode) return;
            piece.setEditingTile(isEditing ? null : { lineId, soundId: sound.id });
          }}
        >
          <div class="contents">
            {prop ? (
              Array.from({ length: Math.round(sound.duration * 4) }, (_, i) => {
                const absPos = (startPos ?? 0) + i * 0.25;
                const isHB = isIntegerBeat(absPos);
                return (
                  <span
                    class={`absolute -top-3 -translate-x-1/2 rounded-full ${isHB ? 'beat-dot w-2 h-2 bg-gray-900 dark:bg-gray-100' : 'w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500'}`}
                    style={`left:${propPad + TE_WIDTH_REM * (i + 0.5)}rem`}
                  />
                );
              })
            ) : startPos != null && isIntegerBeat(startPos) ? (
              <span class="beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
            ) : null}
          </div>
          <div
            class={prop ? 'flex flex-col items-center py-0' : 'contents'}
            style={prop ? `width: ${TE_WIDTH_REM}rem` : undefined}
          >
            <span
              class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}${sound.emphasis ? ' underline' : ''}`}
            >
              {sound.name}
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{sound.hand}</span>
          </div>
          {isEditing ? <SoundEditor lineId={lineId} sound={sound} /> : null}
        </div>
      );
    },
  };
}

export function SoundEditor() {
  return {
    view({ attrs: { lineId, sound } }) {
      let showLigature = false;
      let isLigated = false;
      if (!settings.proportionalWidth) {
        const line = piece.lines.find((l) => l.id === lineId);
        if (line) {
          const idx = line.sounds.findIndex((s) => s.id === sound.id);
          if (idx >= 1) {
            const prev = line.sounds[idx - 1];
            if (prev && prev.type !== 'group') {
              showLigature = true;
              const sameDur = Math.abs(prev.duration - sound.duration) < 1e-9;
              const prevStart = line.sounds.slice(0, idx - 1).reduce((s, x) => s + x.duration, 0);
              const sameBeat = Math.floor(prevStart) === Math.floor(prevStart + prev.duration);
              const autoWouldJoin =
                sameDur && sameBeat && prev.duration < 1 && prev.hand !== sound.hand;
              isLigated = sound.ligature === true || (autoWouldJoin && sound.ligature !== false);
            }
          }
        }
      }

      return [
        <div key="bd" class="fixed inset-0 z-10" onclick={() => piece.setEditingTile(null)} />,
        <div
          key="ed"
          class="absolute top-full left-0 z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg p-2 flex flex-col gap-1 min-w-[8rem]"
          onclick={(e) => e.stopPropagation()}
        >
          {sound.implicit && (
            <div class="flex items-center justify-center gap-2">
              <button
                class="w-6 h-6 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 flex items-center justify-center"
                onclick={() => {
                  const cur = sound.name === '—' ? 0 : parseInt(sound.name, 10) || 0;
                  if (cur > 0)
                    piece.updateSound(lineId, sound.id, {
                      name: cur === 1 ? '—' : String(cur - 1),
                    });
                }}
              >
                −
              </button>
              <span class="font-bold w-4 text-center text-gray-900 dark:text-gray-200">
                {sound.name}
              </span>
              <button
                class="w-6 h-6 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 flex items-center justify-center"
                onclick={() => {
                  const cur = sound.name === '—' ? 0 : parseInt(sound.name, 10) || 0;
                  if (cur < 8) piece.updateSound(lineId, sound.id, { name: String(cur + 1) });
                }}
              >
                +
              </button>
            </div>
          )}
          {sound.hand != null && (
            <div>
              <div class="flex gap-1">
                {['L', 'B', 'R'].map((h) => (
                  <button
                    key={h}
                    class={`${h === 'B' ? 'w-6' : 'flex-1'} rounded py-0.5 text-sm font-bold border ${sound.hand === h ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 dark:text-gray-300'}`}
                    onclick={() => piece.updateSound(lineId, sound.id, { hand: h })}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label class="text-xs font-semibold text-gray-600 dark:text-gray-400 mt-1">
            Instruction
          </label>
          <input
            class="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5 text-xs"
            value={sound.instruction}
            oninput={(e) => piece.updateSound(lineId, sound.id, { instruction: e.target.value })}
            placeholder="e.g. step left"
          />
          <button
            class={`mt-1 text-xs rounded border px-2 py-1 font-medium transition-colors ${sound.emphasis ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            onclick={() => piece.updateSound(lineId, sound.id, { emphasis: !sound.emphasis })}
          >
            Accent
          </button>
          {showLigature && (
            <button
              class="mt-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onclick={() =>
                piece.updateSound(lineId, sound.id, { ligature: isLigated ? false : true })
              }
            >
              {isLigated ? 'Break join' : '← join'}
            </button>
          )}
          {showLigature && sound.ligature != null && (
            <button
              class="text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 px-2 py-1 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              onclick={() => piece.updateSound(lineId, sound.id, { ligature: undefined })}
            >
              Auto
            </button>
          )}
          <button
            class="mt-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-2 py-1 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            onclick={() => {
              piece.removeSound(lineId, sound.id);
              piece.setEditingTile(null);
            }}
          >
            Remove
          </button>
        </div>,
      ];
    },
  };
}
