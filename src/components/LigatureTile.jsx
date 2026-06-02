import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';
import { isIntegerBeat, effectiveVolume } from '../util.js';
import { SoundEditor } from './SoundTile.jsx';

export function LigatureTile() {
  return {
    view({ attrs: { sounds, lineId, startPos, selectionIds } }) {
      const et = piece.editingTile;
      const time = piece.time;
      let subPos = startPos;
      const anySelected = selectionIds && sounds.some((s) => selectionIds.has(s.id));
      const anyPlaying = sounds.some((s) => player.isCurrent(s.id));
      const outerBorder = anyPlaying
        ? 'border-green-500 dark:border-green-400 ring-2 ring-green-400'
        : anySelected
          ? 'border-teal-500 dark:border-teal-400'
          : 'border-gray-300 dark:border-gray-600';

      return (
        <div
          class={`relative flex items-stretch border bg-white dark:bg-gray-800 rounded shadow-sm cursor-grab select-none ${outerBorder}`}
          data-sound-id={sounds[0].id}
          data-ligature-ids={sounds.map((s) => s.id).join(',')}
        >
          {sounds.map((sound, idx) => {
            const pos = subPos;
            subPos += sound.duration;
            const isHeadBeat = isIntegerBeat(pos, time);
            const isEditing =
              !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;
            const isSelected = selectionIds ? selectionIds.has(sound.id) : false;
            const isPlaying = player.isCurrent(sound.id);

            const edgePad = idx === 0 ? 'pl-1' : idx === sounds.length - 1 ? 'pr-1' : '';
            const subBg = isPlaying
              ? 'bg-green-100 dark:bg-green-900/40'
              : isSelected
                ? 'bg-teal-50 dark:bg-teal-900/40'
                : '';
            return (
              <div
                key={sound.id}
                class={`sound-tile relative flex flex-col items-center py-1 ${edgePad} ${subBg}`}
                data-sound-id={sound.id}
                onclick={(e) => {
                  e.stopPropagation();
                  if (piece.selectMode) return;
                  piece.setEditingTile(isEditing ? null : { lineId, soundId: sound.id });
                }}
                onpointerup={(e) => {
                  if (!piece.selectMode) return;
                  e.stopPropagation();
                  piece.toggleSoundSelection(lineId, sound.id);
                }}
              >
                {isHeadBeat ? (
                  <span class="beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                ) : null}
                <span
                  class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}${sound.emphasis ? ' underline' : ''}`}
                >
                  {sound.name}
                </span>
                {piece.showVolume && effectiveVolume(sound) != null ? (
                  <div class="w-full flex justify-between text-xs text-gray-400 dark:text-gray-500 font-mono px-1">
                    <span>{sound.hand}</span>
                    <span>{effectiveVolume(sound)}</span>
                  </div>
                ) : (
                  <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {sound.hand}
                  </span>
                )}
                {isEditing ? <SoundEditor lineId={lineId} sound={sound} /> : null}
              </div>
            );
          })}
        </div>
      );
    },
  };
}
