import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';

export function Header() {
  let saved = false;
  let savedTimer = null;

  /**
   * Calls onSave and briefly flashes the save button to confirm the action.
   * @param {() => Promise<void>} onSave
   */
  function handleSave(onSave) {
    onSave();
    clearTimeout(savedTimer);
    saved = true;
    m.redraw();
    savedTimer = setTimeout(() => {
      saved = false;
      m.redraw();
    }, 1500);
  }

  return {
    view({
      attrs: { onOpenSettings, onOpenScoreSettings, onOpenMetronomeSettings, onOpenMenu, onSave },
    }) {
      return m(
        'header',
        { class: 'flex flex-wrap gap-2 items-center p-3 bg-gray-900 text-white' },
        [
          m('img', {
            src: '/mitsudomoe-badge.svg',
            class: 'w-8 h-8 shrink-0',
            'aria-hidden': 'true',
          }),
          m('input', {
            class: `flex-1 min-w-0 bg-gray-800 rounded px-2 py-1 text-lg font-bold font-${settings.font}`,
            value: piece.title,
            oninput: (e) => piece.setTitle(e.target.value),
            placeholder: 'Untitled',
          }),
          m(
            'button',
            {
              class: `rounded px-2 py-1 leading-none transition-colors ${saved ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`,
              onclick: () => handleSave(onSave),
              title: 'Save score (Ctrl+S)',
            },
            saved
              ? m(
                  'svg',
                  {
                    xmlns: 'http://www.w3.org/2000/svg',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': '2.5',
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    class: 'w-[1.125rem] h-[1.125rem] block',
                  },
                  [m('polyline', { points: '20 6 9 17 4 12' })]
                )
              : m(
                  'svg',
                  {
                    xmlns: 'http://www.w3.org/2000/svg',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-width': '2',
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    class: 'w-[1.125rem] h-[1.125rem] block',
                  },
                  [
                    m('path', {
                      d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
                    }),
                    m('polyline', { points: '17 21 17 13 7 13 7 21' }),
                    m('polyline', { points: '7 3 7 8 15 8' }),
                  ]
                )
          ),
          m(
            'button',
            {
              class: 'bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-lg leading-none',
              onclick: onOpenScoreSettings,
              title: 'Score settings',
            },
            '♩'
          ),
          m(
            'button',
            {
              // Green while the standalone practice metronome loops, so it stays
              // visible (and findable to stop) after the sheet is closed.
              class: `rounded px-2 py-1 text-lg leading-none ${player.isScope('metronome') ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-700 hover:bg-gray-600'}`,
              onclick: onOpenMetronomeSettings,
              title: 'Metronome',
            },
            '▲'
          ),
          m(
            'button',
            {
              class: 'bg-gray-700 hover:bg-gray-600 rounded px-1 py-1 leading-none',
              onclick: onOpenSettings,
              title: 'App settings',
            },
            m('img', {
              src: '/assets/image/app-settings.png',
              alt: '',
              class: 'w-[1.125rem] h-[1.125rem] block invert',
              'aria-hidden': 'true',
            })
          ),
          m(
            'button',
            {
              class: 'bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 text-lg leading-none',
              onclick: onOpenMenu,
              title: 'Menu',
            },
            '☰'
          ),
        ]
      );
    },
  };
}
