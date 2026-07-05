import m from 'mithril';
import { TAIKO_GROUPS } from '../data/symbolSets.js';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';
import { Toggle } from './SettingsModal.jsx';

export function MetronomeSettingsModal() {
  return {
    view({ attrs: { onClose } }) {
      // The beat track is either ticks matching the score's jiuchi ('auto') or
      // the jiuchi sections authored in the score played as looping drum rhythms
      // ('inline') — the latter only meaningful when the score has such a section.
      const hasInline = piece.lines.some((l) => l.type === 'jiuchi-section');
      // Inline plays each section's drum pattern as authored, so the head-only and
      // emphasise tick options don't apply to it.
      const inlineSelected = piece.metronomeJiuchi === 'inline';
      return m(
        'div',
        { class: 'fixed inset-0 z-40 bg-black/50 flex flex-col justify-end', onclick: onClose },
        m(
          'div',
          {
            class:
              'bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto',
            onclick: (e) => e.stopPropagation(),
          },
          [
            m('div', { class: 'flex justify-center pt-3 pb-1' }, [
              m('div', { class: 'w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full' }),
            ]),
            m('div', { class: 'px-5 pb-8' }, [
              m('div', { class: 'flex items-center justify-between mb-5' }, [
                m('h2', { class: 'text-xl font-bold dark:text-white' }, 'Metronome/Jiuchi'),
                m(
                  'button',
                  {
                    class:
                      'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center',
                    onclick: onClose,
                  },
                  '×'
                ),
              ]),

              m(
                'div',
                {
                  class:
                    'flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700',
                },
                [
                  m('div', [
                    m('div', { class: 'font-medium dark:text-white' }, 'Enable'),
                    m(
                      'div',
                      { class: 'text-sm text-gray-500 dark:text-gray-400' },
                      'Play a beat track during playback'
                    ),
                  ]),
                  m(Toggle, {
                    checked: piece.metronome,
                    onChange: (v) => piece.setMetronome('metronome', v),
                  }),
                ]
              ),

              // App-level setting (applies to every score), unlike the per-score
              // piece.metronome* fields around it — hence settings, not piece.
              m(
                'div',
                {
                  class:
                    'flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700',
                },
                [
                  m('div', [
                    m('div', { class: 'font-medium dark:text-white' }, 'Count-in'),
                    m(
                      'div',
                      { class: 'text-sm text-gray-500 dark:text-gray-400' },
                      'Play one bar of clicks before playback'
                    ),
                  ]),
                  m(Toggle, {
                    checked: settings.countIn,
                    onChange: (v) => settings.set('countIn', v),
                  }),
                ]
              ),

              m(
                'div',
                {
                  class: `flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${!hasInline && !inlineSelected ? 'opacity-50' : ''}`,
                },
                [
                  m('div', [
                    m('div', { class: 'font-medium dark:text-white' }, 'Play jiuchi'),
                    m(
                      'div',
                      { class: 'text-sm text-gray-500 dark:text-gray-400' },
                      hasInline
                        ? "Loop the score's jiuchi sections instead of the metronome"
                        : 'Add a jiuchi section to the score first'
                    ),
                  ]),
                  m(Toggle, {
                    checked: inlineSelected,
                    // Disabled only when there is nothing to play AND the toggle is
                    // off — if a stale 'inline' survives section removal it must
                    // stay switchable back to ticks.
                    disabled: !hasInline && !inlineSelected,
                    onChange: (v) => piece.setMetronome('metronomeJiuchi', v ? 'inline' : 'auto'),
                  }),
                ]
              ),

              m(
                'div',
                {
                  class: `flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${inlineSelected ? 'opacity-50' : ''}`,
                },
                [
                  m('div', [
                    m('div', { class: 'font-medium dark:text-white' }, 'Head beat only'),
                    m(
                      'div',
                      { class: 'text-sm text-gray-500 dark:text-gray-400' },
                      'Tick once per beat, not every subdivision'
                    ),
                  ]),
                  m(Toggle, {
                    checked: piece.metronomeHeadOnly,
                    disabled: inlineSelected,
                    onChange: (v) => piece.setMetronome('metronomeHeadOnly', v),
                  }),
                ]
              ),

              m(
                'div',
                {
                  class: `flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${inlineSelected ? 'opacity-50' : ''}`,
                },
                [
                  m('div', [
                    m('div', { class: 'font-medium dark:text-white' }, 'Emphasise head beat'),
                    m(
                      'div',
                      { class: 'text-sm text-gray-500 dark:text-gray-400' },
                      'Accent the start of each beat'
                    ),
                  ]),
                  m(Toggle, {
                    checked: piece.metronomeEmphasiseHead,
                    disabled: inlineSelected,
                    onChange: (v) => piece.setMetronome('metronomeEmphasiseHead', v),
                  }),
                ]
              ),

              m(
                'div',
                {
                  class: `flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700 ${inlineSelected ? 'opacity-50' : ''}`,
                },
                [
                  m('div', [
                    m('div', { class: 'font-medium dark:text-white' }, 'Use Shime sound'),
                    m(
                      'div',
                      { class: 'text-sm text-gray-500 dark:text-gray-400' },
                      'Tick with the Shime TEN sample instead of a synth click'
                    ),
                  ]),
                  m(Toggle, {
                    checked: piece.metronomeShime,
                    disabled: inlineSelected,
                    onChange: (v) => piece.setMetronome('metronomeShime', v),
                  }),
                ]
              ),

              m('div', { class: 'py-4 border-b border-gray-200 dark:border-gray-700' }, [
                m('div', { class: 'flex items-center justify-between mb-1' }, [
                  m('div', { class: 'font-medium dark:text-white' }, 'Volume'),
                  m(
                    'div',
                    {
                      class:
                        'text-sm tabular-nums text-gray-500 dark:text-gray-400 w-10 text-right',
                    },
                    `${Math.round(piece.metronomeVolume * 100)}%`
                  ),
                ]),
                m('input', {
                  type: 'range',
                  class: 'w-full accent-indigo-600',
                  min: '0',
                  max: '2',
                  step: '0.05',
                  value: piece.metronomeVolume,
                  oninput: (e) => piece.setMetronomeVolumeLive(Number(e.target.value)),
                  onchange: (e) => piece.setMetronome('metronomeVolume', Number(e.target.value)),
                }),
              ]),

              m('div', { class: 'flex items-center justify-between py-4' }, [
                m('div', [
                  m('div', { class: 'font-medium dark:text-white' }, 'Practice loop'),
                  m('div', { class: 'text-sm text-gray-500 dark:text-gray-400' }, 'Jiuchi only'),
                ]),
                m('div', { class: 'flex items-center gap-2' }, [
                  m(
                    'select',
                    {
                      class:
                        'bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600 text-sm',
                      title: 'Loop voice: tick, or drum strikes on a taiko',
                      // Session-only, like the BPM: lives on the player.
                      onchange: (e) => player.setMetroTaiko(piece, e.target.value || null),
                    },
                    [
                      m('option', { value: '', selected: !player.metroTaiko }, 'Tick'),
                      TAIKO_GROUPS.flatMap((g) => g.taikos).map((t) =>
                        m(
                          'option',
                          { value: t.name, selected: player.metroTaiko === t.name },
                          t.name
                        )
                      ),
                    ]
                  ),
                  m('input', {
                    type: 'number',
                    min: '1',
                    max: '300',
                    class:
                      'w-16 text-right bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600',
                    value: player.metroBpm ?? piece.bpm,
                    // Store on input so the value survives redraws mid-edit; only
                    // restart a running loop on commit (blur/enter/spinner).
                    oninput: (e) => {
                      player.metroBpm = Number(e.target.value);
                    },
                    onchange: (e) => player.setMetroBpm(piece, Number(e.target.value)),
                  }),
                  (() => {
                    const active = player.isScope('metronome');
                    return m(
                      'button',
                      {
                        class: `rounded border px-3 py-1 text-sm font-medium ${active ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`,
                        title: active ? 'Stop' : 'Start practice metronome',
                        onclick: () => player.toggleMetronomeLoop(piece),
                      },
                      active ? '⏹' : '▶'
                    );
                  })(),
                ]),
              ]),
            ]),
          ]
        )
      );
    },
  };
}
