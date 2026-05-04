import m from 'mithril';
import { piece } from '../data/piece.js';

export function GroupTile() {
  return {
    view({ attrs: { sound, lineId, startPos, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;

      const borderClass = isSelected
        ? 'border-indigo-500 bg-indigo-50'
        : 'border-purple-400 bg-purple-50';

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
            return (
              <div
                key={s.id ?? i}
                class={`relative flex flex-col items-center px-2 py-1 min-w-[3rem] ${i > 0 ? 'border-l border-purple-200' : ''}`}
              >
                {isHeadBeat ? <span class="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900" /> : null}
                <span class="font-bold text-base leading-tight">{s.name}</span>
                <span class="text-xs text-gray-400 font-mono">{s.hand}</span>
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
          class="absolute top-full left-0 z-20 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 flex flex-col gap-1 min-w-[9rem]"
          onclick={e => e.stopPropagation()}
        >
          <span class="text-xs font-semibold text-gray-700">{sound.name}</span>
          <span class="text-xs text-gray-400">{sound.sounds.length} sounds</span>
          <button
            class="mt-1 text-xs text-indigo-600 hover:text-indigo-800 text-left"
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
