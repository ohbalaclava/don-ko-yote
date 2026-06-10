import m from 'mithril';
import Sortable from 'sortablejs';
import { piece, markerDepth, lineDepth, singleLineRepeatMap } from '../data/piece.js';
import { history } from '../data/history.js';
import { player } from '../audio/player.js';
import { voice } from '../audio/engine.js';
import { patternStore } from '../data/patterns.js';
import { scrollToScoreBottom } from '../scroll.js';
import { touchDragDelay } from '../drag.js';
import { Line } from './Line.jsx';
import { SectionHeading } from './SectionHeading.jsx';
import { NoteRow } from './NoteRow.jsx';
import { BlockRepeatRow } from './BlockRepeatRow.jsx';
import { DividerRow } from './DividerRow.jsx';

export function Score() {
  let sortable;
  let keydownHandler;
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
        onEnd(evt) {
          piece.reorderLine(evt.oldIndex, evt.newIndex);
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
    onremove() {
      if (sortable) sortable.destroy();
      if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
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

      return (
        <div class="flex-1 overflow-y-auto flex flex-col scroll-pt-10">
          <div class="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 shrink-0">
            {selecting ? (
              <button
                class="text-sm font-semibold rounded px-2 py-1 border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 leading-none"
                onclick={() =>
                  piece.selectMode ? piece.toggleSelectMode() : piece.toggleLineSelectMode()
                }
                title="Cancel selection"
              >
                ✕
              </button>
            ) : (
              [
                <span class="text-xs text-gray-400 dark:text-gray-500 select-none">Select:</span>,
                <button
                  class="text-xs font-semibold rounded px-2 py-1 border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400"
                  onclick={() => piece.toggleSelectMode()}
                >
                  Tiles
                </button>,
                <button
                  class="text-xs font-semibold rounded px-2 py-1 border border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400"
                  onclick={() => piece.toggleLineSelectMode()}
                >
                  Lines
                </button>,
              ]
            )}

            {piece.selectMode &&
              (hasSelection ? (
                [
                  <span class="text-xs text-gray-500 dark:text-gray-400">{selCount} selected</span>,
                  <button
                    class="text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded px-2 py-1"
                    onclick={savePattern}
                  >
                    Save pattern
                  </button>,
                ]
              ) : (
                <span class="text-xs text-gray-400 dark:text-gray-500">Tap tiles to select</span>
              ))}

            {piece.lineSelectMode &&
              (hasLineSelection ? (
                [
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {lineSelCount} lines
                  </span>,
                  <button
                    class="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2 py-1"
                    onclick={() => piece.duplicateSelectedLines()}
                  >
                    Duplicate
                  </button>,
                  <button
                    class="text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white rounded px-2 py-1"
                    onclick={() => piece.addBlockRepeat(2)}
                  >
                    Repeat
                  </button>,
                  <button
                    class="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded px-2 py-1"
                    onclick={() => piece.deleteSelectedLines()}
                  >
                    Delete
                  </button>,
                ]
              ) : (
                <span class="text-xs text-gray-400 dark:text-gray-500">Tap lines to select</span>
              ))}

            {selecting ? null : (
              <div class="ml-auto flex items-center gap-1">
                {(() => {
                  // "Playing" visual reflects whole-piece playback only; a scoped
                  // line/section preview leaves this button showing ▶ (Play all).
                  const allActive = player.isScope('all');
                  return (
                    <button
                      class={`text-sm rounded px-2 py-0.5 border ${allActive ? 'bg-green-600 text-white border-green-600' : 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                      onclick={() => player.toggleAll(piece)}
                      title={allActive ? 'Stop' : 'Play whole piece'}
                    >
                      {allActive ? '⏹' : '▶'}
                    </button>
                  );
                })()}
                <button
                  class={`text-sm rounded px-2 py-0.5 border ${history.canUndo() ? 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700' : 'border-gray-300 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'}`}
                  onclick={() => piece.undo()}
                  disabled={!history.canUndo()}
                  title="Undo (Ctrl+Z)"
                >
                  ↺
                </button>
                <button
                  class={`text-sm rounded px-2 py-0.5 border ${history.canRedo() ? 'border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700' : 'border-gray-300 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'}`}
                  onclick={() => piece.redo()}
                  disabled={!history.canRedo()}
                  title="Redo (Ctrl+Y)"
                >
                  ↻
                </button>
              </div>
            )}
          </div>

          <div class="lines-container">
            {(() => {
              const markers = piece.lines.filter((item) => item.type === 'block-repeat');
              // Single-line repeats render inline on the line, not as a separate row.
              const singleLineMarkerMap = singleLineRepeatMap(piece.lines);
              let lineOrdinal = 0;
              return piece.lines.map((item) => {
                if (item.type === 'block-repeat') {
                  if (item.lineIds.length === 1) return m.fragment({ key: item.id });
                  return (
                    <BlockRepeatRow key={item.id} item={item} depth={markerDepth(item, markers)} />
                  );
                }
                if (item.type === 'heading') {
                  return (
                    <SectionHeading
                      key={item.id}
                      heading={item}
                      repeatDepth={lineDepth(item.id, markers)}
                    />
                  );
                }
                if (item.type === 'note') {
                  return (
                    <NoteRow key={item.id} note={item} repeatDepth={lineDepth(item.id, markers)} />
                  );
                }
                if (item.type === 'divider') {
                  return (
                    <DividerRow
                      key={item.id}
                      divider={item}
                      repeatDepth={lineDepth(item.id, markers)}
                    />
                  );
                }
                lineOrdinal++;
                const singleRepeat = singleLineMarkerMap.get(item.id) ?? null;
                // Exclude the single-line marker from the bar depth (it's shown inline).
                const repeatDepth = lineDepth(item.id, markers) - (singleRepeat ? 1 : 0);
                return (
                  <Line
                    key={item.id}
                    line={item}
                    index={lineOrdinal - 1}
                    repeatDepth={repeatDepth}
                    singleRepeat={singleRepeat}
                  />
                );
              });
            })()}
          </div>

          <div class="score-actions px-3 py-2 flex items-center gap-3">
            <button
              class={`text-sm font-semibold ${piece.selectMode || piece.lineSelectMode ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'}`}
              disabled={piece.selectMode || piece.lineSelectMode}
              onclick={() => {
                piece.addLine();
                scrollToScoreBottom();
              }}
            >
              + Add line
            </button>
            <button
              class={`text-sm font-semibold ${piece.selectMode || piece.lineSelectMode ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              disabled={piece.selectMode || piece.lineSelectMode}
              onclick={() => {
                piece.addHeading();
                scrollToScoreBottom();
              }}
            >
              + Add heading
            </button>
            <button
              class={`text-sm font-semibold ${piece.selectMode || piece.lineSelectMode ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              disabled={piece.selectMode || piece.lineSelectMode}
              onclick={() => {
                piece.addNote();
                scrollToScoreBottom();
              }}
            >
              + Add note
            </button>
            <button
              class={`text-sm font-semibold ${piece.selectMode || piece.lineSelectMode ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              disabled={piece.selectMode || piece.lineSelectMode}
              onclick={() => {
                piece.addDivider();
                scrollToScoreBottom();
              }}
            >
              + Add divider
            </button>
          </div>
        </div>
      );
    },
  };
}
