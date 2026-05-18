import m from 'mithril';
import { SYMBOLS } from '../data/symbols.js';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';
import { settings } from '../data/settings.js';

export function Palette() {
  return {
    view() {
      return (
        <aside class="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-2 flex flex-col gap-2">
          <div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold uppercase tracking-wide">
              Sounds — tap to add · drag to line
            </p>
            <div class="flex flex-wrap gap-1">
              {SYMBOLS.map((sym) => (
                <SoundPaletteTile key={sym.name} sym={sym} />
              ))}
              <ImplicitPaletteTile />
            </div>
          </div>

          {patternStore.items.length > 0 ? (
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold uppercase tracking-wide">
                Patterns
              </p>
              <div class="flex flex-wrap gap-1">
                {patternStore.items.map((p) => (
                  <PatternPaletteTile key={p.id} pattern={p} />
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      );
    },
  };
}

const DRAG_THRESHOLD = 6;

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

function SoundPaletteTile() {
  let handler;
  return {
    view({ attrs: { sym } }) {
      if (!handler)
        handler = dragBehaviour({
          ghostLabel: sym.name,
          ghostSub: sym.hand,
          onTap: () =>
            !piece.selectMode &&
            !piece.lineSelectMode &&
            piece.selectedLineId &&
            piece.addSound(piece.selectedLineId, sym),
          onDrop: (lineId) =>
            !piece.selectMode && !piece.lineSelectMode && piece.addSound(lineId, sym),
        });
      return (
        <div
          class="flex flex-col items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded shadow-sm px-2 py-1 select-none min-w-[3rem] cursor-grab active:border-indigo-400"
          onpointerdown={handler}
        >
          <span class={`font-bold text-base leading-tight font-${settings.font}`}>{sym.name}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">{sym.hand}</span>
        </div>
      );
    },
  };
}

const IMPLICIT_SYM = { name: '—', duration: 1, implicit: true };

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
            piece.addSound(piece.selectedLineId, IMPLICIT_SYM),
          onDrop: (lineId) =>
            !piece.selectMode && !piece.lineSelectMode && piece.addSound(lineId, IMPLICIT_SYM),
        });
      return (
        <div
          class="flex flex-col items-center bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded shadow-sm px-2 py-1 select-none min-w-[3rem] cursor-grab active:border-indigo-400"
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
      const beats = +pattern.sounds.reduce((s, x) => s + x.duration, 0).toFixed(2);
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
