import m from 'mithril';
import Sortable from 'sortablejs';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { settings } from '../data/settings.js';
import { SoundTile } from './SoundTile.jsx';
import { LigatureTile } from './LigatureTile.jsx';
import { repeatDecoration, repeatBarsWidth } from './repeatDecoration.js';
import { packIntoTracks, groupSoundsForDisplay, formatBeats } from '../util.js';
import { player } from '../audio/player.js';
import { touchDragDelay } from '../drag.js';

function lineDuration(line) {
  return line.sounds.reduce((sum, s) => sum + s.duration, 0);
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
    const el = children[i];
    // Skip non-sound elements (beat markers, repeat counter, etc.)
    if (!el.dataset.soundId && !el.dataset.ligatureIds) continue;
    count += el.dataset.ligatureIds ? el.dataset.ligatureIds.split(',').length : 1;
  }
  return count;
}

/**
 * SortableJS `onAdd` handler for a line's sounds-container. Only acts on clones
 * dragged from the palette (`evt.pullMode === 'clone'`); in-score cross-line moves
 * are left to the source line's `onEnd`. Reads the palette tile's `data-palette-*`
 * attributes to resolve a symbol or pattern, removes the clone SortableJS inserted
 * (so Mithril's vdom stays authoritative), then commits the insertion at the drop
 * index. The commit calls `m.redraw()`, which repaints both the line and the palette.
 * @param {Sortable.SortableEvent} evt
 */
function handlePaletteDrop(evt) {
  if (evt.pullMode !== 'clone') return;
  const toLineId = evt.to.dataset.lineId;
  const toIndex = domIndexToDataIndex(evt.to, evt.newIndex);
  const ds = evt.item.dataset;
  // Restore the palette's Mithril-owned DOM. With pull:'clone', SortableJS moved the
  // original tile (evt.item, which Mithril still tracks) into this line and left a
  // non-Mithril clone (evt.clone) in the palette. Put the original back in the
  // palette where the clone sits and drop the clone, so Mithril's vdom stays
  // authoritative and the line loses the stray node. (Falls back to a plain remove
  // if no clone exists.)
  if (evt.clone?.parentNode) {
    evt.clone.parentNode.replaceChild(evt.item, evt.clone);
  } else {
    evt.item.remove();
  }
  if (ds.palettePattern != null) {
    const pattern = patternStore.items.find((p) => p.id === ds.palettePattern);
    if (pattern) piece.addGroup(toLineId, pattern, toIndex);
  } else if (ds.paletteImplicit != null) {
    piece.addSound(toLineId, { name: '—', duration: piece.time, implicit: true }, toIndex);
  } else if (ds.paletteSilent != null) {
    piece.addSound(toLineId, { name: '', duration: piece.time, silent: true }, toIndex);
  } else if (ds.paletteSound != null) {
    const sym = piece.symbolSet.symbols.find((s) => s.name === ds.paletteSound);
    if (sym) piece.addSound(toLineId, sym, toIndex);
  }
}

const INSTR_LINE_HEIGHT = 18;

const DEFAULT_ROW_GAP = 16; // matches former gap-y-4 (1rem)

/**
 * Computes a stable string representing the identity and instruction state of all
 * sounds in a line. Used to detect stale instruction positions: when the view renders
 * with a line whose hash differs from the last measured hash, stale layouts are
 * suppressed rather than shown at incorrect positions.
 * @param {{ sounds: Array }} line
 * @returns {string}
 */
function computeLineHash(line) {
  return line.sounds
    .map((s) => `${s.id}:${s.duration}:${s.type ?? ''}:${s.instruction ?? ''}`)
    .join('|');
}

/**
 * Measures instruction label positions for all sounds in a line, laying them out
 * in non-overlapping horizontal tracks below their tiles using a canvas for text measurement.
 * Groups tiles by visual row (snapped to a 5px grid to tolerate subpixel differences).
 * Also computes the row-gap needed so that instruction labels on each visual row do not
 * overlap the tile row below it. Uses the maximum track count across all non-last rows
 * to derive a single uniform row-gap for the flex-wrap sounds container.
 * @param {HTMLElement} dom - The Line component's root DOM node.
 * @param {{ sounds: Array }} line
 * @returns {{ layouts: Array<{ id: string, left: number, top: number, text: string }>, paddingBottom: number, rowGap: number } | null}
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

  if (!items.length) return { layouts: [], paddingBottom: 0, rowGap: DEFAULT_ROW_GAP };

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '15px ui-sans-serif, system-ui, sans-serif';

  // Group items by visual row (snap rowTop to 5px grid to tolerate subpixel diffs)
  const rowMap = new Map();
  for (const item of items) {
    const key = Math.round(item.rowTop / 5) * 5;
    if (!rowMap.has(key)) rowMap.set(key, []);
    rowMap.get(key).push(item);
  }

  // Find the true last visual row by querying all tile elements (including those
  // without instructions), so rows whose instructions sit just above the last row
  // of tiles are correctly treated as non-last rows.
  const allTiles = Array.from(wrapper.querySelectorAll('[data-sound-id], [data-ligature-ids]'));
  let absoluteLastRowKey = 0;
  for (const tile of allTiles) {
    const key = Math.round((tile.getBoundingClientRect().top - wrapperRect.top) / 5) * 5;
    if (key > absoluteLastRowKey) absoluteLastRowKey = key;
  }

  const layouts = [];
  let maxBottom = 0;
  // Track how many instruction tracks each row needs (for computing row-gap).
  const rowTrackCounts = new Map(); // rowKey → number of tracks used

  for (const [rowKey, rowItems] of rowMap.entries()) {
    rowItems.sort((a, b) => a.left - b.left);
    const spans = rowItems.map((item) => ({
      start: item.left,
      end: item.left + ctx.measureText(item.text).width,
    }));
    const { tracks, trackCount } = packIntoTracks(spans);
    rowItems.forEach((item, i) => {
      const top = item.rowTop + item.tileHeight + 2 + tracks[i] * INSTR_LINE_HEIGHT;
      layouts.push({ id: item.id, left: item.left, top, text: item.text });
      if (top + INSTR_LINE_HEIGHT > maxBottom) maxBottom = top + INSTR_LINE_HEIGHT;
    });
    rowTrackCounts.set(rowKey, trackCount);
  }

  const soundsContainer = wrapper.querySelector('.sounds-container');
  const soundsHeight = soundsContainer ? soundsContainer.offsetHeight : 0;
  const paddingBottom = Math.max(0, maxBottom - soundsHeight + 4);

  // The CSS row-gap must clear two things that protrude into the inter-row space:
  //   • Instructions: start 2px below the tile bottom, each track is INSTR_LINE_HEIGHT tall.
  //   • Beat dots: the next row's tiles have beat dots positioned at -top-3 (-12px),
  //     so the dot's top edge sits 12px above the next row's tile top edge.
  // The dot must clear the instruction bottom, so:
  //   rowGap ≥ (2 + numTracks × INSTR_LINE_HEIGHT) + 12 = 14 + numTracks × INSTR_LINE_HEIGHT
  // An extra 6px of breathing room is added for visual comfort.
  // We use the maximum across all non-last rows (gap applies uniformly to all rows).
  let maxNonLastRowTracks = 0;
  for (const [rowKey, trackCount] of rowTrackCounts.entries()) {
    if (rowKey !== absoluteLastRowKey) {
      maxNonLastRowTracks = Math.max(maxNonLastRowTracks, trackCount);
    }
  }
  const rowGap =
    maxNonLastRowTracks > 0
      ? Math.max(DEFAULT_ROW_GAP, 14 + maxNonLastRowTracks * INSTR_LINE_HEIGHT + 6)
      : DEFAULT_ROW_GAP;

  return { layouts, paddingBottom, rowGap };
}

export function Line() {
  let sortable;
  let container;
  let instructionLayouts = [];
  let wrapperPaddingBottom = 0;
  let soundsRowGap = DEFAULT_ROW_GAP;
  // Stale-detection: layouts are only shown when the line data matches what was measured.
  let measuredLineHash = '';
  // ResizeObserver fires when the container width changes (e.g. viewport resize), so
  // instruction positions are recomputed even when Mithril doesn't redraw.
  let resizeObserver = null;
  let lastDom = null;
  let lastLine = null;
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
      filter: '.beat-marker-divider, .repeat-counter',
      animation: 150,
      ghostClass: 'opacity-30',
      ...touchDragDelay,
      // Once a drag is genuinely underway, the held tile must not also trigger
      // long-press selection.
      onStart: lpEnd,
      onAdd: handlePaletteDrop,
      onEnd(evt) {
        const ligatureIds = evt.item.dataset.ligatureIds;
        const fromLineId = evt.from.dataset.lineId;
        const toLineId = evt.to.dataset.lineId;
        const toDataIndex = domIndexToDataIndex(evt.to, evt.newIndex);
        // Undo SortableJS's physical DOM mutation before touching the data model.
        // SortableJS moves the dragged node directly in the DOM (across containers
        // for cross-line drags), which desyncs Mithril's virtual DOM and corrupts
        // subsequent patches. Reverting to the pre-drag DOM lets the data-model
        // change below re-render from a consistent baseline. evt.oldIndex is a full
        // DOM-child index (matching domIndexToDataIndex's use of evt.newIndex).
        evt.item.remove();
        evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] || null);
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
    const { layouts, paddingBottom, rowGap } = result;
    const newHash = computeLineHash(line);
    const changed =
      paddingBottom !== wrapperPaddingBottom ||
      rowGap !== soundsRowGap ||
      newHash !== measuredLineHash ||
      JSON.stringify(layouts) !== JSON.stringify(instructionLayouts);
    if (changed) {
      instructionLayouts = layouts;
      wrapperPaddingBottom = paddingBottom;
      soundsRowGap = rowGap;
      measuredLineHash = newHash;
      m.redraw();
    }
  }

  return {
    oncreate({ dom, attrs: { line } }) {
      container = dom.querySelector('.sounds-container');
      lastDom = dom;
      lastLine = line;
      ensureSortable();
      applyLayouts(dom, line);
      // Recompute instruction positions whenever the container is resized (e.g. on
      // viewport resize). Mithril's onupdate only fires on state changes, so without
      // this observer a resize can leave instructions at pre-resize coordinates.
      resizeObserver = new ResizeObserver(() => {
        if (lastDom && lastLine) applyLayouts(lastDom, lastLine);
      });
      resizeObserver.observe(container);
    },
    onupdate({ dom, attrs: { line } }) {
      lastDom = dom;
      lastLine = line;
      ensureSortable();
      applyLayouts(dom, line);
    },
    onremove() {
      if (sortable) sortable.destroy();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    },
    view({ attrs: { line, index, repeatDepth = 0, singleRepeat = null } }) {
      const time = piece.time;
      const beatLabel = formatBeats(lineDuration(line), time);
      const selected = piece.selectedLineId === line.id;
      const isLineSelected = piece.lineSelection.includes(line.id);
      const selectionIds =
        piece.selectMode && piece.selection.lineId === line.id
          ? new Set(piece.selection.soundIds)
          : null;

      const showRepeatBars =
        repeatDepth > 0 &&
        !(piece.lineSelectMode && isLineSelected) &&
        !(!piece.lineSelectMode && selected);
      const isJiuchi = !!line.jiuchiId;
      const sideClass =
        piece.lineSelectMode && isLineSelected
          ? 'border-l-4 border-l-teal-400 bg-teal-50 dark:bg-teal-900/20'
          : !piece.lineSelectMode && selected
            ? 'border-l-4 border-l-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
            : isJiuchi
              ? 'border-l-4 border-l-amber-400 bg-amber-50 dark:bg-amber-900/20'
              : showRepeatBars
                ? 'border-l-4 border-l-transparent bg-orange-50 dark:bg-orange-900/20'
                : 'border-l-4 border-l-transparent';
      const decoration = showRepeatBars ? repeatDecoration(repeatDepth) : null;
      // When a repeat-block line is selected/highlighted, decoration is suppressed.
      // Use the same left padding the decoration would have used so content doesn't
      // shift. Non-repeat lines always get 12px.
      const fallbackPaddingLeft =
        repeatDepth > 0 ? `${repeatBarsWidth(repeatDepth) + 4}px` : '12px';

      return (
        <div
          class={`flex items-start gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer ${sideClass}`}
          style={decoration ?? { paddingLeft: fallbackPaddingLeft }}
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
                class="sounds-container flex flex-wrap gap-x-1 min-h-[3.5rem] pt-3 flex-1"
                style={`row-gap: ${soundsRowGap}px`}
                data-line-id={line.id}
                onpointerdown={lpStart}
                onpointermove={lpMove}
                onpointerup={lpEnd}
                onpointercancel={lpEnd}
                onpointerleave={lpEnd}
              >
                {groupSoundsForDisplay(line.sounds, settings.proportionalWidth, time).map(
                  (item) => {
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
                    return (
                      <SoundTile
                        key={s.id}
                        sound={s}
                        lineId={line.id}
                        startPos={item.startPos}
                        isSelected={selectionIds ? selectionIds.has(s.id) : false}
                      />
                    );
                  }
                )}
                {singleRepeat && (
                  <div
                    class="repeat-counter self-center flex items-center gap-1 ml-4 pointer-events-auto"
                    onpointerdown={(e) => e.stopPropagation()}
                  >
                    <button
                      class="text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30"
                      onclick={(e) => {
                        e.stopPropagation();
                        if (singleRepeat.count <= 2) {
                          piece.removeBlockRepeat(singleRepeat.id);
                        } else {
                          piece.setBlockRepeatCount(singleRepeat.id, singleRepeat.count - 1);
                        }
                      }}
                      title={singleRepeat.count <= 2 ? 'Remove repeat' : 'Decrease repeat count'}
                    >
                      −
                    </button>
                    <span class="text-base font-bold text-orange-600 dark:text-orange-300 select-none">
                      ×{singleRepeat.count}
                    </span>
                    <button
                      class="text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30"
                      onclick={(e) => {
                        e.stopPropagation();
                        piece.setBlockRepeatCount(singleRepeat.id, singleRepeat.count + 1);
                      }}
                      title="Increase repeat count"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
            {(computeLineHash(line) === measuredLineHash ? instructionLayouts : []).map(
              (layout) => (
                <span
                  key={layout.id}
                  class="absolute text-[15px] text-gray-600 dark:text-gray-400 whitespace-nowrap pointer-events-none"
                  style={`left: ${layout.left}px; top: ${layout.top}px`}
                >
                  {layout.text}
                </span>
              )
            )}
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0 pt-1">
            {isJiuchi ? (
              <span class="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 select-none">
                Jiuchi
              </span>
            ) : null}
            <span class="w-8 text-center whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
              {beatLabel}b
            </span>
            {selected ? (
              <button
                class={`w-8 h-8 flex items-center justify-center rounded text-sm leading-none ${player.isScope('line', line.id) ? 'text-green-600 dark:text-green-400' : 'text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`}
                onclick={(e) => {
                  e.stopPropagation();
                  player.toggleScope(piece, [line], { type: 'line', id: line.id });
                }}
                title={player.isScope('line', line.id) ? 'Stop' : 'Play this line'}
              >
                {player.isScope('line', line.id) ? '⏹' : '▶'}
              </button>
            ) : null}
            {/* Extra top margin when the play button is shown keeps Remove well clear
                of Play so a mistap can't delete the line. */}
            <button
              class={`w-8 h-8 flex items-center justify-center rounded text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ${selected ? 'mt-3' : ''}`}
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
