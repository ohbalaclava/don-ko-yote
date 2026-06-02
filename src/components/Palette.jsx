import m from 'mithril';
import Sortable from 'sortablejs';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { settings } from '../data/settings.js';

const SUBDIV_WIDTH_REM = 1.2; // one division = 1.2rem in the palette

/**
 * Turns a palette tile container into a SortableJS clone source in the shared
 * 'sounds' group. Dragging a `[data-palette-tile]` child clones it into a line's
 * sounds-container, which fires that line's `onAdd` (see Line.jsx) to commit the
 * insertion. Routing through SortableJS gives the same gap-opening animation and
 * any-row drop targeting as in-score reordering. `put: false` / `sort: false`
 * keep the palette itself from receiving or reordering tiles.
 * @param {HTMLElement} dom
 * @param {object} [extra] - extra Sortable options (e.g. `filter`)
 * @returns {Sortable}
 */
function makeCloneSource(dom, extra = {}) {
  return Sortable.create(dom, {
    group: { name: 'sounds', pull: 'clone', put: false },
    sort: false,
    draggable: '[data-palette-tile]',
    ...extra,
  });
}

export function Palette() {
  let soundSortable;
  let patternSortable;
  return {
    onremove() {
      soundSortable?.destroy();
      patternSortable?.destroy();
    },
    view({ attrs: { onOpenJiuchiPatterns } }) {
      return (
        <aside class="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-2">
          <div>
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">
                Sounds — tap to add · drag to any line
              </p>
              {(() => {
                const selectedLine = piece.lines.find((l) => l.id === piece.selectedLineId);
                const lastSound = selectedLine?.sounds.at(-1);
                return (
                  <button
                    class={`text-sm px-1 ${lastSound ? 'text-red-400 hover:text-red-600' : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'}`}
                    onclick={() =>
                      lastSound && piece.removeSound(piece.selectedLineId, lastSound.id)
                    }
                    disabled={!lastSound}
                    title="Delete last sound"
                  >
                    ⌫
                  </button>
                );
              })()}
            </div>
            <div
              class="flex flex-wrap gap-1"
              oncreate={({ dom }) => {
                soundSortable = makeCloneSource(dom);
              }}
              onremove={() => {
                soundSortable?.destroy();
                soundSortable = null;
              }}
            >
              {piece.symbolSet.symbols.map((sym) => (
                <SoundPaletteTile key={sym.name} sym={sym} />
              ))}
              <ImplicitPaletteTile />
            </div>
          </div>

          <div class="flex gap-2">
            {(() => {
              const visiblePatterns = patternStore.items.filter(
                (p) => !p.symbolSetId || p.symbolSetId === piece.symbolSet.id
              );
              return visiblePatterns.length > 0 ? (
                <div class="flex-1">
                  <div
                    class="flex flex-wrap gap-1"
                    oncreate={({ dom }) => {
                      patternSortable = makeCloneSource(dom, { filter: '.pattern-delete' });
                    }}
                    onremove={() => {
                      patternSortable?.destroy();
                      patternSortable = null;
                    }}
                  >
                    {visiblePatterns.map((p) => (
                      <PatternPaletteTile key={p.id} pattern={p} />
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            {piece.symbolSet.patterns?.length ? (
              <button
                class="self-end bg-indigo-600 hover:bg-indigo-500 text-white rounded px-3 py-1 text-sm font-semibold"
                onclick={onOpenJiuchiPatterns}
                title="Jiuchi patterns"
              >
                Patterns
              </button>
            ) : null}
          </div>
        </aside>
      );
    },
  };
}

/** Returns the hand to display on a palette tile (top-level or first alternative). */
function paletteHand(sym) {
  if (sym.hand) return sym.hand;
  if (sym.alternatives && sym.alternatives.length > 0) return sym.alternatives[0].hand ?? '';
  return '';
}

/** True when a tap on a palette tile should add to the selected line. */
function canTapAdd() {
  return !piece.selectMode && !piece.lineSelectMode && piece.selectedLineId;
}

function SoundPaletteTile() {
  return {
    view({ attrs: { sym } }) {
      const hand = paletteHand(sym);
      const dur = sym.duration ?? sym.alternatives?.[0]?.duration ?? 1;
      return (
        <div
          data-palette-tile
          data-palette-sound={sym.name}
          class="flex flex-col items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded shadow-sm px-1 py-1 select-none min-w-[1.75rem] cursor-grab active:border-indigo-400"
          style={`width:${dur * SUBDIV_WIDTH_REM}rem`}
          onclick={() => canTapAdd() && piece.addSound(piece.selectedLineId, sym)}
        >
          <span class={`font-bold text-base leading-tight font-${settings.font}`}>{sym.name}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{hand}</span>
        </div>
      );
    },
  };
}

/** Builds an implicit-tile symbol whose duration matches the current time signature. */
function implicitSym() {
  return { name: '—', duration: piece.time, implicit: true };
}

function ImplicitPaletteTile() {
  return {
    view() {
      return (
        <div
          data-palette-tile
          data-palette-implicit="1"
          class="flex flex-col items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded shadow-sm px-1 py-1 select-none min-w-[1.75rem] cursor-grab active:border-indigo-400"
          style={`width:${piece.time * SUBDIV_WIDTH_REM}rem`}
          onclick={() => canTapAdd() && piece.addSound(piece.selectedLineId, implicitSym())}
        >
          <span class={`font-bold text-base leading-tight font-${settings.font}`}>—</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">1–8</span>
        </div>
      );
    },
  };
}

function PatternPaletteTile() {
  return {
    view({ attrs: { pattern } }) {
      const beats = +(pattern.sounds.reduce((s, x) => s + x.duration, 0) / piece.time).toFixed(2);
      return (
        <div
          data-palette-tile
          data-palette-pattern={pattern.id}
          class="flex items-center gap-1 cursor-grab"
        >
          <div
            class="flex flex-col items-center bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-600 rounded shadow-sm px-2 py-1 select-none min-w-[3.5rem] active:border-purple-500"
            onclick={() => canTapAdd() && piece.addGroup(piece.selectedLineId, pattern)}
          >
            <span
              class={`font-bold text-sm leading-tight text-purple-800 dark:text-purple-300 font-${settings.font}`}
            >
              {pattern.name}
            </span>
            <span class="text-xs text-purple-400 dark:text-purple-500">{beats}b</span>
          </div>
          <button
            class="pattern-delete text-xs text-red-400 hover:text-red-600"
            onclick={(e) => {
              e.stopPropagation();
              patternStore.delete(pattern.id);
            }}
            title="Delete pattern"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
