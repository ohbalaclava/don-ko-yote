import m from 'mithril';
import Sortable from 'sortablejs';
import { piece } from '../data/piece.js';
import { SoundTile } from './SoundTile.jsx';

function lineDuration(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
}

export function Line() {
  let sortable;

  return {
    oncreate({ dom, attrs: { line } }) {
      const container = dom.querySelector('.sounds-container');
      sortable = Sortable.create(container, {
        group: 'sounds',
        animation: 150,
        ghostClass: 'opacity-30',
        onEnd(evt) {
          const soundId = evt.item.dataset.soundId;
          const fromLineId = evt.from.dataset.lineId;
          const toLineId = evt.to.dataset.lineId;
          piece.moveSound(fromLineId, soundId, toLineId, evt.newIndex);
        },
      });
    },
    onremove() {
      if (sortable) sortable.destroy();
    },
    view({ attrs: { line, index } }) {
      const beats = lineDuration(line);
      const selected = piece.selectedLineId === line.id;
      return (
        <div
          class={`flex items-start gap-2 px-3 py-2 border-b border-gray-200 cursor-pointer ${selected ? 'bg-indigo-50 border-l-4 border-l-indigo-400' : 'border-l-4 border-l-transparent'}`}
          onclick={() => piece.selectLine(line.id)}
        >
          <span class={`text-xs w-6 pt-2 shrink-0 text-right ${selected ? 'text-indigo-500 font-bold' : 'text-gray-400'}`}>{index + 1}</span>
          <div
            class="sounds-container flex flex-wrap gap-1 flex-1 min-h-[3.5rem] pt-3"
            data-line-id={line.id}
          >
            {(() => {
              let pos = 0;
              return line.sounds.map(s => {
                const isHeadBeat = Math.abs(pos - Math.round(pos)) < 1e-9;
                pos += s.duration;
                return <SoundTile key={s.id} sound={s} lineId={line.id} isHeadBeat={isHeadBeat} />;
              });
            })()}
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0 pt-1">
            <span class="text-xs text-gray-400">{+beats.toFixed(2)}b</span>
            <button
              class="text-xs text-red-400 hover:text-red-600"
              onclick={() => piece.removeLine(line.id)}
              title="Remove line"
            >✕</button>
          </div>
        </div>
      );
    }
  };
}
