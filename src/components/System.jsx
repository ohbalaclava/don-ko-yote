import m from 'mithril';
import { piece, lanesOf } from '../data/piece.js';
import { AddRowActions } from './AddRowActions.jsx';
import { openPartSheet } from './PartSheet.jsx';
import { Lane, laneBeatLabel } from './Lane.jsx';
import { repeatDecoration, repeatBarsWidth } from './repeatDecoration.js';
import { player } from '../audio/player.js';
import { anim } from '../anim.js';

/**
 * Row tint and left-border for a system, split so the sticky gutter cells of an
 * ensemble row can repaint the same background behind themselves (a transparent
 * sticky cell would let the scrolled tiles show through).
 * @returns {{ border: string, bg: string }}
 */
function rowStyling({ lineSelected, laneSelected, isJiuchi, showRepeatBars }) {
  if (piece.lineSelectMode && lineSelected) {
    return { border: 'border-l-4 border-l-teal-400', bg: 'bg-teal-100 dark:bg-teal-800/40' };
  }
  if (!piece.lineSelectMode && laneSelected) {
    return { border: 'border-l-4 border-l-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-800/40' };
  }
  if (isJiuchi) {
    return { border: 'border-l-4 border-l-green-400', bg: 'bg-green-50 dark:bg-green-900/20' };
  }
  if (showRepeatBars) {
    return {
      border: 'border-l-4 border-l-transparent',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    };
  }
  return { border: 'border-l-4 border-l-transparent', bg: '' };
}

/**
 * Where a part sits in a run of consecutive parts sharing a set: used to draw the
 * bracket that links one player's drums.
 * @param {number} idx - Index into `piece.parts`.
 * @returns {{ set: object, first: boolean, last: boolean }|null}
 */
function setRun(idx) {
  const part = piece.parts[idx];
  if (!part?.setId) return null;
  const set = piece.sets.find((s) => s.id === part.setId);
  if (!set) return null;
  return {
    set,
    first: piece.parts[idx - 1]?.setId !== part.setId,
    last: piece.parts[idx + 1]?.setId !== part.setId,
  };
}

/**
 * Two characters identifying a part in the ensemble gutter. The gutter is
 * repeated on every lane of every system, so it is width that the music cannot
 * have: a named part gets its initials (one word → its first two letters), an
 * unnamed one the first two letters of its drum, which are unique across the
 * taiko list.
 * @param {{ name?: string, taiko: string }|null} part
 * @returns {string}
 */
function partBadgeLabel(part) {
  if (!part) return 'Ji';
  const words = (part.name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const source = words[0] || part.taiko;
  return source.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

/**
 * One score row. A system holds one lane per part, stacked and sharing a beat
 * grid, so beat N of every part sits in the same column.
 *
 * A solo score (one part) renders the pre-ensemble single-lane row verbatim: the
 * drag handle, the lane, and the trailing beat-count / play / remove column. The
 * ensemble layout only appears once a second part exists.
 *
 * Attrs: `{ system, index, repeatDepth, singleRepeat }`.
 */
export function System() {
  return {
    oncreate({ dom, attrs: { system } }) {
      if (anim.consumeAdded(system.id)) anim.flashIn(dom);
    },
    onbeforeremove({ dom, attrs: { system } }) {
      if (anim.consumeRemoved(system.id)) return anim.flashOut(dom);
    },
    view({ attrs: { system, index, repeatDepth = 0, singleRepeat = null } }) {
      const lanes = lanesOf(system);
      // Jiuchi-definition systems keep their single part-less lane, so they take
      // the solo layout even in an ensemble score.
      const ensemble = lanes.length > 1;
      const lineSelected = piece.lineSelection.includes(system.id);
      const laneSelected = lanes.some((l) => l.id === piece.selectedLineId);
      const isJiuchi = piece.jiuchiMap.has(system.id);

      const showRepeatBars =
        repeatDepth > 0 &&
        !(piece.lineSelectMode && lineSelected) &&
        !(!piece.lineSelectMode && laneSelected);
      const { border, bg } = rowStyling({
        lineSelected,
        laneSelected,
        isJiuchi,
        showRepeatBars,
      });
      // A sticky gutter cell has the scrolled tiles passing underneath it, so it
      // must be fully opaque. The row tint alone is not: every dark-mode tint is
      // translucent (`dark:bg-indigo-800/40` and friends), which let the tiles read
      // straight through. So a gutter cell paints the page colour and the tint over
      // it as two layers, `gutterTint` filling `gutterBase`. Rebuilding the tint
      // this way rather than picking an opaque equivalent keeps the cell exactly
      // the colour the rest of the row composites to.
      const gutterBase = 'bg-white dark:bg-gray-900';
      const gutterTint = bg;
      const decoration = showRepeatBars ? repeatDecoration(repeatDepth) : null;
      // When a repeat-block row is selected/highlighted, decoration is suppressed.
      // Use the same left padding the decoration would have used so content doesn't
      // shift. Non-repeat rows always get 12px.
      const fallbackPaddingLeft =
        repeatDepth > 0 ? `${repeatBarsWidth(repeatDepth) + 4}px` : '12px';

      // The add-row toolbar follows the selected lane, so new rows insert here.
      const showActions = laneSelected && !piece.selectMode && !piece.lineSelectMode;

      const handle = (extra = '') =>
        m(
          'div',
          {
            class: `line-drag-handle flex flex-col items-center gap-0.5 shrink-0 pt-1 cursor-grab select-none ${extra}`,
            title: 'Drag to reorder',
          },
          [
            m('span', { class: 'text-gray-300 dark:text-gray-600 text-sm leading-none' }, '⠿'),
            m(
              'span',
              {
                class: `text-xs ${laneSelected ? 'text-indigo-500 dark:text-indigo-400 font-bold' : 'text-gray-400 dark:text-gray-500'}`,
              },
              index + 1
            ),
          ]
        );

      const removeButton = (extra = '') =>
        m(
          'button',
          {
            class: `w-8 h-8 flex items-center justify-center rounded text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ${extra}`,
            onclick: (e) => {
              e.stopPropagation();
              piece.removeLine(system.id);
            },
            title: 'Remove line',
          },
          '✕'
        );

      const playButton = (lane, size = 'w-8 h-8') =>
        m(
          'button',
          {
            class: `${size} flex items-center justify-center rounded text-sm leading-none ${player.isScope('line', lane.id) ? 'text-green-600 dark:text-green-400' : 'text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`,
            onclick: (e) => {
              e.stopPropagation();
              // A one-lane system: this lane only, with the row's id kept so the
              // jiuchi taiko lookup still resolves.
              const solo = { id: system.id, lanes: [lane] };
              player.toggleScope(piece, [solo], { type: 'line', id: lane.id });
            },
            title: player.isScope('line', lane.id) ? 'Stop' : 'Play this line',
          },
          player.isScope('line', lane.id) ? '⏹' : '▶'
        );

      // The part's identity and its editor in one 1.5rem-square control. Everything
      // the gutter used to carry inline — name, drum, set, volume, mute, solo —
      // lives in the sheet, because the gutter repeats on every lane of every
      // system and that chrome crowded the music off a phone screen. Mute lives on
      // the part (arrangement state, saved) and solo on the player (session only),
      // so both only show here as badge tints.
      const partBadge = (part, lane, isSel) => {
        const muted = part?.muted;
        const soloed = part && player.soloPartId === part.id;
        const tint = muted
          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 line-through'
          : soloed
            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
            : isSel
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300';
        const detail = part
          ? [part.name || null, part.taiko, muted ? 'muted' : null, soloed ? 'solo' : null]
              .filter(Boolean)
              .join(' · ')
          : 'Jiuchi';
        return m(
          'button',
          {
            class: `w-6 h-6 shrink-0 flex items-center justify-center rounded text-[10px] font-bold leading-none ${tint} ${part ? '' : 'pointer-events-none'}`,
            title: part ? `${detail} — tap to edit this part` : detail,
            onclick: (e) => {
              e.stopPropagation();
              if (!part) return;
              piece.selectLine(lane.id);
              openPartSheet(part.id);
            },
          },
          partBadgeLabel(part)
        );
      };

      const onRowClick = () => {
        if (piece.lineSelectMode) piece.toggleLineSelection(system.id);
        else piece.selectLine(lanes[0].id);
      };

      if (!ensemble) {
        const lane = lanes[0];
        const selected = piece.selectedLineId === lane.id;
        return m('div', { class: 'line-block' }, [
          m(
            'div',
            {
              class: `flex items-start gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer ${border} ${bg}`,
              style: decoration ?? { paddingLeft: fallbackPaddingLeft },
              onclick: onRowClick,
            },
            [
              handle(),
              m(Lane, { lane, singleRepeat }),
              m('div', { class: 'flex flex-col items-end gap-1 shrink-0 pt-1' }, [
                isJiuchi
                  ? m(
                      'span',
                      {
                        class:
                          'text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 select-none',
                      },
                      'Jiuchi'
                    )
                  : null,
                m(
                  'span',
                  {
                    class:
                      'w-8 text-center whitespace-nowrap text-xs text-gray-400 dark:text-gray-500',
                  },
                  `${laneBeatLabel(lane)}b`
                ),
                selected ? playButton(lane) : null,
                // Extra top margin when the play button is shown keeps Remove well
                // clear of Play so a mistap can't delete the line.
                removeButton(selected ? 'mt-3' : ''),
              ]),
            ]
          ),
          showActions ? m(AddRowActions) : null,
        ]);
      }

      // ── Ensemble: one lane per part, stacked over a shared beat grid ──────────
      // `.lines-container` is the single horizontal scroller for the whole score,
      // so every system shares one scrollLeft and the beat columns stay aligned
      // down the page for free. The gutter cells are sticky, which keeps the part
      // badges on screen however far right the music is scrolled; they are kept
      // narrow (handle + badge ≈ 3.5rem all told) because every lane of every
      // system pays for them out of the width the music has on a phone.
      return m('div', { class: 'line-block min-w-max' }, [
        m(
          'div',
          {
            class: `flex items-start gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer ${border} ${bg}`,
            style: decoration ?? { paddingLeft: fallbackPaddingLeft },
            onclick: onRowClick,
          },
          [
            m(
              'div',
              // `self-stretch` on both gutter columns, and no gap between the lane
              // rows: a sticky cell only as tall as its own content leaves strips
              // the scrolled tiles show through, so the two columns have to tile
              // the row's full height between them.
              { class: `sticky left-0 z-20 shrink-0 self-stretch ${gutterBase}` },
              m('div', { class: `h-full flex flex-col ${gutterTint}` }, [
                handle('w-6'),
                isJiuchi
                  ? m(
                      'span',
                      {
                        class:
                          'text-[9px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400 select-none text-center',
                      },
                      'Ji'
                    )
                  : null,
                removeButton('mt-1'),
              ])
            ),
            m(
              'div',
              { class: 'flex flex-col min-w-max' },
              lanes.map((lane, laneIdx) => {
                const part = piece.partById(lane.partId);
                const run = setRun(laneIdx);
                const isSel = piece.selectedLineId === lane.id;
                return m(
                  'div',
                  {
                    key: lane.id,
                    class: 'lane-row flex items-start gap-2 min-w-max',
                    onclick: (e) => {
                      if (piece.lineSelectMode) return;
                      e.stopPropagation();
                      piece.selectLine(lane.id);
                    },
                  },
                  [
                    m(
                      'div',
                      {
                        // 1.75rem of gutter: the badge, the lane's beat count, and
                        // the play button on the selected lane, stacked so the
                        // column's width never grows. The set bracket is a border,
                        // so linking a player's drums costs no width either; the
                        // player's name lives in the part sheet with the rest.
                        // `left-8` clears the 1.5rem handle column plus the row's
                        // 0.5rem gap, so the two sticky columns sit side by side.
                        // The right-hand edge of the sticky gutter, so it carries the
                        // shadow that makes a tile sliding under it read as intended
                        // rather than as a clipping bug.
                        class: `part-label sticky left-8 z-10 shrink-0 self-stretch w-7 ${gutterBase} shadow-[3px_0_5px_-2px_rgba(0,0,0,0.2)] ${
                          run
                            ? `border-l-2 border-l-purple-400 dark:border-l-purple-500 ${run.first ? 'rounded-tl' : ''} ${run.last ? 'rounded-bl' : ''}`
                            : 'border-l-2 border-l-transparent'
                        }`,
                      },
                      m('div', { class: `h-full flex flex-col items-center ${gutterTint}` }, [
                        m('div', { class: 'pt-1' }, partBadge(part, lane, isSel)),
                        m(
                          'span',
                          { class: 'text-[9px] leading-tight text-gray-400 dark:text-gray-500' },
                          `${laneBeatLabel(lane)}b`
                        ),
                        isSel ? playButton(lane, 'w-6 h-6') : null,
                      ])
                    ),
                    m(Lane, {
                      lane,
                      aligned: true,
                      // The inline repeat badge belongs to the row, so it rides the
                      // first lane rather than repeating on every part.
                      singleRepeat: laneIdx === 0 ? singleRepeat : null,
                    }),
                  ]
                );
              })
            ),
          ]
        ),
        showActions ? m(AddRowActions) : null,
      ]);
    },
  };
}
