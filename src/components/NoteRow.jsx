import m from 'mithril';
import { piece } from '../data/piece.js';
import { repeatDecoration } from './repeatDecoration.js';

/** Grows a textarea to fit its content. */
function autoResize(dom) {
  dom.style.height = 'auto';
  dom.style.height = dom.scrollHeight + 'px';
}

export function NoteRow() {
  let editing = false;

  return {
    view({ attrs: { note, repeatDepth = 0 } }) {
      function commit(value) {
        piece.setNoteText(note.id, value);
        editing = false;
        m.redraw();
      }

      const isLineSelected = piece.lineSelectMode && piece.lineSelection.includes(note.id);
      const inRepeat = !isLineSelected && repeatDepth > 0;
      const sideClass = isLineSelected
        ? 'border-l-4 border-l-teal-400 bg-teal-50 dark:bg-teal-900/20'
        : inRepeat
          ? 'bg-orange-50 dark:bg-orange-900/20'
          : 'border-l-4 border-l-transparent';
      const decoration = inRepeat ? repeatDecoration(repeatDepth) : null;

      return (
        <div
          class={`flex items-start gap-2 py-2 pr-3 border-b border-gray-200 dark:border-gray-700 group ${sideClass}`}
          style={decoration ?? { paddingLeft: '12px' }}
        >
          <div
            class="line-drag-handle shrink-0 cursor-grab select-none text-gray-300 dark:text-gray-600 text-sm leading-none mt-0.5"
            title="Drag to reorder"
          >
            ⠿
          </div>
          {editing ? (
            <textarea
              class="flex-1 text-sm bg-transparent border-b border-indigo-400 outline-none text-gray-700 dark:text-gray-200 min-w-0 resize-none overflow-hidden leading-snug"
              value={note.text}
              placeholder="Notes…"
              rows="1"
              oncreate={({ dom }) => {
                dom.focus();
                autoResize(dom);
              }}
              oninput={(e) => {
                note.text = e.target.value;
                autoResize(e.target);
              }}
              onblur={(e) => commit(e.target.value)}
              onkeydown={(e) => {
                if (e.key === 'Escape') {
                  e.target.blur();
                }
                e.stopPropagation();
              }}
              onclick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              class="flex-1 text-sm text-gray-600 dark:text-gray-300 cursor-text min-w-0 whitespace-pre-wrap"
              onclick={(e) => {
                e.stopPropagation();
                if (piece.lineSelectMode) {
                  piece.toggleLineSelection(note.id);
                } else {
                  editing = true;
                  m.redraw();
                }
              }}
              title={piece.lineSelectMode ? 'Click to select' : 'Click to edit'}
            >
              {note.text || (
                <span class="text-gray-300 dark:text-gray-600 italic font-normal">Notes…</span>
              )}
            </span>
          )}
          <button
            class="shrink-0 text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
            onclick={(e) => {
              e.stopPropagation();
              piece.removeNote(note.id);
            }}
            title="Remove note"
          >
            ✕
          </button>
        </div>
      );
    },
  };
}
