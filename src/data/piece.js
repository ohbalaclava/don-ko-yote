import m from 'mithril';

let _nextId = 1;
const uid = () => String(_nextId++);

function makeSound(symbol) {
  return { id: uid(), name: symbol.name, hand: symbol.hand, duration: symbol.duration, instruction: '' };
}

function makeLine() {
  return { id: uid(), sounds: [] };
}

const _firstLine = makeLine();

export const piece = {
  title: 'Untitled',
  jiuchi: 'gobu-gobu',
  beatsPerLine: 4,
  lines: [_firstLine],
  selectedLineId: _firstLine.id,

  setTitle(v) { piece.title = v; m.redraw(); },
  setJiuchi(v) { piece.jiuchi = v; m.redraw(); },
  setBeatsPerLine(v) { piece.beatsPerLine = Number(v); m.redraw(); },
  selectLine(id) { piece.selectedLineId = id; m.redraw(); },

  addLine() {
    const line = makeLine();
    piece.lines.push(line);
    piece.selectedLineId = line.id;
    m.redraw();
  },
  removeLine(lineId) {
    const idx = piece.lines.findIndex(l => l.id === lineId);
    piece.lines = piece.lines.filter(l => l.id !== lineId);
    if (piece.lines.length === 0) {
      const line = makeLine();
      piece.lines.push(line);
      piece.selectedLineId = line.id;
    } else if (piece.selectedLineId === lineId) {
      piece.selectedLineId = piece.lines[Math.min(idx, piece.lines.length - 1)].id;
    }
    m.redraw();
  },

  addSound(lineId, symbol, atIndex) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const s = makeSound(symbol);
    if (atIndex == null) line.sounds.push(s);
    else line.sounds.splice(atIndex, 0, s);
    m.redraw();
  },

  moveSound(fromLineId, soundId, toLineId, toIndex) {
    const fromLine = piece.lines.find(l => l.id === fromLineId);
    const toLine = piece.lines.find(l => l.id === toLineId);
    if (!fromLine || !toLine) return;
    const idx = fromLine.sounds.findIndex(s => s.id === soundId);
    if (idx === -1) return;
    const [sound] = fromLine.sounds.splice(idx, 1);
    toLine.sounds.splice(toIndex, 0, sound);
    m.redraw();
  },

  removeSound(lineId, soundId) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    line.sounds = line.sounds.filter(s => s.id !== soundId);
    m.redraw();
  },

  updateSound(lineId, soundId, patch) {
    const line = piece.lines.find(l => l.id === lineId);
    if (!line) return;
    const s = line.sounds.find(s => s.id === soundId);
    if (!s) return;
    Object.assign(s, patch);
    m.redraw();
  },
};
