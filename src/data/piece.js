import m from 'mithril';

let _nextId = 1;
const uid = () => String(_nextId++);

function makeSound(symbol) {
  return { id: uid(), name: symbol.name, hand: symbol.hand, duration: symbol.duration, instruction: '' };
}

function makeLine() {
  return { id: uid(), sounds: [] };
}

export const piece = {
  title: 'Untitled',
  jiuchi: 'gobu-gobu',
  beatsPerLine: 4,
  lines: [makeLine()],

  setTitle(v) { piece.title = v; m.redraw(); },
  setJiuchi(v) { piece.jiuchi = v; m.redraw(); },
  setBeatsPerLine(v) { piece.beatsPerLine = Number(v); m.redraw(); },

  addLine() { piece.lines.push(makeLine()); m.redraw(); },
  removeLine(lineId) {
    piece.lines = piece.lines.filter(l => l.id !== lineId);
    if (piece.lines.length === 0) piece.lines.push(makeLine());
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
