import m from 'mithril';
import { SYMBOLS } from '../data/symbols.js';
import { piece } from '../data/piece.js';

// Drag-from-palette state
export const paletteDrag = { symbol: null };

export function Palette() {
  return {
    view() {
      return (
        <aside class="bg-gray-50 border-t border-gray-200 p-2">
          <p class="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">
            Sounds — tap a line then a sound to add, or drag to a line
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

function PaletteTile() {
  let dragEl = null;

  function onPointerDown(e, sym) {
    e.preventDefault();
    dragEl = document.createElement('div');
    dragEl.className = 'fixed z-50 pointer-events-none bg-white border-2 border-indigo-400 rounded px-2 py-1 shadow-lg flex flex-col items-center opacity-90';
    dragEl.innerHTML = `<span style="font-size:0.65rem;color:#999">${sym.hand}</span><span style="font-weight:700">${sym.name}</span>`;
    dragEl.style.left = `${e.clientX - 24}px`;
    dragEl.style.top = `${e.clientY - 28}px`;
    document.body.appendChild(dragEl);

    function onMove(ev) {
      const cx = ev.clientX ?? ev.touches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.touches?.[0]?.clientY;
      dragEl.style.left = `${cx - 24}px`;
      dragEl.style.top = `${cy - 28}px`;
    }

    function onUp(ev) {
      dragEl.remove();
      dragEl = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      const cx = ev.clientX ?? ev.changedTouches?.[0]?.clientX;
      const cy = ev.clientY ?? ev.changedTouches?.[0]?.clientY;
      const target = document.elementFromPoint(cx, cy);
      const container = target?.closest('[data-line-id]');
      if (container) {
        const lineId = container.dataset.lineId;
        piece.addSound(lineId, sym);
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
          <span class="text-xs text-gray-400 font-mono">{sym.hand}</span>
          <span class="font-bold text-base leading-tight">{sym.name}</span>
        </div>
      );
    }
  };
}
