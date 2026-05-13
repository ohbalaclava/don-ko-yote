import m from 'mithril';
import Sortable from 'sortablejs';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { SoundTile } from './SoundTile.jsx';
import { GroupTile } from './GroupTile.jsx';
import { LigatureTile } from './LigatureTile.jsx';

function lineDuration(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
}

/**
 * Groups consecutive sub-beat sounds of equal duration within the same beat
 * into ligature display items (non-proportional mode only).
 * Adjacent sounds qualify if they share the same duration, are in the same beat,
 * and alternate hands. Groups of one are emitted as single-sound items.
 * In non-proportional mode, inserts { type: 'beat-marker', beat } items after any
 * sound whose span crosses an integer beat that would otherwise go unmarked.
 * @param {Array} sounds
 * @param {boolean} proportional
 * @returns {Array}
 */
function groupSoundsForDisplay(sounds, proportional) {
  const items = [];
  let pos = 0;
  let i = 0;

  while (i < sounds.length) {
    const s = sounds[i];
    const startPos = pos;
    pos += s.duration;
    i++;

    if (proportional || s.type === 'group' || s.duration >= 1) {
      items.push({ sound: s, startPos });
      if (!proportional) {
        const end = startPos + s.duration;
        for (let beat = Math.floor(startPos) + 1; beat < end - 1e-9; beat++) {
          items.push({ type: 'beat-marker', beat });
        }
      }
      continue;
    }

    const group = [s];
    const dur = s.duration;

    while (i < sounds.length) {
      const next = sounds[i];
      // next must have the same duration and start in the same beat as the last sound
      if (
        next.type !== 'group' &&
        Math.abs(next.duration - dur) < 1e-9 &&
        Math.floor(pos - dur) === Math.floor(pos) &&
        next.hand !== group[group.length - 1].hand
      ) {
        group.push(next);
        pos += next.duration;
        i++;
      } else {
        break;
      }
    }

    const item = group.length === 1 ? { sound: group[0], startPos } : { sounds: group, startPos };
    items.push(item);

    // Check for beat boundaries crossed by this item
    const itemDur = group.reduce((sum, x) => sum + x.duration, 0);
    const end = startPos + itemDur;
    for (let beat = Math.floor(startPos) + 1; beat < end - 1e-9; beat++) {
      items.push({ type: 'beat-marker', beat });
    }
  }

  return items;
}

/**
 * Maps a SortableJS DOM drop index to the corresponding data array index,
 * accounting for ligature tiles that each represent multiple sounds.
 * @param {HTMLElement} container
 * @param {number} domIndex - Index of the dropped element among container's children.
 * @returns {number} Equivalent index into the line's sounds array.
 */
function domIndexToDataIndex(container, domIndex) {
  const children = Array.from(container.children);
  let count = 0;
  for (let i = 0; i < domIndex; i++) {
    const ids = children[i].dataset.ligatureIds;
    count += ids ? ids.split(',').length : 1;
  }
  return count;
}

const INSTR_LINE_HEIGHT = 18;

/**
 * Measures instruction label positions for all sounds in a line, laying them out
 * in non-overlapping horizontal tracks below their tiles using a canvas for text measurement.
 * Groups tiles by visual row (snapped to a 5px grid to tolerate subpixel differences).
 * @param {HTMLElement} dom - The Line component's root DOM node.
 * @param {{ sounds: Array }} line
 * @returns {{ layouts: Array<{ id: string, left: number, top: number, text: string }>, paddingBottom: number } | null}
 */
function measureInstructions(dom, line) {
  const wrapper = dom.querySelector('.sounds-and-instructions');
  if (!wrapper) return null;

  const wrapperRect = wrapper.getBoundingClientRect();
  const tiles = Array.from(wrapper.querySelectorAll('.sound-tile[data-sound-id]'));

  const items = [];
  for (const tile of tiles) {
    const sound = line.sounds.find((s) => s.id === tile.dataset.soundId);
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
  let lpTimer = null;
  let lpSoundId = null;
  let lpLineId = null;
  let lpStartX, lpStartY;

  // Long-press detection: after 500ms without moving more than 5px, enters select
  // mode and selects the pressed tile. Movement cancels the timer.
  function lpStart(e) {
    if (piece.selectMode) return;
    const tile = e.target.closest('.sound-tile[data-sound-id], [data-ligature-ids]');
    if (!tile) return;
    lpSoundId = tile.dataset.soundId ?? tile.dataset.ligatureIds?.split(',')[0];
    lpLineId = tile.closest('[data-line-id]')?.dataset.lineId;
    if (!lpSoundId || !lpLineId) return;
    lpStartX = e.clientX;
    lpStartY = e.clientY;
    lpTimer = setTimeout(() => {
      lpTimer = null;
      if (!piece.selectMode) {
        piece.toggleSelectMode();
        piece.toggleSoundSelection(lpLineId, lpSoundId);
      }
    }, 500);
  }

  function lpMove(e) {
    if (lpTimer == null) return;
    const dx = e.clientX - lpStartX;
    const dy = e.clientY - lpStartY;
    if (dx * dx + dy * dy > 25) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  }

  function lpEnd() {
    if (lpTimer != null) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  }

  // SortableJS is disabled while select mode is active to prevent accidental drags
  // from interfering with tap-based selection.
  function ensureSortable() {
    if (piece.selectMode) {
      if (sortable) {
        sortable.destroy();
        sortable = null;
      }
      return;
    }
    if (sortable) return;
    sortable = Sortable.create(container, {
      group: 'sounds',
      filter: '.beat-marker-divider',
      animation: 150,
      ghostClass: 'opacity-30',
      onEnd(evt) {
        const ligatureIds = evt.item.dataset.ligatureIds;
        const fromLineId = evt.from.dataset.lineId;
        const toLineId = evt.to.dataset.lineId;
        const toDataIndex = domIndexToDataIndex(evt.to, evt.newIndex);
        if (ligatureIds) {
          piece.moveSounds(fromLineId, ligatureIds.split(','), toLineId, toDataIndex);
        } else {
          piece.moveSound(fromLineId, evt.item.dataset.soundId, toLineId, toDataIndex);
        }
      },
    });
  }

  // Runs measureInstructions and triggers a redraw only when the result changed,
  // avoiding an infinite loop (onupdate → redraw → onupdate → …).
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
    view({ attrs: { line, index, inBlockRepeat } }) {
      const beats = lineDuration(line);
      const selected = piece.selectedLineId === line.id;
      const isLineSelected = piece.lineSelection.includes(line.id);
      const selectionIds =
        piece.selectMode && piece.selection.lineId === line.id
          ? new Set(piece.selection.soundIds)
          : null;

      const isHighlighted =
        piece.lineSelectMode && isLineSelected
          ? 'bg-teal-50 dark:bg-teal-900/20 border-l-4 border-l-teal-400'
          : !piece.lineSelectMode && selected
            ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-400'
            : inBlockRepeat
              ? 'border-l-4 border-l-orange-400 bg-orange-50/40 dark:bg-orange-900/10'
              : 'border-l-4 border-l-transparent';

      return (
        <div
          class={`flex items-start gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 cursor-pointer ${isHighlighted}`}
          onclick={() => {
            if (piece.lineSelectMode) {
              piece.toggleLineSelection(line.id);
            } else {
              piece.selectLine(line.id);
            }
          }}
        >
          <div
            class="line-drag-handle flex flex-col items-center gap-0.5 shrink-0 pt-1 cursor-grab select-none"
            title="Drag to reorder"
          >
            <span class="text-gray-300 dark:text-gray-600 text-sm leading-none">⠿</span>
            <span
              class={`text-xs ${selected ? 'text-indigo-500 dark:text-indigo-400 font-bold' : 'text-gray-400 dark:text-gray-500'}`}
            >
              {index + 1}
            </span>
          </div>
          <div
            class="sounds-and-instructions relative flex-1 min-w-0"
            style={wrapperPaddingBottom ? `padding-bottom: ${wrapperPaddingBottom}px` : ''}
          >
            <div class="flex items-start gap-1">
              <div
                class="sounds-container flex flex-wrap gap-x-1 gap-y-4 min-h-[3.5rem] pt-3 flex-1"
                data-line-id={line.id}
                onpointerdown={lpStart}
                onpointermove={lpMove}
                onpointerup={lpEnd}
                onpointercancel={lpEnd}
                onpointerleave={lpEnd}
              >
                {groupSoundsForDisplay(line.sounds, settings.proportionalWidth).map((item) => {
                  if (item.type === 'beat-marker') {
                    return (
                      <span
                        key={'bm-' + item.beat}
                        class="beat-marker-divider self-stretch relative flex flex-col items-center pointer-events-none select-none"
                        style="width:2px"
                      >
                        <span class="beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
                        <span class="w-px h-full bg-gray-300 dark:bg-gray-600" />
                      </span>
                    );
                  }
                  if (item.sounds) {
                    return (
                      <LigatureTile
                        key={item.sounds[0].id}
                        sounds={item.sounds}
                        lineId={line.id}
                        startPos={item.startPos}
                        selectionIds={selectionIds}
                      />
                    );
                  }
                  const s = item.sound;
                  if (s.type === 'group') {
                    return (
                      <GroupTile
                        key={s.id}
                        sound={s}
                        lineId={line.id}
                        startPos={item.startPos}
                        isSelected={selectionIds ? selectionIds.has(s.id) : false}
                      />
                    );
                  }
                  return (
                    <SoundTile
                      key={s.id}
                      sound={s}
                      lineId={line.id}
                      startPos={item.startPos}
                      isSelected={selectionIds ? selectionIds.has(s.id) : false}
                    />
                  );
                })}
              </div>
            </div>
            {instructionLayouts.map((layout) => (
              <span
                key={layout.id}
                class="absolute text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap pointer-events-none"
                style={`left: ${layout.left}px; top: ${layout.top}px`}
              >
                {layout.text}
              </span>
            ))}
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0 pt-1">
            <span class="text-xs text-gray-400 dark:text-gray-500">{+beats.toFixed(2)}b</span>
            <button
              class="text-xs text-red-400 hover:text-red-600"
              onclick={(e) => {
                e.stopPropagation();
                piece.removeLine(line.id);
              }}
              title="Remove line"
            >
              ✕
            </button>
          </div>
        </div>
      );
    },
  };
}
