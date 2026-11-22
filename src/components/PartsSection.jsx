import m from 'mithril';
import { piece } from '../data/piece.js';
import { familyForSounds, taikoGroupsForTime } from '../data/symbolSets.js';
import { player } from '../audio/player.js';
import { showToast } from './Toast.jsx';

/** Sentinel value for the "new player" option of a part's set dropdown. */
const NEW_SET = '__new__';

const BTN =
  'w-7 h-7 shrink-0 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:pointer-events-none';

/**
 * Puts a part in a set, creating one when the user picks "New player". A set
 * only survives while a part references it, so both happen in one gesture.
 *
 * Linking announces any two-hand clashes it creates, because the gesture changes
 * no notes: the same strikes are simply read as one player's two hands from now
 * on, so the clash marks `SoundTile` draws otherwise appear out of nowhere — and
 * the tile's explanatory `title` never reaches a touch screen.
 * @param {object} part
 * @param {string} value - A set id, `NEW_SET`, or '' for no set.
 */
function chooseSet(part, value) {
  const before = piece.setConflictIds.size;
  if (value === NEW_SET) {
    const set = piece.addSet(`Player ${piece.sets.length + 1}`);
    piece.assignPartToSet(part.id, set.id);
  } else {
    piece.assignPartToSet(part.id, value || null);
  }
  const added = piece.setConflictIds.size - before;
  if (added > 0) {
    showToast(`${added} clash${added === 1 ? '' : 'es'} — one player, two hands`);
  }
}

/**
 * Removes a part, reversible from a toast rather than guarded by a blocking
 * confirm (the pattern already used for clearing a score and deleting a saved
 * one). The button sits a thumb's width from the name field, so a mis-tap while
 * naming a part is easy and takes that part's music with it — and nothing on
 * screen said where it had gone or that undo would bring it back.
 * @param {object} part
 */
function removePart(part) {
  const label = part.name || part.taiko;
  piece.removePart(part.id);
  showToast(`Removed ${label}`, { actionLabel: 'Undo', onAction: () => piece.undo() });
}

/**
 * One part: name, drum, set, volume, mute, reorder and remove. Exported because
 * `PartSheet` renders the same editor for a single part, so the controls the
 * ensemble gutter no longer carries have exactly one implementation.
 * @param {object} part - A `piece.parts` entry.
 * @param {number} idx - Its index in `piece.parts`.
 */
export function partRow(part, idx) {
  const last = idx === piece.parts.length - 1;
  // Once the part has sounds its syllables are family-specific (ten/ken for high
  // drums vs don/kon for low) with no mapping between families, so only that
  // family's taikos stay offered — the same rule a jiuchi section follows. The
  // family comes from the authored names, not the current taiko, so a part
  // stranded on the wrong family still offers the way back; an empty part (or one
  // holding only rests and kakegoe) picks freely.
  const family = familyForSounds(piece.partSoundNames(part.id));
  const taikoGroups = taikoGroupsForTime(piece.time).filter(
    (g) => !family || g.label.toLowerCase() === family
  );
  return m('div', { key: part.id, class: 'py-3 border-b border-gray-200 dark:border-gray-700' }, [
    m('div', { class: 'flex items-center gap-2' }, [
      m('span', { class: 'w-4 text-xs text-gray-400 dark:text-gray-500 tabular-nums' }, idx + 1),
      m('input', {
        type: 'text',
        class:
          'flex-1 min-w-0 bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 border border-gray-300 dark:border-gray-600',
        value: part.name,
        placeholder: part.taiko,
        oninput: (e) => piece.setPartName(part.id, e.target.value),
      }),
      m(
        'button',
        {
          class: BTN,
          disabled: idx === 0,
          onclick: () => piece.reorderPart(idx, idx - 1),
          title: 'Move up',
        },
        '▲'
      ),
      m(
        'button',
        {
          class: BTN,
          disabled: last,
          onclick: () => piece.reorderPart(idx, idx + 1),
          title: 'Move down',
        },
        '▼'
      ),
      m(
        'button',
        {
          class: `${BTN} ${part.muted ? 'bg-amber-500 border-amber-500 text-white' : ''}`,
          onclick: () => piece.togglePartMute(part.id),
          title: part.muted ? 'Unmute' : 'Mute',
        },
        'M'
      ),
      m(
        'button',
        {
          class: `${BTN} ${player.soloPartId === part.id ? 'bg-green-600 border-green-600 text-white' : ''}`,
          onclick: () => player.togglePartSolo(part.id),
          title: player.soloPartId === part.id ? 'Unsolo' : 'Solo (this session only)',
        },
        'S'
      ),
      m(
        'button',
        {
          // `ml-1.5` buys the one destructive control in the row some air, so a
          // thumb aiming at Solo does not land on Remove.
          class:
            'w-7 h-7 ml-1.5 shrink-0 flex items-center justify-center rounded text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:pointer-events-none',
          disabled: piece.parts.length < 2,
          onclick: () => removePart(part),
          title: piece.parts.length < 2 ? 'A score needs one part' : 'Remove part',
        },
        '✕'
      ),
    ]),

    m('div', { class: 'flex flex-wrap items-center gap-1 mt-2 pl-6' }, [
      ...taikoGroups.flatMap((group) =>
        group.taikos.map((t) =>
          m(
            'button',
            {
              // Deliberately unkeyed: the hint below shares this fragment, and
              // Mithril forbids mixing keyed and unkeyed siblings. The list is
              // positional and never reordered, so keys bought nothing.
              class: `rounded border px-1.5 py-0.5 text-xs font-medium ${
                part.taiko === t.name
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`,
              onclick: () => piece.setPartTaiko(part.id, t.name),
            },
            t.name
          )
        )
      ),
      // Without this the other family's drums have simply vanished, which reads
      // as a bug rather than as a consequence of what the part already plays.
      family
        ? m(
            'span',
            { class: 'text-[10px] text-gray-400 dark:text-gray-500' },
            `${family === 'high' ? 'High' : 'Low'} drums only — this part's sounds`
          )
        : null,
    ]),

    m('div', { class: 'flex items-center gap-2 mt-2 pl-6' }, [
      m(
        'select',
        {
          class:
            'shrink-0 bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-1.5 py-1 text-xs border border-gray-300 dark:border-gray-600',
          value: part.setId ?? '',
          onchange: (e) => chooseSet(part, e.target.value),
          title: 'Taiko set: the drums one person plays',
        },
        [
          m('option', { value: '' }, 'No set'),
          ...piece.sets.map((s) => m('option', { value: s.id }, s.name || 'Unnamed')),
          m('option', { value: NEW_SET }, 'New player'),
        ]
      ),
      m('span', { class: 'text-xs text-gray-400 dark:text-gray-500 shrink-0' }, 'Vol'),
      m('input', {
        type: 'range',
        class: 'flex-1 min-w-0',
        min: '0',
        max: '1',
        step: '0.05',
        value: part.volume,
        // Live while dragging, one history entry when released.
        oninput: (e) => piece.setPartVolumeLive(part.id, e.target.value),
        onchange: (e) => piece.setPartVolume(part.id, e.target.value),
      }),
    ]),
  ]);
}

/**
 * The Parts editor: the ordered list of drums the score is written for, each
 * optionally grouped into a taiko set (one player, several drums). A one-part
 * score is the solo score the app has always written; adding a part switches the
 * editor to the stacked ensemble layout.
 */
export function PartsSection() {
  return {
    view() {
      const usedSets = piece.sets.filter((s) => piece.parts.some((p) => p.setId === s.id));
      return m('div', { class: 'py-4 border-b border-gray-200 dark:border-gray-700' }, [
        m('div', { class: 'flex items-center justify-between' }, [
          m('div', { class: 'font-medium dark:text-white' }, 'Parts'),
          m(
            'button',
            {
              class:
                'py-1 px-2.5 rounded-lg border border-indigo-300 dark:border-indigo-700 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
              onclick: () => piece.addPart(),
            },
            '+ Add part'
          ),
        ]),
        m('div', { class: 'mt-1' }, piece.parts.map(partRow)),
        usedSets.length
          ? m('div', { class: 'pt-3' }, [
              m(
                'div',
                { class: 'text-xs text-gray-500 dark:text-gray-400 mb-1' },
                'Players (taiko sets)'
              ),
              ...usedSets.map((s) =>
                m('input', {
                  type: 'text',
                  class:
                    'w-full mb-1 bg-gray-100 dark:bg-gray-800 dark:text-white rounded px-2 py-1 text-sm border border-gray-300 dark:border-gray-600',
                  value: s.name,
                  placeholder: 'Player name',
                  oninput: (e) => piece.setSetName(s.id, e.target.value),
                })
              ),
            ])
          : null,
      ]);
    },
  };
}
