import m from 'mithril';
import { piece } from '../data/piece.js';
import { JIUCHI } from '../data/symbols.js';
import { exportPdf } from '../pdf.js';

export function Header() {
  return {
    view({ attrs: { onOpenSettings, onOpenScoreSettings } }) {
      return (
        <header class="flex flex-wrap gap-2 items-center p-3 bg-gray-900 text-white">
          <img src="/mitsudomoe-badge.svg" class="w-8 h-8 shrink-0" aria-hidden="true" />
          <input
            class="flex-1 min-w-0 bg-gray-800 rounded px-2 py-1 text-lg font-bold"
            value={piece.title}
            oninput={e => piece.setTitle(e.target.value)}
            placeholder="Untitled"
          />
          <select
            class="bg-gray-800 rounded px-2 py-1"
            value={piece.jiuchi}
            onchange={e => piece.setJiuchi(e.target.value)}
          >
            {JIUCHI.map(j => <option value={j.id}>{j.label}</option>)}
          </select>
          <label class="flex items-center gap-1 text-sm">
            Beats
            <input
              type="number" min="1" max="32"
              class="w-14 bg-gray-800 rounded px-2 py-1"
              value={piece.beatsPerLine}
              onchange={e => piece.setBeatsPerLine(e.target.value)}
            />
          </label>
          <button
            class="bg-indigo-600 hover:bg-indigo-500 rounded px-3 py-1 text-sm font-semibold"
            onclick={() => exportPdf()}
          >Export PDF</button>
          <button
            class="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-lg leading-none"
            onclick={onOpenScoreSettings}
            title="Score settings"
          >♩</button>
          <button
            class="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-lg leading-none"
            onclick={onOpenSettings}
            title="App settings"
          >⚙</button>
        </header>
      );
    }
  };
}