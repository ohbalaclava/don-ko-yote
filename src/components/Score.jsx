import m from 'mithril';
import Sortable from 'sortablejs';
import { piece, markerDepth, lineDepth, singleLineRepeatMap, isSoundLine } from '../data/piece.js';
import { history } from '../data/history.js';
import { player } from '../audio/player.js';
import { voice } from '../audio/engine.js';
import { feedbackClick } from '../audio/feedback.js';
import { patternStore } from '../data/patterns.js';
import { touchDragDelay } from '../drag.js';
import { Line } from './Line.jsx';
import { SectionHeading } from './SectionHeading.jsx';
import { NoteRow } from './NoteRow.jsx';
import { BlockRepeatRow } from './BlockRepeatRow.jsx';
import { DividerRow } from './DividerRow.jsx';
import { JiuchiSectionRow } from './JiuchiSectionRow.jsx';
import { AddRowActions } from './AddRowActions.jsx';

export function Score() {
  let sortable;
  let keydownHandler;
  // FLIP state: pre-reorder top positions keyed by row element. Mithril reuses the
  // same DOM nodes across a keyed reorder, so element identity is a stable key —
  // letting the whole moved jiuchi section (several rows) slide together.
  let flipFirst = null;
  let flipCleanup = null;

  /**
   * Plays the FLIP slide for rows that moved during the last reorder: each row is
   * snapped back to its old position with a transform, then transitioned to its
   * new (natural) position on the next frame.
   * @param {Element} container - The `.lines-container` element.
   */
  function runFlip(container) {
    const first = flipFirst;
    flipFirst = null;
    if (!container) return;
    clearTimeout(flipCleanup);
    const moved = [];
    for (const el of container.children) {
      const top0 = first.get(el);
      if (top0 == null) continue;
      const dy = top0 - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      moved.push(el);
    }
    if (moved.length === 0) return;
    requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = 'transform 150ms ease';
        el.style.transform = '';
      }
    });
    // Strip inline styles once the transition has finished.
    flipCleanup = setTimeout(() => {
      for (const el of moved) {
        el.style.transition = '';
        el.style.transform = '';
      }
    }, 200);
  }

  async function savePattern() {
    const line = piece.lines.find((l) => l.id === piece.selection.lineId);
    if (!line) return;
    const selectedSet = new Set(piece.selection.soundIds);
    const sounds = line.sounds
      .filter((s) => selectedSet.has(s.id))
      .map(({ id: _id, ...rest }) => rest);
    const name = sounds.map((s) => s.name).join(' ');
    await patternStore.save(name, sounds, piece.symbolSet.id);
    piece.clearSelection();
  }

  return {
    oncreate({ dom }) {
      sortable = Sortable.create(dom.querySelector('.lines-container'), {
        handle: '.line-drag-handle',
        filter: '.block-repeat-row',
        animation: 150,
        ghostClass: 'opacity-30',
        ...touchDragDelay,
        onStart: () => feedbackClick('pickup'),
        onEnd(evt) {
          feedbackClick('drop');
          const { item, from, oldIndex, newIndex } = evt;
          // Revert Sortable's DOM mutation so Mithril owns the DOM: the data move
          // below plus redraw repaints the correct order. Without this, a
          // jiuchi-section drag (which moves several rows in the data while
          // Sortable moved only the marker node) leaves the definition/divider
          // behind. Re-inserting before the element now at oldIndex restores the
          // pre-drag order.
          from.removeChild(item);
          from.insertBefore(item, from.children[oldIndex] ?? null);
          if (oldIndex !== newIndex) {
            // Capture pre-move positions (post-revert, so they're the original
            // layout) for the FLIP animation run in onupdate after the redraw.
            flipFirst = new Map();
            for (const el of from.children) flipFirst.set(el, el.getBoundingClientRect().top);
          }
          piece.reorderLine(oldIndex, newIndex);
        },
      });

      keydownHandler = (e) => {
        if (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
          e.preventDefault();
          piece.undo();
        }
      };
      document.addEventListener('keydown', keydownHandler);

      // Decode this taiko's samples now (score open) so the first Play isn't
      // delayed by the fetch + decode. Fire-and-forget: loadSamples is memoised,
      // so play()'s own await resolves instantly once this warms the cache, and
      // decodeAudioData works on the suspended context without a user gesture.
      voice.preload(piece.taiko);
    },
    onupdate({ dom }) {
      // Animate rows to their new positions after a reorder redraw.
      if (flipFirst) runFlip(dom.querySelector('.lines-container'));
    },
    onremove() {
      if (sortable) sortable.destroy();
      if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
      clearTimeout(flipCleanup);
      player.stop(); // stop audio when leaving the score view
    },
    view() {
      const selCount = piece.selection.soundIds.length;
      const hasSelection = piece.selectMode && selCount > 0;
      const lineSelCount = piece.lineSelection.length;
      const hasLineSelection = piece.lineSelectMode && lineSelCount > 0;
      // While a select mode is active the toolbar swaps to a focused action bar
      // (Cancel + count + actions) rather than stacking the idle controls beside
      // the action buttons — keeps the row from overflowing on narrow screens.
      const selecting = piece.selectMode || piece.lineSelectMode;
      // The add-row toolbar normally renders inside the selected line; show a
      // foot-of-score fallback only when no sound line is selected to host it.
      const showFallbackActions =
        !selecting && !piece.lines.some((l) => l.id === piece.selectedLineId && isSoundLine(l));

      return m('div', { class: 'flex-1 overflow-y-auto flex flex-col scroll-pt-10' }, [
        m(
          'div',
          {
            class:
              'sticky top-0 z-10 flex flex-wrap items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shrink-0',
          },
          [
            selecting
              ? m(
                  'button',
                  {
                    class:
                      'text-sm font-semibold rounded px-2 py-1 border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 leading-none',
                    onclick: () =>
                      piece.selectMode ? piece.toggleSelectMode() : piece.toggleLineSelectMode(),
                    title: 'Cancel selection',
                  },
                  '✕'
                )
              : [
                  m(
                    'span',
                    { class: 'text-xs text-gray-400 dark:text-gray-500 select-none' },
                    'Select:'
                  ),
                  m(
                    'button',
                    {
                      class:
                        'text-xs font-semibold rounded px-2 py-1 border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400',
                      onclick: () => piece.toggleSelectMode(),
                    },
                    'Tiles'
                  ),
                  m(
                    'button',
                    {
                      class:
                        'text-xs font-semibold rounded px-2 py-1 border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400',
                      onclick: () => piece.toggleLineSelectMode(),
                    },
                    'Lines'
                  ),
                ],

            piece.selectMode &&
              (hasSelection
                ? [
                    m(
                      'span',
                      { class: 'text-xs text-gray-500 dark:text-gray-400' },
                      `${selCount} selected`
                    ),
                    m(
                      'button',
                      {
                        class:
                          'text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded px-2 py-1',
                        onclick: savePattern,
                      },
                      'Save pattern'
                    ),
                  ]
                : m(
                    'span',
                    { class: 'text-xs text-gray-400 dark:text-gray-500' },
                    'Tap tiles to select'
                  )),

            piece.lineSelectMode &&
              (hasLineSelection
                ? [
                    m(
                      'span',
                      { class: 'text-xs text-gray-500 dark:text-gray-400' },
                      `${lineSelCount} lines`
                    ),
                    m(
                      'button',
                      {
                        class:
                          'text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2 py-1',
                        onclick: () => piece.duplicateSelectedLines(),
                      },
                      'Duplicate'
                    ),
                    m(
                      'button',
                      {
                        class:
                          'text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded px-2 py-1',
                        onclick: () => piece.addBlockRepeat(2),
                      },
                      'Repeat'
                    ),
                    m(
                      'button',
                      {
                        class:
                          'text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded px-2 py-1',
                        onclick: () => piece.deleteSelectedLines(),
                      },
                      'Delete'
                    ),
                  ]
                : m(
                    'span',
                    { class: 'text-xs text-gray-400 dark:text-gray-500' },
                    'Tap lines to select'
                  )),

            selecting
              ? null
              : m('div', { class: 'ml-auto flex items-center gap-1' }, [
                  (() => {
                    // "Playing" visual reflects whole-piece playback only; a scoped
                    // line/section preview leaves this button showing ▶ (Play all).
                    const allActive = player.isScope('all');
                    return m(
                      'button',
                      {
                        class: `text-sm rounded px-2 py-0.5 border ${allActive ? 'bg-green-600 text-white border-green-600' : 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`,
                        onclick: () => player.toggleAll(piece),
                        title: allActive ? 'Stop' : 'Play whole piece',
                      },
                      allActive ? '⏹' : '▶'
                    );
                  })(),
                  m(
                    'button',
                    {
                      class: `text-sm rounded px-2 py-0.5 border ${history.canUndo() ? 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700' : 'border-gray-300 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'}`,
                      onclick: () => piece.undo(),
                      disabled: !history.canUndo(),
                      title: 'Undo (Ctrl+Z)',
                    },
                    '↺'
                  ),
                  m(
                    'button',
                    {
                      class: `text-sm rounded px-2 py-0.5 border ${history.canRedo() ? 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700' : 'border-gray-300 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'}`,
                      onclick: () => piece.redo(),
                      disabled: !history.canRedo(),
                      title: 'Redo (Ctrl+Y)',
                    },
                    '↻'
                  ),
                ]),
          ]
        ),

        m(
          'div',
          { class: 'lines-container' },
          (() => {
            const markers = piece.lines.filter((item) => item.type === 'block-repeat');
            // Single-line repeats render inline on the line, not as a separate row.
            const singleLineMarkerMap = singleLineRepeatMap(piece.lines);
            let lineOrdinal = 0;
            return piece.lines.map((item) => {
              if (item.type === 'block-repeat') {
                if (item.lineIds.length === 1) return m.fragment({ key: item.id });
                return m(BlockRepeatRow, {
                  key: item.id,
                  item,
                  depth: markerDepth(item, markers),
                });
              }
              if (item.type === 'heading') {
                return m(SectionHeading, {
                  key: item.id,
                  heading: item,
                  repeatDepth: lineDepth(item.id, markers),
                });
              }
              if (item.type === 'note') {
                return m(NoteRow, {
                  key: item.id,
                  note: item,
                  repeatDepth: lineDepth(item.id, markers),
                });
              }
              if (item.type === 'divider') {
                return m(DividerRow, {
                  key: item.id,
                  divider: item,
                  repeatDepth: lineDepth(item.id, markers),
                });
              }
              if (item.type === 'jiuchi-section') {
                return m(JiuchiSectionRow, {
                  key: item.id,
                  section: item,
                  repeatDepth: lineDepth(item.id, markers),
                });
              }
              lineOrdinal++;
              const singleRepeat = singleLineMarkerMap.get(item.id) ?? null;
              // Exclude the single-line marker from the bar depth (it's shown inline).
              const repeatDepth = lineDepth(item.id, markers) - (singleRepeat ? 1 : 0);
              return m(Line, {
                key: item.id,
                line: item,
                index: lineOrdinal - 1,
                repeatDepth,
                singleRepeat,
              });
            });
          })()
        ),

        showFallbackActions ? m(AddRowActions) : null,
      ]);
    },
  };
}
