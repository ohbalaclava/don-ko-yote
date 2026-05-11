import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { isIntegerBeat } from '../util.js';
import { SoundEditor } from './SoundTile.jsx';

export function LigatureTile() {
  return {
    view({ attrs: { sounds, lineId, startPos, selectionIds } }) {
      const et = piece.editingTile;
      let subPos = startPos;

      return (
        <div
          class="relative flex items-stretch border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 rounded shadow-sm cursor-grab select-none px-1"
          data-sound-id={sounds[0].id}
          data-ligature-ids={sounds.map((s) => s.id).join(',')}
        >
          {sounds.map((sound, idx) => {
            const pos = subPos;
            subPos += sound.duration;
            const isHeadBeat = isIntegerBeat(pos);
            const isEditing =
              !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;
            const isSelected = selectionIds ? selectionIds.has(sound.id) : false;

            return (
              <div
                key={sound.id}
                class={`sound-tile relative flex flex-col items-center py-1 ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/40' : ''}`}
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
                <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{sound.hand}</span>
                {isEditing ? <SoundEditor lineId={lineId} sound={sound} /> : null}
              </div>
            );
          })}
        </div>
      );
    },
  };
}
