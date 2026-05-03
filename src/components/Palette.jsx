import m from 'mithril';
import { SYMBOLS } from '../data/symbols.js';
import { piece } from '../data/piece.js';

export function Palette() {
  return {
    view() {
      return (
        <aside class="bg-gray-50 border-t border-gray-200 p-2">
          <p class="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">
            Tap a sound to add to selected line · drag to a specific line
          </p>
          <div class="flex flex-wrap gap-1">
            {SYMBOLS.map(sym => (
              <PaletteTile key={sym.name} sym={sym} />
            ))}
          </div>
        </aside>
      );
    }
  };
}

const DRAG_THRESHOLD = 6;

function PaletteTile() {
  let dragEl = null;

  function onPointerDown(e, sym) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function onMove(ev) {
      const cx = ev.clientX;
      const cy = ev.clientY;
      if (!dragging && Math.hypot(cx - startX, cy - startY) > DRAG_THRESHOLD) {
        dragging = true;
        dragEl = document.createElement('div');
        dragEl.className = 'fixed z-50 pointer-events-none bg-white border-2 border-indigo-400 rounded px-2 py-1 shadow-lg flex flex-col items-center opacity-90';
        dragEl.innerHTML = `<span style="font-weight:700">${sym.name}</span><span style="font-size:0.65rem;color:#999">${sym.hand}</span>`;
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
        if (container) {
          piece.addSound(container.dataset.lineId, sym);
        }
      } else {
        // Tap: add to selected line
        if (piece.selectedLineId) {
          piece.addSound(piece.selectedLineId, sym);
        }
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  return {
    view({ attrs: { sym } }) {
      return (
        <div
          class="flex flex-col items-center bg-white border border-gray-300 rounded shadow-sm px-2 py-1 cursor-grab select-none min-w-[3rem] active:border-indigo-400"
          onpointerdown={e => onPointerDown(e, sym)}
        >
          <span class="font-bold text-base leading-tight">{sym.name}</span>
          <span class="text-xs text-gray-400 font-mono">{sym.hand}</span>
        </div>
      );
    }
  };
}
