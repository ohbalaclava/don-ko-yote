import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { isIntegerBeat } from '../util.js';

const SUBDIV_WIDTH_REM = 2; // single-division (smallest) tile width
const PROP_PAD_REM = 0.25; // left padding in proportional mode for tiles wider than one division

export function SoundTile() {
  return {
    view({ attrs: { sound, lineId, startPos, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;
      const time = piece.time;
      const beatWidthRem = SUBDIV_WIDTH_REM * time; // one full beat ≡ `time` subdivisions wide

      const borderClass = isSelected
        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/40'
        : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800';

      const widthStyle = settings.proportionalWidth
        ? `width: ${(sound.duration / time) * beatWidthRem}rem`
        : undefined;

      const prop = settings.proportionalWidth;
      const propPad = prop && sound.duration > 1 ? PROP_PAD_REM : 0;

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
              Array.from({ length: sound.duration }, (_, i) => {
                const absPos = (startPos ?? 0) + i;
                const isHB = isIntegerBeat(absPos, time);
                return (
                  <span
                    class={`absolute -top-3 -translate-x-1/2 rounded-full ${isHB ? 'beat-dot w-2 h-2 bg-gray-900 dark:bg-gray-100' : 'w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500'}`}
                    style={`left:${propPad + SUBDIV_WIDTH_REM * (i + 0.5)}rem`}
                  />
                );
              })
            ) : startPos != null && isIntegerBeat(startPos, time) ? (
              <span class="beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
            ) : null}
          </div>
          <div
            class={prop ? 'flex flex-col items-center py-0' : 'contents'}
            style={prop ? `width: ${SUBDIV_WIDTH_REM}rem` : undefined}
          >
            <span
              class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}${sound.emphasis ? ' underline' : ''}${sound.skin === 'back' ? ' italic' : ''}`}
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
      const time = piece.time;
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
              const sameDur = prev.duration === sound.duration;
              const prevStart = line.sounds.slice(0, idx - 1).reduce((s, x) => s + x.duration, 0);
              const sameBeat =
                Math.floor(prevStart / time) === Math.floor((prevStart + prev.duration) / time);
              const autoWouldJoin =
                sameDur && sameBeat && prev.duration < time && prev.hand !== sound.hand;
              isLigated = sound.ligature === true || (autoWouldJoin && sound.ligature !== false);
            }
          }
        }
      }

      const showHand = !!sound.alternatives || sound.hand === 'L' || sound.hand === 'R';
      const showSkin = piece.skins === 2 && !!sound.hand;
      const showDuration = sound.editable === true && !sound.implicit;
      const maxDuration = time;

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
          {showHand && (
            <div>
              <div class="flex gap-1">
                {['L', 'B', 'R']
                  .filter(
                    (h) => !sound.alternatives || sound.alternatives.some((a) => a.hand === h)
                  )
                  .map((h) => (
                    <button
                      key={h}
                      class={`${h === 'B' ? 'w-6' : 'flex-1'} rounded py-0.5 text-sm font-bold border ${sound.hand === h ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 dark:text-gray-300'}`}
                      onclick={() => {
                        if (sound.alternatives) {
                          const alt = sound.alternatives.find((a) => a.hand === h);
                          if (alt)
                            piece.updateSound(lineId, sound.id, {
                              hand: alt.hand,
                              duration: alt.duration,
                            });
                        } else {
                          piece.updateSound(lineId, sound.id, { hand: h });
                        }
                      }}
                    >
                      {h}
                    </button>
                  ))}
              </div>
            </div>
          )}
          {showDuration && (
            <div class="flex items-center justify-center gap-2">
              <button
                class="w-6 h-6 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 flex items-center justify-center"
                onclick={() => {
                  if (sound.duration > 1)
                    piece.updateSound(lineId, sound.id, { duration: sound.duration - 1 });
                }}
              >
                −
              </button>
              <span class="font-mono text-xs w-10 text-center text-gray-600 dark:text-gray-400">
                {sound.duration}/{time}
              </span>
              <button
                class="w-6 h-6 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 flex items-center justify-center"
                onclick={() => {
                  if (sound.duration < maxDuration)
                    piece.updateSound(lineId, sound.id, { duration: sound.duration + 1 });
                }}
              >
                +
              </button>
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
          {!sound.implicit && (
            <button
              class={`mt-1 text-xs rounded border px-2 py-1 font-medium transition-colors ${sound.emphasis ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              onclick={() => piece.updateSound(lineId, sound.id, { emphasis: !sound.emphasis })}
            >
              Accent
            </button>
          )}
          {showSkin && (
            <button
              class={`text-xs rounded border px-2 py-1 font-medium transition-colors ${sound.skin === 'back' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              onclick={() =>
                piece.updateSound(lineId, sound.id, {
                  skin: sound.skin === 'back' ? undefined : 'back',
                })
              }
            >
              Back skin
            </button>
          )}
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
