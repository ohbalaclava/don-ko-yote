import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';

const TE_WIDTH_REM = 2;
const BEAT_WIDTH_REM = TE_WIDTH_REM * 4;

export function GroupTile() {
  return {
    view({ attrs: { sound, lineId, startPos, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;

      const borderClass = isSelected
        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-900/40'
        : 'border-purple-400 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20';

      let subPos = startPos;

      return (
        <div
          class={`sound-tile relative flex items-stretch border-2 rounded shadow-sm cursor-grab select-none ${borderClass}`}
          data-sound-id={sound.id}
          onpointerup={e => {
            if (!piece.selectMode) return;
            e.stopPropagation();
            piece.toggleSoundSelection(lineId, sound.id);
          }}
          onclick={e => {
            e.stopPropagation();
            if (piece.selectMode) return;
            piece.setEditingTile(isEditing ? null : { lineId, soundId: sound.id });
          }}
        >
          {sound.sounds.map((s, i) => {
            const isHeadBeat = Math.abs(subPos - Math.round(subPos)) < 1e-9;
            subPos += s.duration;
            const widthStyle = settings.proportionalWidth
              ? `width: ${s.duration * BEAT_WIDTH_REM}rem`
              : undefined;
            return (
              <div
                key={s.id ?? i}
                class={`relative flex flex-col items-center px-2 py-1 ${settings.proportionalWidth ? '' : 'min-w-[3rem]'} ${i > 0 ? 'border-l border-purple-200 dark:border-purple-800' : ''}`}
                style={widthStyle}
              >
                {isHeadBeat ? <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" /> : null}
                <span class={`font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}`}>{s.name}</span>
                <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{s.hand}</span>
              </div>
            );
          })}
          {isEditing ? <GroupEditor lineId={lineId} sound={sound} /> : null}
        </div>
      );
    }
  };
}

function GroupEditor() {
  return {
    view({ attrs: { lineId, sound } }) {
      return (
        <div
          class="absolute top-full left-0 z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg p-2 flex flex-col gap-1 min-w-[9rem]"
          onclick={e => e.stopPropagation()}
        >
          <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">{sound.name}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500">{sound.sounds.length} sounds</span>
          <button
            class="mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-left"
            onclick={() => piece.expandGroup(lineId, sound.id)}
          >Expand in place</button>
          <button
            class="mt-1 text-xs text-red-500 hover:text-red-700 text-left"
            onclick={() => { piece.removeSound(lineId, sound.id); piece.setEditingTile(null); }}
          >Remove</button>
        </div>
      );
    }
  };
}