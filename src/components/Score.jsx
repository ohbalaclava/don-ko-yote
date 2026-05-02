import m from 'mithril';
import { piece } from '../data/piece.js';
import { Line } from './Line.jsx';

export function Score() {
  return {
    view() {
      return (
        <div class="flex-1 overflow-y-auto">
          {piece.lines.map((line, i) => (
            <Line key={line.id} line={line} index={i} />
          ))}
          <div class="px-3 py-2">
            <button
              class="text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
              onclick={() => piece.addLine()}
            >+ Add line</button>
          </div>
        </div>
      );
    }
  };
}
