import m from 'mithril';
import Sortable from 'sortablejs';
import { piece, laneDur } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { settings } from '../data/settings.js';
import { SoundTile, SUBDIV_WIDTH_REM } from './SoundTile.jsx';
import { LigatureTile } from './LigatureTile.jsx';
import { packIntoTracks, groupSoundsForDisplay, formatBeats } from '../util.js';
import { feedbackClick } from '../audio/feedback.js';
import { anim } from '../anim.js';
import { touchDragDelay } from '../drag.js';

/**
 * The SortableJS group a lane's sounds belong to. A solo score keeps the single
 * shared `'sounds'` group, so dragging behaves exactly as it did before parts
 * existed. In an ensemble each part gets its own group, which stops a sound being
 * dropped into another part's lane — a different drum with a different symbol set.
 * Jiuchi-definition lanes (part-less) share one group of their own.
 * @param {{ partId: string|null }} lane
 * @returns {string}
 */
export function laneGroupName(lane) {
  if (piece.parts.length <= 1) return 'sounds';
  return 'sounds-' + (lane?.partId ?? 'ji');
}

/** Beat-count label for a lane, e.g. `7-2`. */
export function laneBeatLabel(lane) {
  return formatBeats(laneDur(lane), piece.time);
}

/**
 * Maps a SortableJS DOM drop index to the corresponding data array index,
 * accounting for ligature tiles that each represent multiple sounds.
 * @param {HTMLElement} container
 * @param {number} domIndex - Index of the dropped element among container's children.
 * @returns {number} Equivalent index into the lane's sounds array.
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
 * SortableJS `onAdd` handler for a lane's sounds-container. Only acts on clones
 * dragged from the palette (`evt.pullMode === 'clone'`); in-score cross-lane moves
 * are left to the source lane's `onEnd`. Reads the palette tile's `data-palette-*`
 * attributes to resolve a symbol or pattern, removes the clone SortableJS inserted
 * (so Mithril's vdom stays authoritative), then commits the insertion at the drop
 * index. The commit calls `m.redraw()`, which repaints both the lane and the palette.
 * @param {Sortable.SortableEvent} evt
 */
function handlePaletteDrop(evt) {
  if (evt.pullMode !== 'clone') return;
  const toLineId = evt.to.dataset.lineId;
  const toIndex = domIndexToDataIndex(evt.to, evt.newIndex);
  const ds = evt.item.dataset;
  // Restore the palette's Mithril-owned DOM. With pull:'clone', SortableJS moved the
  // original tile (evt.item, which Mithril still tracks) into this lane and left a
  // non-Mithril clone (evt.clone) in the palette. Put the original back in the
  // palette where the clone sits and drop the clone, so Mithril's vdom stays
  // authoritative and the lane loses the stray node. (Falls back to a plain remove
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
    // The dropped-on lane's part decides the symbol set, not the score's primary one.
    const sym = piece.symbolSetForLane(toLineId).symbols.find((s) => s.name === ds.paletteSound);
    if (sym) piece.addSound(toLineId, sym, toIndex);
  }
  feedbackClick('drop'); // higher click on a successful landing in a lane
}

const INSTR_LINE_HEIGHT = 18;

const DEFAULT_ROW_GAP = 16; // matches former gap-y-4 (1rem)

/**
 * Computes a stable string representing the identity and instruction state of all
 * sounds in a lane. Used to detect stale instruction positions: when the view
 * renders with a lane whose hash differs from the last measured hash, stale
 * layouts are suppressed rather than shown at incorrect positions.
 * @param {{ sounds: Array }} lane
 * @returns {string}
 */
function computeLaneHash(lane) {
  return lane.sounds
    .map((s) => `${s.id}:${s.gap ?? 0}:${s.duration}:${s.type ?? ''}:${s.instruction ?? ''}`)
    .join('|');
}

/**
 * Measures instruction label positions for all sounds in a lane, laying them out
 * in non-overlapping horizontal tracks below their tiles using a canvas for text
 * measurement. Groups tiles by visual row (snapped to a 5px grid to tolerate
 * subpixel differences). Also computes the row-gap needed so that instruction
 * labels on each visual row do not overlap the tile row below it, using the
 * maximum track count across all non-last rows (the gap applies uniformly).
 *
 * Everything is measured relative to the wrapper, so an ensemble lane inside a
 * horizontal scroller needs no rebasing — both rects shift with `scrollLeft`.
 * @param {HTMLElement} wrapper - The Lane component's root DOM node.
 * @param {{ sounds: Array }} lane
 * @returns {{ layouts: Array<{ id: string, left: number, top: number, text: string }>, paddingBottom: number, rowGap: number } | null}
 */
function measureInstructions(wrapper, lane) {
  if (!wrapper) return null;

  const wrapperRect = wrapper.getBoundingClientRect();
  const tiles = Array.from(wrapper.querySelectorAll('.sound-tile[data-sound-id]'));

  const items = [];
  for (const tile of tiles) {
    const sound = lane.sounds.find((s) => s.id === tile.dataset.soundId);
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
  //   - Instructions: start 2px below the tile bottom, each track is INSTR_LINE_HEIGHT tall.
  //   - Beat dots: the next row's tiles have beat dots positioned at -top-3 (-12px),
  //     so the dot's top edge sits 12px above the next row's tile top edge.
  // The dot must clear the instruction bottom, so:
  //   rowGap >= (2 + numTracks * INSTR_LINE_HEIGHT) + 12 = 14 + numTracks * INSTR_LINE_HEIGHT
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

/**
 * One part's sounds within one system — what a sound line was before parts
 * existed. Each lane owns its own SortableJS instance, long-press select-mode
 * detection and instruction layout, so the stacked lanes of an ensemble system
 * behave independently.
 *
 * Attrs: `{ lane, singleRepeat, aligned }`. `aligned` lays tiles out at a fixed
 * width per division with no wrapping and no gaps, which is what puts beat N of
 * every part in the same column; a solo score leaves it off and keeps the
 * wrapping flex layout (and `settings.proportionalWidth`) exactly as before.
 */
export function Lane() {
  let sortable;
  let container;
  let instructionLayouts = [];
  let wrapperPaddingBottom = 0;
  let soundsRowGap = DEFAULT_ROW_GAP;
  let sortableGroup = null;
  // Stale-detection: layouts are only shown when the lane data matches what was measured.
  let measuredLaneHash = '';
  // ResizeObserver fires when the container width changes (e.g. viewport resize), so
  // instruction positions are recomputed even when Mithril doesn't redraw.
  let resizeObserver = null;
  let lastDom = null;
  let lastLane = null;
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
  function ensureSortable(lane) {
    if (piece.selectMode) {
      if (sortable) {
        sortable.destroy();
        sortable = null;
      }
      return;
    }
    const group = laneGroupName(lane);
    if (sortable) {
      // Adding or removing a part moves this lane between drop groups.
      if (group !== sortableGroup) {
        sortable.option('group', group);
        sortableGroup = group;
      }
      return;
    }
    sortableGroup = group;
    sortable = Sortable.create(container, {
      group,
      filter: '.beat-marker-divider, .repeat-counter, .lane-gap',
      animation: 150,
      ghostClass: 'opacity-30',
      ...touchDragDelay,
      // Once a drag is genuinely underway, the held tile must not also trigger
      // long-press selection.
      onStart(evt) {
        lpEnd(evt);
        feedbackClick('pickup');
      },
      onAdd: handlePaletteDrop,
      onEnd(evt) {
        feedbackClick('drop'); // in-score moves; palette clones click via onAdd
        const ligatureIds = evt.item.dataset.ligatureIds;
        const fromLineId = evt.from.dataset.lineId;
        const toLineId = evt.to.dataset.lineId;
        const toDataIndex = domIndexToDataIndex(evt.to, evt.newIndex);
        // Undo SortableJS's physical DOM mutation before touching the data model.
        // SortableJS moves the dragged node directly in the DOM (across containers
        // for cross-lane drags), which desyncs Mithril's virtual DOM and corrupts
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
  function applyLayouts(dom, lane) {
    const result = measureInstructions(dom, lane);
    if (!result) return;
    const { layouts, paddingBottom, rowGap } = result;
    const newHash = computeLaneHash(lane);
    const changed =
      paddingBottom !== wrapperPaddingBottom ||
      rowGap !== soundsRowGap ||
      newHash !== measuredLaneHash ||
      JSON.stringify(layouts) !== JSON.stringify(instructionLayouts);
    if (changed) {
      instructionLayouts = layouts;
      wrapperPaddingBottom = paddingBottom;
      soundsRowGap = rowGap;
      measuredLaneHash = newHash;
      m.redraw();
    }
  }

  return {
    oncreate({ dom, attrs: { lane } }) {
      container = dom.querySelector('.sounds-container');
      lastDom = dom;
      lastLane = lane;
      ensureSortable(lane);
      applyLayouts(dom, lane);
      // A lane appears on its own only when a part is added to an existing score;
      // a whole new system animates as a row (see System.jsx).
      if (anim.consumeAdded(lane.id)) anim.flashIn(dom);
      // Recompute instruction positions whenever the container is resized (e.g. on
      // viewport resize). Mithril's onupdate only fires on state changes, so without
      // this observer a resize can leave instructions at pre-resize coordinates.
      resizeObserver = new ResizeObserver(() => {
        if (lastDom && lastLane) applyLayouts(lastDom, lastLane);
      });
      resizeObserver.observe(container);
    },
    onupdate({ dom, attrs: { lane } }) {
      lastDom = dom;
      lastLane = lane;
      ensureSortable(lane);
      applyLayouts(dom, lane);
    },
    onbeforeremove({ dom, attrs: { lane } }) {
      if (anim.consumeRemoved(lane.id)) return anim.flashOut(dom);
    },
    onremove() {
      if (sortable) sortable.destroy();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    },
    view({ attrs: { lane, singleRepeat = null, aligned = false } }) {
      const time = piece.time;
      // An aligned lane is always fixed-width-per-division: that is what makes the
      // beat columns line up across parts, so it overrides the app preference.
      const proportional = aligned || settings.proportionalWidth;
      const selectionIds =
        piece.selectMode && piece.selection.lineId === lane.id
          ? new Set(piece.selection.soundIds)
          : null;

      return m(
        'div',
        {
          class: `sounds-and-instructions relative ${aligned ? 'min-w-max' : 'flex-1 min-w-0'}`,
          style: wrapperPaddingBottom ? `padding-bottom: ${wrapperPaddingBottom}px` : '',
        },
        [
          m('div', { class: 'flex items-start gap-1' }, [
            m(
              'div',
              {
                class: `sounds-container flex min-h-[3.5rem] pt-3 ${aligned ? 'min-w-max' : 'flex-wrap gap-x-1 flex-1'}`,
                style: aligned ? '' : `row-gap: ${soundsRowGap}px`,
                'data-line-id': lane.id,
                onpointerdown: lpStart,
                onpointermove: lpMove,
                onpointerup: lpEnd,
                onpointercancel: lpEnd,
                onpointerleave: lpEnd,
              },
              [
                groupSoundsForDisplay(lane.sounds, proportional, time).map((item) => {
                  if (item.type === 'beat-marker') {
                    return m(
                      'span',
                      {
                        key: 'bm-' + item.beat,
                        class:
                          'beat-marker-divider self-stretch relative flex flex-col items-center pointer-events-none select-none',
                        style: 'width:2px',
                      },
                      [
                        m('span', {
                          class:
                            'beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100',
                        }),
                        m('span', { class: 'w-px h-full bg-gray-300 dark:bg-gray-600' }),
                      ]
                    );
                  }
                  if (item.type === 'gap') {
                    // Blank space in a taiko set's lane: this drum is silent while
                    // the player works on another of their drums. Not a sound, so it
                    // carries no data-sound-id and `domIndexToDataIndex` skips it.
                    return m(
                      'span',
                      {
                        key: 'gap-' + item.startPos,
                        class:
                          'lane-gap self-stretch flex items-center pointer-events-none select-none',
                        style: `width:${item.divs * SUBDIV_WIDTH_REM}rem`,
                      },
                      m('span', {
                        class: 'w-full border-t border-dotted border-gray-300 dark:border-gray-600',
                      })
                    );
                  }
                  if (item.sounds) {
                    return m(LigatureTile, {
                      key: item.sounds[0].id,
                      sounds: item.sounds,
                      lineId: lane.id,
                      startPos: item.startPos,
                      selectionIds,
                    });
                  }
                  const s = item.sound;
                  return m(SoundTile, {
                    key: s.id,
                    sound: s,
                    lineId: lane.id,
                    startPos: item.startPos,
                    proportional,
                    isSelected: selectionIds ? selectionIds.has(s.id) : false,
                  });
                }),
                singleRepeat &&
                  m(
                    'div',
                    {
                      class:
                        'repeat-counter self-center flex items-center gap-1 ml-4 pointer-events-auto',
                      onpointerdown: (e) => e.stopPropagation(),
                    },
                    [
                      m(
                        'button',
                        {
                          class:
                            'text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30',
                          onclick: (e) => {
                            e.stopPropagation();
                            if (singleRepeat.count <= 2) {
                              piece.removeBlockRepeat(singleRepeat.id);
                            } else {
                              piece.setBlockRepeatCount(singleRepeat.id, singleRepeat.count - 1);
                            }
                          },
                          title:
                            singleRepeat.count <= 2 ? 'Remove repeat' : 'Decrease repeat count',
                        },
                        '−'
                      ),
                      m(
                        'span',
                        {
                          class:
                            'text-base font-bold text-orange-600 dark:text-orange-300 select-none',
                        },
                        `×${singleRepeat.count}`
                      ),
                      m(
                        'button',
                        {
                          class:
                            'text-sm font-bold w-6 h-6 flex items-center justify-center text-orange-600 dark:text-orange-300 border border-orange-400 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30',
                          onclick: (e) => {
                            e.stopPropagation();
                            piece.setBlockRepeatCount(singleRepeat.id, singleRepeat.count + 1);
                          },
                          title: 'Increase repeat count',
                        },
                        '+'
                      ),
                    ]
                  ),
              ]
            ),
          ]),
          (computeLaneHash(lane) === measuredLaneHash ? instructionLayouts : []).map((layout) =>
            m(
              'span',
              {
                key: layout.id,
                class:
                  'absolute text-[15px] text-gray-600 dark:text-gray-400 whitespace-nowrap pointer-events-none',
                style: `left: ${layout.left}px; top: ${layout.top}px`,
              },
              layout.text
            )
          ),
        ]
      );
    },
  };
}
