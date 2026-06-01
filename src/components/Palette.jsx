import m from 'mithril';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { settings } from '../data/settings.js';

export function Palette() {
  return {
    view({ attrs: { onOpenJiuchiPatterns } }) {
      return (
        <aside class="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-2">
          <div>
            <div class="flex items-center justify-between mb-1">
              <p class="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">
                Sounds — tap to add · drag to line
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
            <div class="flex flex-wrap gap-1">
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
                  <div class="flex flex-wrap gap-1">
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

const DRAG_THRESHOLD = 6;
const SUBDIV_WIDTH_REM = 1.25; // one division = 1.25rem in the palette

function makeDragGhost(label, sub) {
  const el = document.createElement('div');
  el.className =
    'fixed z-50 pointer-events-none bg-white border-2 border-indigo-400 rounded px-2 py-1 shadow-lg flex flex-col items-center opacity-90';
  el.innerHTML = `<span style="font-weight:700">${label}</span><span style="font-size:0.65rem;color:#999">${sub}</span>`;
  return el;
}

/**
 * Returns a pointerdown handler that implements tap-or-drag behaviour.
 * A move of less than DRAG_THRESHOLD px is treated as a tap and calls onTap.
 * A larger move shows a ghost element and calls onDrop(lineId) on release,
 * where lineId is read from the nearest [data-line-id] ancestor under the pointer.
 * @param {{ onTap: () => void, onDrop: (lineId: string) => void, ghostLabel: string, ghostSub: string }} options
 * @returns {(e: PointerEvent) => void}
 */
function dragBehaviour({ onTap, onDrop, ghostLabel, ghostSub }) {
  let dragEl = null;

  return function onPointerDown(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function onMove(ev) {
      const cx = ev.clientX,
        cy = ev.clientY;
      if (!dragging && Math.hypot(cx - startX, cy - startY) > DRAG_THRESHOLD) {
        dragging = true;
        dragEl = makeDragGhost(ghostLabel, ghostSub);
        document.body.appendChild(dragEl);
      }
      if (dragging && dragEl) {
        dragEl.style.left = `${cx - 24}px`;
        dragEl.style.top = `${cy - 28}px`;
      }
    }

    function onUp(ev) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (dragging) {
        dragEl?.remove();
        dragEl = null;
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const container = target?.closest('[data-line-id]');
        if (container) onDrop(container.dataset.lineId);
      } else {
        onTap();
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };
}

/** Returns the hand to display on a palette tile (top-level or first alternative). */
function paletteHand(sym) {
  if (sym.hand) return sym.hand;
  if (sym.alternatives && sym.alternatives.length > 0) return sym.alternatives[0].hand ?? '';
  return '';
}

function SoundPaletteTile() {
  let handler;
  let handlerSym;
  return {
    view({ attrs: { sym } }) {
      const hand = paletteHand(sym);
      if (sym !== handlerSym) {
        handlerSym = sym;
        handler = dragBehaviour({
          ghostLabel: sym.name,
          ghostSub: hand,
          onTap: () =>
            !piece.selectMode &&
            !piece.lineSelectMode &&
            piece.selectedLineId &&
            piece.addSound(piece.selectedLineId, sym),
          onDrop: (lineId) =>
            !piece.selectMode && !piece.lineSelectMode && piece.addSound(lineId, sym),
        });
      }
      const dur = sym.duration ?? sym.alternatives?.[0]?.duration ?? 1;
      return (
        <div
          class="flex flex-col items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded shadow-sm px-1 py-1 select-none min-w-[1.75rem] cursor-grab active:border-indigo-400"
          style={`width:${dur * SUBDIV_WIDTH_REM}rem`}
          onpointerdown={handler}
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
  let handler;
  return {
    view() {
      if (!handler)
        handler = dragBehaviour({
          ghostLabel: '—',
          ghostSub: '',
          onTap: () =>
            !piece.selectMode &&
            !piece.lineSelectMode &&
            piece.selectedLineId &&
            piece.addSound(piece.selectedLineId, implicitSym()),
          onDrop: (lineId) =>
            !piece.selectMode && !piece.lineSelectMode && piece.addSound(lineId, implicitSym()),
        });
      return (
        <div
          class="flex flex-col items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded shadow-sm px-1 py-1 select-none min-w-[1.75rem] cursor-grab active:border-indigo-400"
          style={`width:${piece.time * SUBDIV_WIDTH_REM}rem`}
          onpointerdown={handler}
        >
          <span class={`font-bold text-base leading-tight font-${settings.font}`}>—</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">1–8</span>
        </div>
      );
    },
  };
}

function PatternPaletteTile() {
  let handler;
  return {
    view({ attrs: { pattern } }) {
      const beats = +(pattern.sounds.reduce((s, x) => s + x.duration, 0) / piece.time).toFixed(2);
      if (!handler)
        handler = dragBehaviour({
          ghostLabel: pattern.name,
          ghostSub: `${pattern.sounds.length} sounds`,
          onTap: () =>
            !piece.selectMode &&
            !piece.lineSelectMode &&
            piece.selectedLineId &&
            piece.addGroup(piece.selectedLineId, pattern),
          onDrop: (lineId) =>
            !piece.selectMode && !piece.lineSelectMode && piece.addGroup(lineId, pattern),
        });
      return (
        <div class="flex items-center gap-1">
          <div
            class="flex flex-col items-center bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-600 rounded shadow-sm px-2 py-1 select-none min-w-[3.5rem] cursor-grab active:border-purple-500"
            onpointerdown={handler}
          >
            <span
              class={`font-bold text-sm leading-tight text-purple-800 dark:text-purple-300 font-${settings.font}`}
            >
              {pattern.name}
            </span>
            <span class="text-xs text-purple-400 dark:text-purple-500">{beats}b</span>
          </div>
          <button
            class="text-xs text-red-400 hover:text-red-600"
            onclick={() => patternStore.delete(pattern.id)}
            title="Delete pattern"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
