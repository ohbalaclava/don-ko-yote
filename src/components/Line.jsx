import m from 'mithril';
import Sortable from 'sortablejs';
import { piece } from '../data/piece.js';
import { SoundTile } from './SoundTile.jsx';
import { GroupTile } from './GroupTile.jsx';

function lineDuration(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
}

const INSTR_LINE_HEIGHT = 18;

function measureInstructions(dom, line) {
  const wrapper = dom.querySelector('.sounds-and-instructions');
  if (!wrapper) return null;

  const wrapperRect = wrapper.getBoundingClientRect();
  const tiles = Array.from(wrapper.querySelectorAll('.sound-tile[data-sound-id]'));

  const items = [];
  for (const tile of tiles) {
    const sound = line.sounds.find(s => s.id === tile.dataset.soundId);
    if (!sound?.instruction) continue;
    const rect = tile.getBoundingClientRect();
    items.push({
      id: sound.id,
      left: rect.left - wrapperRect.left + 4,
      rowTop: rect.top - wrapperRect.top,
      tileHeight: rect.height,
      text: sound.instruction,
    });
  }

  if (!items.length) return { layouts: [], paddingBottom: 0 };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif';

  // Group items by visual row (snap rowTop to 5px grid to tolerate subpixel diffs)
  const rowMap = new Map();
  for (const item of items) {
    const key = Math.round(item.rowTop / 5) * 5;
    if (!rowMap.has(key)) rowMap.set(key, []);
    rowMap.get(key).push(item);
  }

  const layouts = [];
  let maxBottom = 0;

  for (const rowItems of rowMap.values()) {
    rowItems.sort((a, b) => a.left - b.left);
    const trackEnds = [];
    for (const item of rowItems) {
      let track = 0;
      while (track < trackEnds.length && trackEnds[track] > item.left) track++;
      trackEnds[track] = item.left + ctx.measureText(item.text).width;
      const top = item.rowTop + item.tileHeight + 2 + track * INSTR_LINE_HEIGHT;
      layouts.push({ id: item.id, left: item.left, top, text: item.text });
      if (top + INSTR_LINE_HEIGHT > maxBottom) maxBottom = top + INSTR_LINE_HEIGHT;
    }
  }

  const soundsContainer = wrapper.querySelector('.sounds-container');
  const soundsHeight = soundsContainer ? soundsContainer.offsetHeight : 0;
  const paddingBottom = Math.max(0, maxBottom - soundsHeight + 4);

  return { layouts, paddingBottom };
}

export function Line() {
  let sortable;
  let container;
  let instructionLayouts = [];
  let wrapperPaddingBottom = 0;

  function ensureSortable() {
    if (piece.selectMode) {
      if (sortable) { sortable.destroy(); sortable = null; }
      return;
    }
    if (sortable) return;
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
  }

  function applyLayouts(dom, line) {
    const result = measureInstructions(dom, line);
    if (!result) return;
    const { layouts, paddingBottom } = result;
    const changed =
      paddingBottom !== wrapperPaddingBottom ||
      JSON.stringify(layouts) !== JSON.stringify(instructionLayouts);
    if (changed) {
      instructionLayouts = layouts;
      wrapperPaddingBottom = paddingBottom;
      m.redraw();
    }
  }

  return {
    oncreate({ dom, attrs: { line } }) {
      container = dom.querySelector('.sounds-container');
      ensureSortable();
      applyLayouts(dom, line);
    },
    onupdate({ dom, attrs: { line } }) {
      ensureSortable();
      applyLayouts(dom, line);
    },
    onremove() {
      if (sortable) sortable.destroy();
    },
    view({ attrs: { line, index } }) {
      const beats = lineDuration(line);
      const selected = piece.selectedLineId === line.id;
      const selectionIds = piece.selectMode && piece.selection.lineId === line.id
        ? new Set(piece.selection.soundIds)
        : null;

      return (
        <div
          class={`flex items-start gap-2 px-3 py-2 border-b border-gray-200 cursor-pointer ${selected ? 'bg-indigo-50 border-l-4 border-l-indigo-400' : 'border-l-4 border-l-transparent'}`}
          onclick={() => piece.selectLine(line.id)}
        >
          <span class={`text-xs w-6 pt-2 shrink-0 text-right ${selected ? 'text-indigo-500 font-bold' : 'text-gray-400'}`}>{index + 1}</span>
          <div
            class="sounds-and-instructions relative flex-1 min-w-0"
            style={wrapperPaddingBottom ? `padding-bottom: ${wrapperPaddingBottom}px` : ''}
          >
            <div
              class="sounds-container flex flex-wrap gap-1 min-h-[3.5rem] pt-3"
              data-line-id={line.id}
            >
              {(() => {
                let pos = 0;
                return line.sounds.map(s => {
                  const startPos = pos;
                  pos += s.duration;
                  if (s.type === 'group') {
                    return (
                      <GroupTile
                        key={s.id}
                        sound={s}
                        lineId={line.id}
                        startPos={startPos}
                        isSelected={selectionIds ? selectionIds.has(s.id) : false}
                      />
                    );
                  }
                  return (
                    <SoundTile
                      key={s.id}
                      sound={s}
                      lineId={line.id}
                      isHeadBeat={Math.abs(startPos - Math.round(startPos)) < 1e-9}
                      isSelected={selectionIds ? selectionIds.has(s.id) : false}
                    />
                  );
                });
              })()}
            </div>
            {instructionLayouts.map(layout => (
              <span
                key={layout.id}
                class="absolute text-xs text-gray-600 whitespace-nowrap pointer-events-none"
                style={`left: ${layout.left}px; top: ${layout.top}px`}
              >
                {layout.text}
              </span>
            ))}
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0 pt-1">
            <span class="text-xs text-gray-400">{+beats.toFixed(2)}b</span>
            <button
              class="text-xs text-red-400 hover:text-red-600"
              onclick={e => { e.stopPropagation(); piece.removeLine(line.id); }}
              title="Remove line"
            >✕</button>
          </div>
        </div>
      );
    }
  };
}
