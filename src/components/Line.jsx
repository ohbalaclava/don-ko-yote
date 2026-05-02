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
      return (
        <div class="flex items-start gap-2 px-3 py-2 border-b border-gray-200">
          <span class="text-xs text-gray-400 w-6 pt-2 shrink-0 text-right">{index + 1}</span>
          <div
            class="sounds-container flex flex-wrap gap-1 flex-1 min-h-[3.5rem]"
            data-line-id={line.id}
          >
            {line.sounds.map(s => <SoundTile key={s.id} sound={s} lineId={line.id} />)}
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
