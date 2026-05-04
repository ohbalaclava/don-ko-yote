import m from 'mithril';
import { piece } from '../data/piece.js';

export function SoundTile() {
  return {
    view({ attrs: { sound, lineId, isHeadBeat, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;

      const borderClass = isSelected
        ? 'border-indigo-500 bg-indigo-50'
        : 'border-gray-300 bg-white';

      return (
        <div
          class={`sound-tile relative flex flex-col items-center border rounded shadow-sm px-2 py-1 cursor-grab select-none min-w-[3rem] ${borderClass}`}
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
          {isHeadBeat ? <span class="beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900" /> : null}
          <span class="font-bold text-base leading-tight">{sound.name}</span>
          {sound.instruction
            ? <span class="text-xs text-gray-500 mt-0.5 text-center leading-tight">{sound.instruction}</span>
            : null}
          <span class="text-xs text-gray-400 font-mono">{sound.hand}</span>
          {isEditing ? <SoundEditor lineId={lineId} sound={sound} /> : null}
        </div>
      );
    }
  };
}

function SoundEditor() {
  return {
    view({ attrs: { lineId, sound } }) {
      return (
        <div
          class="absolute top-full left-0 z-20 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 flex flex-col gap-1 min-w-[8rem]"
          onclick={e => e.stopPropagation()}
        >
          <label class="text-xs font-semibold text-gray-600">Hand</label>
          <div class="flex gap-1">
            {['L', 'R'].map(h => (
              <button
                class={`flex-1 rounded py-0.5 text-sm font-bold border ${sound.hand === h ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300'}`}
                onclick={() => piece.updateSound(lineId, sound.id, { hand: h })}
              >{h}</button>
            ))}
          </div>
          <label class="text-xs font-semibold text-gray-600 mt-1">Instruction</label>
          <input
            class="border border-gray-300 rounded px-1 py-0.5 text-xs"
            value={sound.instruction}
            oninput={e => piece.updateSound(lineId, sound.id, { instruction: e.target.value })}
            placeholder="e.g. step left"
          />
          <button
            class="mt-1 text-xs text-red-500 hover:text-red-700 text-left"
            onclick={() => { piece.removeSound(lineId, sound.id); piece.setEditingTile(null); }}
          >Remove</button>
        </div>
      );
    }
  };
}
