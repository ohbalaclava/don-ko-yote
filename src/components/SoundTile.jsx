import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';
import { isIntegerBeat, effectiveVolume } from '../util.js';

const SUBDIV_WIDTH_REM = 2; // single-division (smallest) tile width
const PROP_PAD_REM = 0.25; // left padding in proportional mode for tiles wider than one division

const STEP_BTN =
  'w-6 h-6 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 flex items-center justify-center';

/**
 * A −/value/+ stepper row used by the inline editor for the implicit-rest count,
 * duration, and volume controls. `onDec`/`onInc` apply their own bounds; taps that
 * would exceed a bound simply no-op (matching the inline guards they replaced).
 */
function Stepper() {
  return {
    view({ attrs: { value, valueClass, onDec, onInc } }) {
      return m('div', { class: 'flex items-center justify-center gap-2' }, [
        m('button', { class: STEP_BTN, onclick: onDec }, '−'),
        m('span', { class: valueClass }, value),
        m('button', { class: STEP_BTN, onclick: onInc }, '+'),
      ]);
    },
  };
}

export function SoundTile() {
  return {
    view({ attrs: { sound, lineId, startPos, isSelected } }) {
      const et = piece.editingTile;
      const isEditing = !piece.selectMode && et && et.lineId === lineId && et.soundId === sound.id;
      const time = piece.time;
      const beatWidthRem = SUBDIV_WIDTH_REM * time; // one full beat ≡ `time` subdivisions wide

      const isPlaying = player.currentSoundId === sound.id;
      const borderClass = isPlaying
        ? 'border-green-500 bg-green-100 dark:border-green-400 dark:bg-green-900/40 ring-2 ring-green-400'
        : isSelected
          ? 'border-teal-500 bg-teal-50 dark:border-teal-400 dark:bg-teal-900/40'
          : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800';

      const widthStyle = settings.proportionalWidth
        ? `width: ${(sound.duration / time) * beatWidthRem}rem`
        : undefined;

      const prop = settings.proportionalWidth;
      const propPad = prop && sound.duration > 1 ? PROP_PAD_REM : 0;

      return m(
        'div',
        {
          class: `sound-tile relative flex flex-col ${prop ? 'items-start' : 'items-center'} border rounded shadow-sm ${prop ? `${propPad ? 'pl-1' : 'pl-0'} pr-0 py-1` : 'px-2 py-1'} cursor-grab select-none ${prop ? '' : 'min-w-[3rem]'} ${borderClass}`,
          style: widthStyle,
          'data-sound-id': sound.id,
          onpointerup: (e) => {
            if (!piece.selectMode) return;
            e.stopPropagation();
            piece.toggleSoundSelection(lineId, sound.id);
          },
          onclick: (e) => {
            e.stopPropagation();
            if (piece.selectMode) return;
            piece.setEditingTile(isEditing ? null : { lineId, soundId: sound.id });
          },
        },
        [
          m(
            'div',
            { class: 'contents' },
            prop
              ? Array.from({ length: sound.duration }, (_, i) => {
                  const absPos = (startPos ?? 0) + i;
                  const isHB = isIntegerBeat(absPos, time);
                  return m('span', {
                    class: `absolute -top-3 -translate-x-1/2 rounded-full ${isHB ? 'beat-dot w-2 h-2 bg-gray-900 dark:bg-gray-100' : 'w-1.5 h-1.5 bg-gray-400 dark:bg-gray-500'}`,
                    style: `left:${propPad + SUBDIV_WIDTH_REM * (i + 0.5)}rem`,
                  });
                })
              : startPos != null && isIntegerBeat(startPos, time)
                ? m('span', {
                    class:
                      'beat-dot absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100',
                  })
                : null
          ),
          // Silent text tiles carry free-form text, so in proportional mode the label
          // spans the whole tile (w-full) instead of the fixed one-subdivision column
          // used to centre a sound's syllable over its onset.
          m(
            'div',
            {
              class: prop
                ? `flex flex-col items-center py-0${sound.silent ? ' w-full' : ''}`
                : 'contents',
              style: prop && !sound.silent ? `width: ${SUBDIV_WIDTH_REM}rem` : undefined,
            },
            [
              m(
                'span',
                {
                  class: `font-bold text-base leading-tight text-gray-900 dark:text-gray-200 font-${settings.font}${sound.emphasis ? ' underline' : ''}${sound.skin === 'back' ? ' italic' : ''}`,
                },
                sound.silent && !sound.name
                  ? m('span', { class: 'text-gray-300 dark:text-gray-600' }, '…')
                  : sound.name
              ),
              piece.showVolume && effectiveVolume(sound) != null
                ? m(
                    'div',
                    {
                      class:
                        'w-full flex justify-between text-xs text-gray-400 dark:text-gray-500 font-mono px-1',
                    },
                    [m('span', sound.hand), m('span', effectiveVolume(sound))]
                  )
                : m(
                    'span',
                    { class: 'text-xs text-gray-400 dark:text-gray-500 font-mono' },
                    sound.hand
                  ),
            ]
          ),
          isEditing ? m(SoundEditor, { lineId, sound }) : null,
        ]
      );
    },
  };
}

/**
 * Keep the inline editor on-screen. It is anchored `absolute` below-left of its
 * tile, so near the viewport's right edge or the bottom palette it would be
 * clipped by the scrollable Score. Measure the rendered editor and, idempotently
 * (reset-then-measure so repeated `onupdate` calls are stable):
 *   - shift it horizontally back inside the viewport's right/left edge;
 *   - flip it above the tile when it would collide with the palette (or viewport
 *     bottom) and more room exists above;
 *   - as a last resort cap its height to the available space and let it scroll.
 */
function positionEditor(vnode) {
  const el = vnode.dom;
  const margin = 8;

  // Reset any prior adjustments so the measurement reflects the natural layout.
  el.style.transform = '';
  el.style.top = '';
  el.style.bottom = '';
  el.style.marginTop = '';
  el.style.marginBottom = '';
  el.style.maxHeight = '';
  el.style.overflowY = '';

  // Horizontal: nudge back inside the viewport's right (then left) edge.
  let rect = el.getBoundingClientRect();
  const overflowRight = rect.right - (window.innerWidth - margin);
  const overflowLeft = margin - rect.left;
  if (overflowRight > 0) el.style.transform = `translateX(${-overflowRight}px)`;
  else if (overflowLeft > 0) el.style.transform = `translateX(${overflowLeft}px)`;

  // Vertical: the bottom palette (an <aside>) is the lower bound; fall back to
  // the viewport bottom if it is ever absent.
  const tile = el.closest('.sound-tile');
  if (!tile) return;
  const tileRect = tile.getBoundingClientRect();
  const palette = document.querySelector('aside');
  const bottomBound = (palette ? palette.getBoundingClientRect().top : window.innerHeight) - margin;
  const spaceBelow = bottomBound - tileRect.bottom;
  const spaceAbove = tileRect.top - margin;
  const needed = el.getBoundingClientRect().height;

  if (needed > spaceBelow && spaceAbove > spaceBelow) {
    // Flip above the tile.
    el.style.top = 'auto';
    el.style.bottom = '100%';
    el.style.marginTop = '0';
    el.style.marginBottom = '0.25rem';
    if (needed > spaceAbove) {
      el.style.maxHeight = `${spaceAbove}px`;
      el.style.overflowY = 'auto';
    }
  } else if (needed > spaceBelow) {
    el.style.maxHeight = `${spaceBelow}px`;
    el.style.overflowY = 'auto';
  }
}

export function SoundEditor() {
  return {
    view({ attrs: { lineId, sound } }) {
      const time = piece.time;
      let showLigature = false;
      let isLigated = false;
      if (!settings.proportionalWidth) {
        const line = piece.lines.find((l) => l.id === lineId);
        if (line) {
          const idx = line.sounds.findIndex((s) => s.id === sound.id);
          if (idx >= 1) {
            const prev = line.sounds[idx - 1];
            if (prev && prev.type !== 'group') {
              showLigature = true;
              const sameDur = time % 2 !== 0 || prev.duration === sound.duration;
              const prevStart = line.sounds.slice(0, idx - 1).reduce((s, x) => s + x.duration, 0);
              const sameBeat =
                Math.floor(prevStart / time) === Math.floor((prevStart + prev.duration) / time);
              const autoWouldJoin =
                sameDur && sameBeat && prev.duration < time && prev.hand !== sound.hand;
              isLigated = sound.ligature === true || (autoWouldJoin && sound.ligature !== false);
            }
          }
        }
      }

      const showHand =
        !!sound.alternatives || sound.hand === 'L' || sound.hand === 'R' || sound.hand === 'B';
      const showSkin = piece.skins === 2 && !!sound.hand;
      const showDuration = !sound.implicit;
      const maxDuration = time;

      return [
        m('div', {
          key: 'bd',
          class: 'fixed inset-0 z-10',
          onclick: () => piece.setEditingTile(null),
        }),
        m(
          'div',
          {
            key: 'ed',
            class:
              'absolute top-full left-0 z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg p-2 flex flex-col gap-1 min-w-[8rem]',
            oncreate: positionEditor,
            onupdate: positionEditor,
            onclick: (e) => e.stopPropagation(),
          },
          [
            sound.implicit &&
              m(Stepper, {
                value: sound.name,
                valueClass: 'font-bold w-4 text-center text-gray-900 dark:text-gray-200',
                onDec: () => {
                  const cur = sound.name === '—' ? 0 : parseInt(sound.name, 10) || 0;
                  if (cur > 0)
                    piece.updateSound(lineId, sound.id, {
                      name: cur === 1 ? '—' : String(cur - 1),
                    });
                },
                onInc: () => {
                  const cur = sound.name === '—' ? 0 : parseInt(sound.name, 10) || 0;
                  if (cur < 8) piece.updateSound(lineId, sound.id, { name: String(cur + 1) });
                },
              }),
            sound.silent &&
              m('input', {
                class:
                  'border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5 text-sm font-bold text-center',
                value: sound.name,
                oninput: (e) => piece.updateSound(lineId, sound.id, { name: e.target.value }),
                placeholder: 'text',
              }),
            showHand &&
              m('div', [
                m(
                  'div',
                  { class: 'flex gap-1' },
                  ['L', 'B', 'R']
                    .filter(
                      (h) => !sound.alternatives || sound.alternatives.some((a) => a.hand === h)
                    )
                    .map((h) =>
                      m(
                        'button',
                        {
                          key: h,
                          class: `${h === 'B' ? 'w-6' : 'flex-1'} rounded py-0.5 text-sm font-bold border ${sound.hand === h ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 dark:text-gray-300'}`,
                          onclick: () => {
                            if (sound.alternatives) {
                              const alt = sound.alternatives.find((a) => a.hand === h);
                              if (alt)
                                piece.updateSound(lineId, sound.id, {
                                  hand: alt.hand,
                                  duration: alt.duration,
                                });
                            } else {
                              piece.updateSound(lineId, sound.id, { hand: h });
                            }
                          },
                        },
                        h
                      )
                    )
                ),
              ]),
            showDuration &&
              m(Stepper, {
                value: `${sound.duration}/${time}`,
                valueClass: 'font-mono text-xs w-10 text-center text-gray-600 dark:text-gray-400',
                onDec: () => {
                  if (sound.duration > 1)
                    piece.updateSound(lineId, sound.id, { duration: sound.duration - 1 });
                },
                onInc: () => {
                  if (sound.duration < maxDuration)
                    piece.updateSound(lineId, sound.id, { duration: sound.duration + 1 });
                },
              }),
            piece.showVolume &&
              effectiveVolume(sound) != null &&
              m(Stepper, {
                value: `vol ${effectiveVolume(sound)}`,
                valueClass: 'font-mono text-xs w-10 text-center text-gray-600 dark:text-gray-400',
                onDec: () => {
                  const v = effectiveVolume(sound);
                  if (v > 1) piece.updateSound(lineId, sound.id, { volume: v - 1 });
                },
                onInc: () => {
                  const v = effectiveVolume(sound);
                  if (v < 8) piece.updateSound(lineId, sound.id, { volume: v + 1 });
                },
              }),
            m(
              'label',
              { class: 'text-xs font-semibold text-gray-600 dark:text-gray-400 mt-1' },
              'Instruction'
            ),
            m('input', {
              class:
                'border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-1 py-0.5 text-xs',
              value: sound.instruction,
              oninput: (e) => piece.updateSound(lineId, sound.id, { instruction: e.target.value }),
              placeholder: 'e.g. step left',
            }),
            !sound.implicit &&
              !sound.silent &&
              m(
                'button',
                {
                  class: `mt-1 text-xs rounded border px-2 py-1 font-medium transition-colors ${sound.emphasis ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`,
                  onclick: () => piece.updateSound(lineId, sound.id, { emphasis: !sound.emphasis }),
                },
                'Accent'
              ),
            showSkin &&
              m(
                'button',
                {
                  class: `text-xs rounded border px-2 py-1 font-medium transition-colors ${sound.skin === 'back' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`,
                  onclick: () =>
                    piece.updateSound(lineId, sound.id, {
                      skin: sound.skin === 'back' ? undefined : 'back',
                    }),
                },
                'Back skin'
              ),
            showLigature &&
              m(
                'button',
                {
                  class:
                    'mt-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-2 py-1 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                  onclick: () =>
                    piece.updateSound(lineId, sound.id, { ligature: isLigated ? false : true }),
                },
                isLigated ? 'Break join' : '← join'
              ),
            showLigature &&
              sound.ligature != null &&
              m(
                'button',
                {
                  class:
                    'text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500 px-2 py-1 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                  onclick: () => piece.updateSound(lineId, sound.id, { ligature: undefined }),
                },
                'Auto'
              ),
            m(
              'button',
              {
                class:
                  'mt-1 text-xs rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-2 py-1 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors',
                onclick: () => {
                  piece.removeSound(lineId, sound.id);
                  piece.setEditingTile(null);
                },
              },
              'Remove'
            ),
          ]
        ),
      ];
    },
  };
}
