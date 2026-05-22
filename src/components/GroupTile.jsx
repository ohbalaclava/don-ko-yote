import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { isIntegerBeat, groupIntoLigatures } from '../util.js';

const SUBDIV_WIDTH_REM = 2;

export function GroupTile() {
  return {
    view({ attrs: { sound, lineId, startPos, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;
      const time = piece.time;
      const beatWidthRem = SUBDIV_WIDTH_REM * time;

      const borderClass = isSelected
        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/40'
        : 'border-purple-400 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20';

      const prop = settings.proportionalWidth;
      const displayItems = prop ? null : groupIntoLigatures(sound.sounds, time, startPos);
      let subPos = startPos;

      return (
        <div
          class={`sound-tile relative flex items-stretch border-2 rounded shadow-sm cursor-grab select-none ${borderClass}`}
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
          {prop
            ? sound.sounds.map((s, i) => {
                const isHeadBeat = isIntegerBeat(subPos, time);
                subPos += s.duration;
                return (
                  <div
                    key={s.id ?? i}
                    class={`relative flex flex-col items-start py-1 ${i > 0 ? 'border-l border-purple-200 dark:border-purple-800' : ''}`}
                    style={`width: ${(s.duration / time) * beatWidthRem}rem`}
                  >
                    {isHeadBeat ? (
                      <span
                        class="absolute -top-3 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100"
                        style={`left:${SUBDIV_WIDTH_REM * 0.5}rem`}
                      />
                    ) : null}
                    <div class="flex flex-col items-center" style={`width:${SUBDIV_WIDTH_REM}rem`}>
                      <span
                        class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}`}
                      >
                        {s.name}
                      </span>
                      <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                        {s.hand}
                      </span>
                    </div>
                  </div>
                );
              })
            : displayItems.map((item, gIdx) => {
                const sep = gIdx > 0 ? 'border-l border-purple-200 dark:border-purple-800' : '';
                if (item.sound) {
                  const s = item.sound;
                  return (
                    <div
                      key={s.id}
                      class={`relative flex flex-col items-center px-2 py-1 min-w-[3rem] ${sep}`}
                    >
                      {isIntegerBeat(item.startPos, time) ? (
                        <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                      ) : null}
                      <span
                        class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}`}
                      >
                        {s.name}
                      </span>
                      <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                        {s.hand}
                      </span>
                    </div>
                  );
                }
                // Ligature pair: sounds side by side within a single slot
                let lPos = item.startPos;
                return (
                  <div key={item.sounds[0].id} class={`flex items-stretch ${sep}`}>
                    {item.sounds.map((s, si) => {
                      const isHB = isIntegerBeat(lPos, time);
                      lPos += s.duration;
                      return (
                        <div
                          key={s.id}
                          class={`relative flex flex-col items-center px-1 py-1 ${si > 0 ? 'border-l border-purple-200/60 dark:border-purple-800/60' : ''}`}
                        >
                          {isHB ? (
                            <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                          ) : null}
                          <span
                            class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}`}
                          >
                            {s.name}
                          </span>
                          <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                            {s.hand}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          {isEditing ? <GroupEditor lineId={lineId} sound={sound} /> : null}
        </div>
      );
    },
  };
}

function GroupEditor() {
  return {
    view({ attrs: { lineId, sound } }) {
      return (
        <div
          class="absolute top-full left-0 z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg p-2 flex flex-col gap-1 min-w-[9rem]"
          onclick={(e) => e.stopPropagation()}
        >
          <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">{sound.name}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500">{sound.sounds.length} sounds</span>
          <button
            class="mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-left"
            onclick={() => piece.expandGroup(lineId, sound.id)}
          >
            Expand in place
          </button>
          <button
            class="mt-1 text-xs text-red-500 hover:text-red-700 text-left"
            onclick={() => {
              piece.removeSound(lineId, sound.id);
              piece.setEditingTile(null);
            }}
          >
            Remove
          </button>
        </div>
      );
    },
  };
}
