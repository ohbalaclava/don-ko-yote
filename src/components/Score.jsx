import m from 'mithril';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { Line } from './Line.jsx';

export function Score() {
  async function savePattern() {
    const line = piece.lines.find(l => l.id === piece.selection.lineId);
    if (!line) return;
    const selectedSet = new Set(piece.selection.soundIds);
    const sounds = line.sounds
      .filter(s => selectedSet.has(s.id))
      .map(({ id: _id, ...rest }) => rest);
    const name = sounds.map(s => s.name).join(' ');
    await patternStore.save(name, sounds);
    piece.clearSelection();
  }

  return {
    view() {
      const selCount = piece.selection.soundIds.length;
      const hasSelection = piece.selectMode && selCount > 0;

      return (
        <div class="flex-1 overflow-y-auto flex flex-col">
          <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shrink-0">
            <button
              class={`text-xs font-semibold rounded px-2 py-1 border ${piece.selectMode ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400'}`}
              onclick={() => piece.toggleSelectMode()}
            >{piece.selectMode ? 'Cancel' : 'Select'}</button>

            {hasSelection
              ? [
                  <span class="text-xs text-gray-500 dark:text-gray-400">{selCount} selected</span>,
                  <button
                    class="text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded px-2 py-1"
                    onclick={savePattern}
                  >Save pattern</button>
                ]
              : piece.selectMode
                ? <span class="text-xs text-gray-400 dark:text-gray-500">Tap tiles to select</span>
                : null}
          </div>

          {piece.lines.map((line, i) => (
            <Line key={line.id} line={line} index={i} />
          ))}

          <div class="px-3 py-2">
            <button
              class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold"
              onclick={() => piece.addLine()}
            >+ Add line</button>
          </div>
        </div>
      );
    }
  };
}