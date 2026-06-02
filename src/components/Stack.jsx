import m from 'mithril';
import { piece } from '../data/piece.js';
import { settings } from '../data/settings.js';
import { player } from '../audio/player.js';
import { isIntegerBeat, effectiveVolume } from '../util.js';
import { SoundEditor } from './SoundTile.jsx';
import { taikosForJiuchi } from '../data/symbolSets.js';

const ROW_H_REM = 3.5; // height of one part row within a system
const DIV_REM = 1.5; // fixed width of one division — keeps sub-beat tiles readable
const LABEL_REM = 5; // part-label column width (Tailwind w-20)

/**
 * Returns each sound in a part annotated with its cumulative start division and
 * the part's total length.
 * @param {{ sounds: Array<{ duration: number }> }} part
 */
function withPositions(part) {
  let pos = 0;
  const items = part.sounds.map((s) => {
    const startDiv = pos;
    pos += s.duration;
    return { sound: s, startDiv };
  });
  return { items, length: pos };
}

/**
 * A stack of simultaneous parts, rendered as one or more aligned "systems". Each
 * system spans `beatsPerLine` beats; within it every part is one row on a shared
 * column grid (a fixed division width keeps tiles readable, so beat N lines up
 * across parts). A system scrolls horizontally as one unit when wider than the
 * screen; the part-label column stays pinned. Tiles open the shared SoundEditor;
 * tap-to-add targets the selected part.
 */
export function Stack() {
  return {
    view({ attrs: { stack } }) {
      const time = piece.time;
      const positioned = stack.parts.map((part) => ({ part, ...withPositions(part) }));
      const maxLen = positioned.reduce((m, p) => Math.max(m, p.length), 0);

      // System span in divisions. With beatsPerLine 0 (unlimited) the whole stack
      // is a single system as wide as the longest part (min 1 to avoid /0).
      const systemDivs = piece.beatsPerLine > 0 ? piece.beatsPerLine * time : Math.max(1, maxLen);
      const systemCount = Math.max(1, Math.ceil((maxLen || 1) / systemDivs));
      const innerW = LABEL_REM + systemDivs * DIV_REM;

      // overflow-x:auto forces overflow-y to auto too, which would clip the inline
      // SoundEditor. While editing a tile in this stack, drop the clip so the popup
      // shows (horizontal scroll doesn't matter mid-edit).
      const editing =
        !!piece.editingTile &&
        stack.parts.some((p) => p.sounds.some((s) => s.id === piece.editingTile.soundId));
      const overflowClass = editing ? 'overflow-visible' : 'overflow-x-auto';

      return (
        <div class="flex items-stretch border-b border-gray-200 dark:border-gray-700 bg-purple-50/40 dark:bg-purple-900/10">
          {/* Bracket marking the simultaneous group. */}
          <div class="w-2 shrink-0 my-1 ml-1 rounded-l border-2 border-r-0 border-purple-400 dark:border-purple-500" />

          <div class="flex-1 min-w-0 py-1 pr-2">
            <StackHeader stack={stack} />
            {Array.from({ length: systemCount }, (_, sys) => (
              <div key={sys} class={`${overflowClass} ${sys > 0 ? 'mt-2' : ''}`}>
                <div style={`width:${innerW}rem`}>
                  {positioned.map(({ part, items }) => (
                    <PartRow
                      key={part.id}
                      stack={stack}
                      part={part}
                      items={items}
                      sys={sys}
                      systemDivs={systemDivs}
                      time={time}
                      showControls={sys === 0}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    },
  };
}

/** Top controls for the whole stack: drag handle, play, add part, unstack. */
function StackHeader() {
  return {
    view({ attrs: { stack } }) {
      const playing = player.isScope('block', stack.id);
      return (
        <div class="flex items-center gap-2 mb-1">
          <span
            class="line-drag-handle shrink-0 cursor-grab select-none text-gray-300 dark:text-gray-600 text-sm leading-none"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <span class="text-xs font-semibold uppercase tracking-wide text-purple-500 dark:text-purple-400">
            Stack
          </span>
          <button
            class={`text-sm leading-none ${playing ? 'text-green-600 dark:text-green-400' : 'text-purple-500 dark:text-purple-400 hover:text-purple-700'}`}
            onclick={(e) => {
              e.stopPropagation();
              player.toggleScope(piece, [stack], { type: 'block', id: stack.id });
            }}
            title={playing ? 'Stop' : 'Play stack'}
          >
            {playing ? '⏹' : '▶'}
          </button>
          <div class="ml-auto flex items-center gap-2">
            <button
              class="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
              onclick={() => piece.addPart(stack.id)}
            >
              + Part
            </button>
            <button
              class="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onclick={() => piece.breakStack(stack.id)}
              title="Split into separate lines"
            >
              Unstack
            </button>
          </div>
        </div>
      );
    },
  };
}

/** One part's row within one system: a pinned taiko label column + a positioned sound grid. */
function PartRow() {
  return {
    view({ attrs: { stack, part, items, sys, systemDivs, time, showControls } }) {
      const lo = sys * systemDivs;
      const hi = lo + systemDivs;
      const inSystem = items.filter((it) => it.startDiv >= lo && it.startDiv < hi);
      const selected = piece.selectedLineId === part.id;

      return (
        <div class="flex items-stretch">
          {/* Taiko label / selector column — pinned while the grid scrolls. */}
          <div
            class={`sticky left-0 z-10 shrink-0 flex flex-col justify-center px-1 border-l-2 cursor-pointer bg-gray-50 dark:bg-gray-900 ${selected ? 'border-l-indigo-400' : 'border-l-transparent'}`}
            style={`width:${LABEL_REM}rem`}
            onclick={() => piece.selectLine(part.id)}
            title="Select this part"
          >
            {showControls ? (
              <div class="flex items-center gap-0.5">
                <select
                  class="min-w-0 flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-transparent dark:bg-gray-800 dark:text-gray-300 px-0.5 py-0.5"
                  value={part.taiko}
                  onclick={(e) => e.stopPropagation()}
                  onchange={(e) => piece.setPartTaiko(stack.id, part.id, e.target.value)}
                >
                  {taikosForJiuchi(piece.jiuchi).map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  class="text-xs text-red-400 hover:text-red-600 px-0.5"
                  onclick={(e) => {
                    e.stopPropagation();
                    piece.removePart(stack.id, part.id);
                  }}
                  title="Remove part"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span class="text-xs text-gray-500 dark:text-gray-400 truncate">{part.taiko}</span>
            )}
          </div>

          {/* Positioned sound grid for this system (fixed division width). */}
          <div
            class={`relative shrink-0 ${selected ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}
            style={`width:${systemDivs * DIV_REM}rem; height:${ROW_H_REM}rem`}
          >
            {/* Beat ticks. */}
            {Array.from({ length: Math.floor(systemDivs / time) + 1 }, (_, b) => (
              <span
                key={'tick' + b}
                class="absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 pointer-events-none"
                style={`left:${b * time * DIV_REM}rem`}
              />
            ))}
            {inSystem.map(({ sound, startDiv }) => (
              <StackTile
                key={sound.id}
                sound={sound}
                lineId={part.id}
                startDiv={startDiv}
                time={time}
                leftRem={(startDiv - lo) * DIV_REM}
                widthRem={sound.duration * DIV_REM}
              />
            ))}
          </div>
        </div>
      );
    },
  };
}

/** A single positioned tile inside a stack part. Opens the shared SoundEditor. */
function StackTile() {
  return {
    view({ attrs: { sound, lineId, startDiv, time, leftRem, widthRem } }) {
      const et = piece.editingTile;
      const isEditing = et && et.lineId === lineId && et.soundId === sound.id;
      const isPlaying = player.isCurrent(sound.id);
      const isHB = isIntegerBeat(startDiv, time);
      const border = isPlaying
        ? 'border-green-500 bg-green-100 dark:border-green-400 dark:bg-green-900/40 ring-2 ring-green-400'
        : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800';
      return (
        <div class="absolute top-1 bottom-1" style={`left:${leftRem}rem; width:${widthRem}rem`}>
          {isHB ? (
            <span class="beat-dot absolute -top-0.5 left-0 w-2 h-2 rounded-full bg-gray-900 dark:bg-gray-100" />
          ) : null}
          <div
            class={`sound-tile relative h-full flex flex-col items-center justify-center border rounded shadow-sm cursor-pointer overflow-hidden px-0.5 ${border}`}
            data-sound-id={sound.id}
            onclick={(e) => {
              e.stopPropagation();
              piece.setEditingTile(isEditing ? null : { lineId, soundId: sound.id });
            }}
          >
            <span
              class={`font-bold text-sm leading-tight text-gray-900 dark:text-gray-200 truncate max-w-full font-${settings.font}${sound.emphasis ? ' underline' : ''}${sound.skin === 'back' ? ' italic' : ''}`}
            >
              {sound.name}
            </span>
            <span class="text-[10px] text-gray-400 dark:text-gray-500 font-mono leading-none">
              {sound.hand}
              {piece.showVolume && effectiveVolume(sound) != null
                ? ` ${effectiveVolume(sound)}`
                : ''}
            </span>
            {sound.instruction ? (
              <span class="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-full">
                {sound.instruction}
              </span>
            ) : null}
            {isEditing ? <SoundEditor lineId={lineId} sound={sound} /> : null}
          </div>
        </div>
      );
    },
  };
}
