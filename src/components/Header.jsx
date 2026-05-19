import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';

export function Header() {
  return {
    view({ attrs: { onOpenSettings, onOpenScoreSettings, onOpenMenu } }) {
      return (
        <header class="flex flex-wrap gap-2 items-center p-3 bg-gray-900 text-white">
          <img src="/mitsudomoe-badge.svg" class="w-8 h-8 shrink-0" aria-hidden="true" />
          <input
            class={`flex-1 min-w-0 bg-gray-800 rounded px-2 py-1 text-lg font-bold font-${settings.font}`}
            value={piece.title}
            oninput={(e) => piece.setTitle(e.target.value)}
            placeholder="Untitled"
          />
          <button
            class="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-lg leading-none"
            onclick={onOpenScoreSettings}
            title="Score settings"
          >
            ♩
          </button>
          <button
            class="bg-gray-700 hover:bg-gray-600 rounded px-1 py-1 leading-none"
            onclick={onOpenSettings}
            title="App settings"
          >
            <img
              src="/assets/image/app-settings.png"
              alt=""
              class="w-[1.125rem] h-[1.125rem] block invert"
              aria-hidden="true"
            />
          </button>
          <button
            class="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-lg leading-none"
            onclick={onOpenMenu}
            title="Menu"
          >
            ☰
          </button>
        </header>
      );
    },
  };
}
