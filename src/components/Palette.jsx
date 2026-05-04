import m from 'mithril';
import { SYMBOLS } from '../data/symbols.js';
import { piece } from '../data/piece.js';
import { patternStore } from '../data/patterns.js';

export function Palette() {
  return {
    view() {
      return (
        <aside class="bg-gray-50 border-t border-gray-200 p-2 flex flex-col gap-2">
          <div>
            <p class="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">
              Sounds — tap to add · drag to line
            </p>
            <div class="flex flex-wrap gap-1">
              {SYMBOLS.map(sym => <SoundPaletteTile key={sym.name} sym={sym} />)}
            </div>
          </div>

          {patternStore.items.length > 0
            ? <div>
                <p class="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">
                  Patterns
                </p>
                <div class="flex flex-wrap gap-1">
                  {patternStore.items.map(p => <PatternPaletteTile key={p.id} pattern={p} />)}
                </div>
              </div>
            : null}
        </aside>
      );
    }
  };
}

const DRAG_THRESHOLD = 6;

function makeDragGhost(label, sub) {
  const el = document.createElement('div');
  el.className = 'fixed z-50 pointer-events-none bg-white border-2 border-indigo-400 rounded px-2 py-1 shadow-lg flex flex-col items-center opacity-90';
  el.innerHTML = `<span style="font-weight:700">${label}</span><span style="font-size:0.65rem;color:#999">${sub}</span>`;
  return el;
}

function dragBehaviour({ onTap, onDrop, ghostLabel, ghostSub }) {
  let dragEl = null;

  return function onPointerDown(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function onMove(ev) {
      const cx = ev.clientX, cy = ev.clientY;
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
      if (!handler) handler = dragBehaviour({
        ghostLabel: sym.name,
        ghostSub: sym.hand,
        onTap:  () => piece.selectedLineId && piece.addSound(piece.selectedLineId, sym),
        onDrop: lineId => piece.addSound(lineId, sym),
      });
      return (
        <div
          class="flex flex-col items-center bg-white border border-gray-300 rounded shadow-sm px-2 py-1 cursor-grab select-none min-w-[3rem] active:border-indigo-400"
          onpointerdown={handler}
        >
          <span class="font-bold text-base leading-tight">{sym.name}</span>
          <span class="text-xs text-gray-400 font-mono">{sym.hand}</span>
        </div>
      );
    }
  };
}

function PatternPaletteTile() {
  let handler;
  return {
    view({ attrs: { pattern } }) {
      const beats = +(pattern.sounds.reduce((s, x) => s + x.duration, 0).toFixed(2));
      if (!handler) handler = dragBehaviour({
        ghostLabel: pattern.name,
        ghostSub: `${pattern.sounds.length} sounds`,
        onTap:  () => piece.selectedLineId && piece.addGroup(piece.selectedLineId, pattern),
        onDrop: lineId => piece.addGroup(lineId, pattern),
      });
      return (
        <div class="flex items-center gap-1">
          <div
            class="flex flex-col items-center bg-purple-50 border border-purple-300 rounded shadow-sm px-2 py-1 cursor-grab select-none min-w-[3.5rem] active:border-purple-500"
            onpointerdown={handler}
          >
            <span class="font-bold text-sm leading-tight text-purple-800">{pattern.name}</span>
            <span class="text-xs text-purple-400">{beats}b</span>
          </div>
          <button
            class="text-xs text-red-400 hover:text-red-600"
            onclick={() => patternStore.delete(pattern.id)}
            title="Delete pattern"
          >✕</button>
        </div>
      );
    }
  };
}
