import m from 'mithril';
import { piece, lanesOf } from '../data/piece.js';
import { taikoGroupsForTime } from '../data/symbolSets.js';
import { AddRowActions } from './AddRowActions.jsx';
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
 * The per-part drum picker in the ensemble gutter. A native `select`, so a tap
 * gets the platform picker rather than a menu that would not fit the narrow
 * part label; choices are constrained to the score's straight/swing time
 * (`taikoGroupsForTime`), the same ones `PartsSection` offers. Part 0's drum
 * mirrors to `piece.taiko`, so changing it moves the score's symbol set.
 * @param {{ id: string, taiko: string }} part
 * @param {boolean} isSel - This part's lane is the selected one.
 */
function taikoSelect(part, isSel) {
  return m(
    'select',
    {
      class: `w-full min-w-0 bg-transparent text-[10px] rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-400 cursor-pointer ${
        isSel
          ? 'text-indigo-600 dark:text-indigo-300 font-bold'
          : 'text-gray-500 dark:text-gray-400'
      }`,
      value: part.taiko,
      title: 'Drum for this part',
      // The lane row selects the lane on click; a tap on the picker must not.
      onclick: (e) => e.stopPropagation(),
      onchange: (e) => piece.setPartTaiko(part.id, e.target.value),
    },
    taikoGroupsForTime(piece.time).map((group) =>
      m(
        'optgroup',
        { key: group.label, label: group.label },
        group.taikos.map((t) => m('option', { key: t.name, value: t.name }, t.name))
      )
    )
  );
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
      // The sticky gutter needs something opaque behind it; an untinted row has no
      // background of its own, so fall back to the page colour.
      const gutterBg = bg || 'bg-white dark:bg-gray-900';
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

      const playButton = (lane) =>
        m(
          'button',
          {
            class: `w-8 h-8 flex items-center justify-center rounded text-sm leading-none ${player.isScope('line', lane.id) ? 'text-green-600 dark:text-green-400' : 'text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'}`,
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

      // Mute lives on the part (it is part of the arrangement and is saved); solo
      // is session-only state on the player. Both apply from the next play.
      const miniButton = (label, on, onclick, title) =>
        m(
          'button',
          {
            class: `w-4 h-4 shrink-0 flex items-center justify-center rounded text-[8px] font-bold leading-none ${
              on
                ? label === 'M'
                  ? 'bg-amber-500 text-white'
                  : 'bg-green-600 text-white'
                : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`,
            onclick: (e) => {
              e.stopPropagation();
              onclick();
            },
            title,
          },
          label
        );

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
      // labels and controls on screen however far right the music is scrolled.
      return m('div', { class: 'line-block min-w-max' }, [
        m(
          'div',
          {
            class: `flex items-start gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer ${border} ${bg}`,
            style: decoration ?? { paddingLeft: fallbackPaddingLeft },
            onclick: onRowClick,
          },
          [
            m('div', { class: `sticky left-0 z-20 shrink-0 flex flex-col ${gutterBg}` }, [
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
            ]),
            m(
              'div',
              { class: 'flex flex-col gap-1 min-w-max' },
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
                        class: `part-label sticky left-6 z-10 shrink-0 w-20 sm:w-32 pl-1 pr-1 flex items-start gap-1 ${gutterBg} ${
                          run
                            ? `border-l-2 border-l-purple-400 dark:border-l-purple-500 ${run.first ? 'rounded-tl' : ''} ${run.last ? 'rounded-bl' : ''}`
                            : 'border-l-2 border-l-transparent'
                        }`,
                        title: part ? `${part.name || part.taiko} — ${part.taiko}` : 'Jiuchi',
                      },
                      [
                        m('div', { class: 'min-w-0 flex-1 pt-1' }, [
                          // A named part shows its name here and its drum in the
                          // picker below; an unnamed one is identified by the
                          // picker alone, so the name line is dropped.
                          !part || part.name
                            ? m(
                                'div',
                                {
                                  class: `text-xs truncate ${isSel ? 'text-indigo-600 dark:text-indigo-300 font-bold' : 'text-gray-600 dark:text-gray-300 font-semibold'}`,
                                },
                                part ? part.name : 'Jiuchi'
                              )
                            : null,
                          part ? taikoSelect(part, isSel) : null,
                          // The set name goes on the first lane of a player's run,
                          // beside the bracket that links their drums.
                          run?.first && run.set.name
                            ? m(
                                'div',
                                {
                                  class:
                                    'text-[10px] truncate text-purple-600 dark:text-purple-300',
                                },
                                run.set.name
                              )
                            : null,
                          m('div', { class: 'flex items-center gap-1' }, [
                            m(
                              'span',
                              { class: 'text-[10px] text-gray-400 dark:text-gray-500' },
                              `${laneBeatLabel(lane)}b`
                            ),
                            part
                              ? [
                                  miniButton(
                                    'M',
                                    part.muted,
                                    () => piece.togglePartMute(part.id),
                                    part.muted ? 'Unmute this part' : 'Mute this part'
                                  ),
                                  miniButton(
                                    'S',
                                    player.soloPartId === part.id,
                                    () => player.togglePartSolo(part.id),
                                    player.soloPartId === part.id
                                      ? 'Unsolo'
                                      : 'Solo this part (this session only)'
                                  ),
                                ]
                              : null,
                          ]),
                        ]),
                        isSel ? playButton(lane) : null,
                      ]
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
