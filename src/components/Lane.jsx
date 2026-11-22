import m from 'mithril';
import Sortable from 'sortablejs';
import { piece, laneDur, findLane } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { settings } from '../data/settings.js';
import { SoundTile, SUBDIV_WIDTH_REM, NONPROP_TILE_WIDTH_REM } from './SoundTile.jsx';
import { LigatureTile } from './LigatureTile.jsx';
import { packIntoTracks, groupSoundsForDisplay, formatBeats } from '../util.js';
import { feedbackClick } from '../audio/feedback.js';
import { anim } from '../anim.js';
import { touchDragDelay } from '../drag.js';
import { showToast } from './Toast.jsx';

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

/** The SortableJS group every palette clone source drags from. */
export const PALETTE_GROUP = 'palette';

/**
 * A lane's SortableJS group config: its own name, so an in-score sound still only
 * moves between lanes of the same part, plus a `put` predicate that also accepts
 * the palette — a palette tile may be dropped on **any** lane, whatever part is
 * selected, and `handlePaletteDrop` translates the symbol into the lane's own
 * vocabulary.
 * @param {{ partId: string|null }} lane
 * @returns {object} Sortable group option.
 */
function laneGroup(lane) {
  const name = laneGroupName(lane);
  return {
    name,
    put: (to, from) => {
      const g = from.options.group?.name;
      return g === PALETTE_GROUP || g === name;
    },
  };
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
 * Start and end division of each of a lane's sounds, keyed by sound id. Gap-aware
 * like every reader, so these are absolute positions within the system.
 * @param {{ sounds: Array }} lane
 * @returns {Map<string, { start: number, end: number }>}
 */
function soundSpans(lane) {
  const spans = new Map();
  let pos = 0;
  for (const s of lane.sounds) {
    const start = pos + (s.gap ?? 0);
    spans.set(s.id, { start, end: start + s.duration });
    pos = start + s.duration;
  }
  return spans;
}

/**
 * The span of a lane child that occupies time — a tile, a ligature, a blank cell —
 * in divisions from the start of the system, or null for one that occupies none
 * (a beat marker, the repeat counter).
 * @param {HTMLElement} el
 * @param {Map<string, { start: number, end: number }>} spans - From `soundSpans`.
 * @returns {{ start: number, end: number }|null}
 */
function childSpan(el, spans) {
  const ds = el.dataset;
  if (ds.soundId) return spans.get(ds.soundId) ?? null;
  if (ds.ligatureIds) {
    const ids = ds.ligatureIds.split(',');
    const a = spans.get(ids[0]);
    const b = spans.get(ids[ids.length - 1]);
    return a && b ? { start: a.start, end: b.end } : null;
  }
  if (ds.startPos != null) return { start: +ds.startPos, end: +ds.startPos + +ds.divs };
  return null;
}

/**
 * The division a drop lands on, read off the **drop indicator**: the translucent
 * tile SortableJS parks among the lane's children as the drag moves over it. A set
 * lane is mostly blank, so a drop index alone cannot say *when* the sound should
 * play — this is the division `piece.addSoundAtDiv` and friends take.
 *
 * It is the start of the first timed sibling *after* the indicator — where the
 * indicator was shown, in the lane's own divisions — and the end of the music when
 * the indicator is parked at the lane's end. The indicator is the one landing place
 * the author can see, so taking the division from anywhere else is what made it look
 * like it was lying: the pointer sits up to a tile's width from the slot on show,
 * and the indicator's own rect is no better, since the tiles it has pushed aside are
 * not where the data says they are.
 *
 * Siblings are read in **data** divisions rather than from geometry, which is why
 * this holds in both layouts and for a move within one lane: the sound is taken out
 * before the insert and a set lane absorbs that span (`removeFromLane`), so the
 * sounds after it keep the positions the indicator was shown between.
 *
 * Call it **before** the drop handler reverts SortableJS's DOM change, while the
 * indicator is still parked in the lane.
 * @param {{ sounds: Array }} lane - The target lane.
 * @param {HTMLElement} item - SortableJS's `evt.item`, the parked indicator.
 * @returns {number} Divisions from the start of the system.
 */
function indicatorDiv(lane, item) {
  const spans = soundSpans(lane);
  for (let el = item.nextElementSibling; el; el = el.nextElementSibling) {
    const span = childSpan(el, spans);
    if (span) return span.start;
  }
  // Nothing timed after it: the indicator is at the end of the lane, so the drop
  // appends to whatever is last — the music, or the trailing blank's last cell.
  for (let el = item.previousElementSibling; el; el = el.previousElementSibling) {
    const span = childSpan(el, spans);
    if (span) return span.end;
  }
  return 0;
}

/**
 * SortableJS `onAdd` handler for a lane's sounds-container. Only acts on clones
 * dragged from the palette (`evt.pullMode === 'clone'`); in-score cross-lane moves
 * are left to the source lane's `onEnd`. Reads the palette tile's `data-palette-*`
 * attributes to resolve a symbol or pattern, removes the clone SortableJS inserted
 * (so Mithril's vdom stays authoritative), then commits the insertion — at the drop
 * index on an ordinary lane, at the indicator's division on a set lane
 * (`indicatorDiv`, which must be read before the clone is put back).
 * The lane may belong to any part, so the symbol is resolved in **its** vocabulary
 * and a drum that has no such symbol is reported rather than silently refused.
 * The commit calls `m.redraw()`, which repaints both the lane and the palette.
 * @param {Sortable.SortableEvent} evt
 */
function handlePaletteDrop(evt) {
  if (evt.pullMode !== 'clone') return;
  const toLineId = evt.to.dataset.lineId;
  const toIndex = domIndexToDataIndex(evt.to, evt.newIndex);
  const ds = evt.item.dataset;
  const toLane = findLane(piece.lines, toLineId)?.lane;
  // Read while the indicator is still parked in the lane; the swap below removes it.
  const div =
    toLane && piece.setIdForLane(toLineId) != null ? indicatorDiv(toLane, evt.item) : null;
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
  if (!toLane) return;
  // A set lane is placed in time rather than in order: its blank space is where
  // most drops land, and the division is the only thing that says when the strike
  // sounds. An ordinary lane is contiguous, so its drop index is enough.
  const addAt = (sym) =>
    div == null ? piece.addSound(toLineId, sym, toIndex) : piece.addSoundAtDiv(toLineId, sym, div);

  if (ds.palettePattern != null) {
    const pattern = patternStore.items.find((p) => p.id === ds.palettePattern);
    if (!pattern) return;
    if (div == null) piece.addGroup(toLineId, pattern, toIndex);
    else piece.addGroupAtDiv(toLineId, pattern, div);
  } else if (ds.paletteImplicit != null) {
    addAt({ name: '—', duration: piece.time, implicit: true });
  } else if (ds.paletteSilent != null) {
    addAt({ name: '', duration: piece.time, silent: true });
  } else if (ds.paletteSound != null) {
    // The dropped-on lane's part decides the symbol set, not the score's primary
    // one — and a tile may be dropped on any lane, so the drum under the pointer
    // need not have the symbol the author picked up. Say so: the palette is still
    // showing the selected lane's vocabulary, so a silent no-op reads as a bug.
    const sym = piece.symbolSetForLane(toLineId).symbols.find((s) => s.name === ds.paletteSound);
    if (!sym) {
      showToast(`${piece.taikoForLane(toLineId)} has no ${ds.paletteSound}`);
      return;
    }
    addAt(sym);
  }
  feedbackClick('drop'); // higher click on a successful landing in a lane
}

const INSTR_LINE_HEIGHT = 18;

const DEFAULT_ROW_GAP = 16; // matches former gap-y-4 (1rem)

const MIN_GAP_WIDTH_REM = 0.5; // a sub-beat blank still has to be visible

const MIN_GAP_CELL_REM = 0.5; // narrower than this and a blank cell cannot be aimed at

/**
 * On-screen width of a lane's blank space, in rem.
 *
 * A proportional lane — and so every ensemble lane — is fixed-width-per-division,
 * which makes silence measurable in the tiles' own currency. A non-proportional
 * lane is not: its tiles are token-width (a `min-w-[3rem]` floor plus whatever the
 * label needs) however long the sound, so a beat of four ligated 16ths takes about
 * one tile slot and a proportional gap beside it reads several times longer than
 * the notes it replaces. Measure it in tile slots instead — one per beat.
 * @param {number} divs - Divisions of silence.
 * @param {boolean} proportional
 * @param {number} time - Divisions per beat.
 * @returns {number} Width in rem.
 */
function gapWidthRem(divs, proportional, time) {
  if (proportional) return divs * SUBDIV_WIDTH_REM;
  return Math.max(MIN_GAP_WIDTH_REM, (divs / time) * NONPROP_TILE_WIDTH_REM);
}

/**
 * Blank space in a taiko set's lane: this drum is silent while the player works on
 * another of their drums. Not a sound, so a cell carries no `data-sound-id` and
 * `domIndexToDataIndex` skips it — but it does carry its position, which is what
 * lets a drop land inside it. The total width is in whichever
 * currency the lane's tiles use (see `gapWidthRem`).
 *
 * The blank is drawn as **several cells** — one per division wherever the layout is
 * wide enough to aim at one — rather than as a single span, and the cells take
 * pointer events. Both are for the drop indicator: SortableJS parks it between two
 * children of the lane, so a blank that is one inert child cannot hold it, and the
 * indicator used to sit at a stale slot for as long as the drag was over blank
 * space. Cells give it somewhere to land every division or so, which is also the
 * resolution of the committed drop, since `indicatorDiv` reads the division off the
 * indicator's own slot.
 * @param {string|null} key - Mithril key prefix, for the blanks that sit among the
 *   keyed tiles. Null for the trailing blank, which is a sibling of the **unkeyed**
 *   children (the tiles are one nested fragment of their own, the repeat counter
 *   is unkeyed) — a fragment may not mix keyed and unkeyed vnodes.
 * @param {number} startPos - Division the blank starts at.
 * @param {number} divs - Divisions of silence.
 * @param {boolean} proportional
 * @param {number} time - Divisions per beat.
 * @returns {Array} One vnode per cell; splice them into the lane's children with
 *   `flatMap`, never nest them, so each keyed cell stays a sibling of the tiles.
 */
function gapCells(key, startPos, divs, proportional, time) {
  const totalRem = gapWidthRem(divs, proportional, time);
  // A non-proportional lane measures a blank in tile slots, so one division there
  // can be a few px wide: widen the cell until it can be hit.
  const step = Math.max(1, Math.ceil((MIN_GAP_CELL_REM * divs) / totalRem));
  const cells = [];
  for (let d = 0; d < divs; d += step) {
    const n = Math.min(step, divs - d);
    const attrs = {
      class: 'lane-gap self-stretch flex items-center select-none',
      style: `width:${(totalRem * n) / divs}rem`,
      'data-start-pos': startPos + d,
      'data-divs': n,
    };
    if (key != null) attrs.key = `${key}-${d}`;
    cells.push(
      m(
        'span',
        attrs,
        m('span', { class: 'w-full border-t border-dotted border-gray-300 dark:border-gray-600' })
      )
    );
  }
  return cells;
}

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
    const group = laneGroup(lane);
    if (sortable) {
      // Adding or removing a part moves this lane between drop groups.
      if (group.name !== sortableGroup) {
        sortable.option('group', group);
        sortableGroup = group.name;
      }
      return;
    }
    sortableGroup = group.name;
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
        const toLane = findLane(piece.lines, toLineId)?.lane;
        // Read while the indicator is still parked; the revert below removes it.
        const div =
          toLane && !ligatureIds && piece.setIdForLane(toLineId) != null
            ? indicatorDiv(toLane, evt.item)
            : null;
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
        } else if (div != null) {
          // On a set lane the drop's division is the edit — see `indicatorDiv`.
          piece.moveSoundToDiv(fromLineId, evt.item.dataset.soundId, toLineId, div);
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
                groupSoundsForDisplay(lane.sounds, proportional, time).flatMap((item) => {
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
                    return gapCells(
                      'gap-' + item.startPos,
                      item.startPos,
                      item.divs,
                      proportional,
                      time
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
                // Trailing silence has no `gap` to render it (the set's cursor is
                // its last note), so the lane asks `piece` for what is left of its
                // system: without it a sparse lane simply stops, and there is
                // nowhere to drop a strike under the drums the player is busy with.
                (() => {
                  const tail = piece.blankTailFor(lane.id);
                  return tail > 0 && gapCells(null, laneDur(lane), tail, proportional, time);
                })(),
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
