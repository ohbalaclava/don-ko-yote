import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc = vi.hoisted(() => ({
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setDrawColor: vi.fn(),
  setFillColor: vi.fn(),
  setLineWidth: vi.fn(),
  text: vi.fn(),
  rect: vi.fn(),
  line: vi.fn(),
  circle: vi.fn(),
  addPage: vi.fn(),
  setPage: vi.fn(),
  addImage: vi.fn(),
  getTextWidth: vi.fn(() => 5),
  output: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
  save: vi.fn(),
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return mockDoc;
  }),
}));

const mockPiece = vi.hoisted(() => ({
  title: 'Test Song',
  taiko: 'Shime',
  jiuchi: '七三',
  beatsPerLine: 4,
  time: 4,
  icon: null,
  lines: [],
}));

vi.mock('../src/data/piece.js', () => ({
  piece: mockPiece,
  markerDepth: () => 0,
  lineDepth: () => 0,
  singleLineRepeatMap: (lines) =>
    new Map(
      lines
        .filter((l) => l.type === 'block-repeat' && l.lineIds.length === 1)
        .map((m) => [m.lineIds[0], m])
    ),
  jiuchiLineMap: () => new Map(),
  lanesOf: (row) => row.lanes ?? [{ id: row.id, partId: null, sounds: row.sounds ?? [] }],
}));

const mockSettings = vi.hoisted(() => ({
  defaultBackground: null,
}));

vi.mock('../src/data/settings.js', () => ({
  settings: mockSettings,
}));

import {
  exportPdf,
  splitIntoRows,
  splitSystemIntoChunks,
  setRuns,
  clampLabelX,
} from '../src/pdf.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockPiece.title = 'Test Song';
  mockPiece.taiko = 'Shime';
  mockPiece.jiuchi = '七三';
  mockPiece.beatsPerLine = 4;
  mockPiece.time = 4;
  mockPiece.icon = null;
  mockPiece.lines = [];
  mockSettings.defaultBackground = null;
  mockPiece.parts = undefined;
  mockPiece.sets = undefined;
  mockPiece.partById = undefined;
});

function makeLine(sounds) {
  return { sounds };
}

function makeSound(overrides = {}) {
  return { name: 'Don', hand: 'R', duration: 1, ...overrides };
}

describe('exportPdf', () => {
  describe('filename', () => {
    it('uses the piece title', async () => {
      mockPiece.title = 'My Song';
      await exportPdf();
      expect(mockDoc.save).toHaveBeenCalledWith('My Song.pdf');
    });

    it('falls back to taiko when title is empty', async () => {
      mockPiece.title = '';
      await exportPdf();
      expect(mockDoc.save).toHaveBeenCalledWith('taiko.pdf');
    });
  });

  describe('header', () => {
    it('renders the piece title', async () => {
      mockPiece.title = 'Drum Piece';
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Drum Piece');
    });

    it('renders Untitled when title is empty', async () => {
      mockPiece.title = '';
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Untitled');
    });

    it('renders taiko, jiuchi and BPM as header metadata', async () => {
      mockPiece.bpm = 120;
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Shime');
      expect(texts).toContain('七三');
      expect(texts).toContain('120 BPM');
    });
  });

  describe('sound rendering', () => {
    it('skips lines with no sounds', async () => {
      mockPiece.lines = [makeLine([])];
      await exportPdf();
      expect(mockDoc.circle).not.toHaveBeenCalled();
    });

    it('does not draw tile borders', async () => {
      mockPiece.lines = [makeLine([makeSound(), makeSound({ name: 'Ko', hand: 'L' })])];
      await exportPdf();
      expect(mockDoc.rect).not.toHaveBeenCalled();
    });

    it('renders sound name', async () => {
      mockPiece.lines = [makeLine([makeSound({ name: 'Ka' })])];
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Ka');
    });

    it('renders sound hand', async () => {
      mockPiece.lines = [makeLine([makeSound({ hand: 'L' })])];
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('L');
    });

    it('renders instruction when present', async () => {
      mockPiece.lines = [makeLine([makeSound({ instruction: 'forte' })])];
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('forte');
    });

    it('draws exactly one extra text call when an instruction is present', async () => {
      mockPiece.lines = [makeLine([makeSound()])];
      await exportPdf();
      const withoutInstruction = mockDoc.text.mock.calls.length;

      vi.clearAllMocks();
      mockPiece.lines = [makeLine([makeSound({ instruction: 'forte' })])];
      await exportPdf();
      const withInstruction = mockDoc.text.mock.calls.length;

      expect(withInstruction).toBe(withoutInstruction + 1);
    });
  });

  describe('line numbers', () => {
    it('renders 1-based line index with period', async () => {
      mockPiece.lines = [makeLine([makeSound()]), makeLine([makeSound()])];
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('1.');
      expect(texts).toContain('2.');
    });
  });

  describe('pagination', () => {
    it('does not add a page for few lines', async () => {
      mockPiece.lines = [makeLine([makeSound()])];
      await exportPdf();
      expect(mockDoc.addPage).not.toHaveBeenCalled();
    });

    it('adds a page when content exceeds the page height', async () => {
      // header ends at y=29; each line takes ROW_H(16) + LINE_GAP(5) = 21mm;
      // 12 lines reach y=281; line 13 triggers a page break (threshold: 297−14=283)
      mockPiece.lines = Array.from({ length: 15 }, () => makeLine([makeSound()]));
      await exportPdf();
      expect(mockDoc.addPage).toHaveBeenCalled();
    });

    it('adds exactly one page break for 15 lines', async () => {
      mockPiece.lines = Array.from({ length: 15 }, () => makeLine([makeSound()]));
      await exportPdf();
      expect(mockDoc.addPage).toHaveBeenCalledTimes(1);
    });
  });
});

describe('splitIntoRows', () => {
  // time=4 -> 1 beat = 4 divisions; BEATS_PER_ROW=8 -> 32 divisions per row.
  const beat = (n = 1) => ({ duration: 4 * n });

  it('returns [] for no sounds', () => {
    expect(splitIntoRows([], 4)).toEqual([]);
  });

  it('keeps a line of exactly 8 beats in one row', () => {
    const rows = splitIntoRows(
      Array.from({ length: 8 }, () => beat()),
      4
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(8);
  });

  it('wraps to a new row once the 8-beat limit is exceeded', () => {
    const rows = splitIntoRows(
      Array.from({ length: 9 }, () => beat()),
      4
    );
    expect(rows.map((r) => r.length)).toEqual([8, 1]);
  });

  it('counts a gap towards the row, so a gapped line still wraps at 8 beats', () => {
    // 1 beat, then 6 beats of blank before a beat that lands on beat 8; the next
    // beat has to wrap.
    const rows = splitIntoRows([beat(), { duration: 4, gap: 24 }, beat()], 4);
    expect(rows.map((r) => r.length)).toEqual([2, 1]);
  });

  it('never splits a single oversized sound across rows', () => {
    const rows = splitIntoRows([beat(10)], 4); // 10 beats > 8
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
  });
});

// ── Ensemble layout ───────────────────────────────────────────────────────────

// Geometry the ensemble path lays out against (mm): the label zone is 24 wide,
// leaving 148 for 8 beats.
const PART_TILES_X = 38;
const PART_BEAT_W = 18.5;
const BRACKET_X = 18.5;
const DOT_ZONE = 3;
const ROW_H = 16;
// A cell is tinted 0.3 mm inside each edge, the label box is 0.8 mm inside that,
// and the mocked `getTextWidth` is 5 mm: a label clamped to a cell's left edge is
// centred 3.6 mm into the cell.
const CLAMPED_LABEL_X = 0.3 + 0.8 + 5 / 2;

/** `[text, x, y]` for every drawn string, in draw order. */
function textCalls() {
  return mockDoc.text.mock.calls.map(([text, x, y]) => ({ text, x, y }));
}

/** The y a sound's name was drawn at. */
function soundY(name) {
  return textCalls().find((c) => c.text === name)?.y;
}

/** The x a sound's name was drawn at. */
function soundX(name) {
  return textCalls().find((c) => c.text === name)?.x;
}

function part(id, overrides = {}) {
  return { id, name: id, taiko: 'Nagado', setId: null, volume: 1, muted: false, ...overrides };
}

/** A system whose lanes carry the given sound arrays, one per part. */
function makeSystem(id, soundsPerLane) {
  return {
    id,
    lanes: soundsPerLane.map((sounds, i) => ({ id: `${id}-l${i}`, partId: `p${i}`, sounds })),
  };
}

describe('exportPdf — ensemble', () => {
  beforeEach(() => {
    mockPiece.parts = [part('p0'), part('p1', { taiko: 'Shime' })];
    mockPiece.sets = [];
    mockPiece.partById = (id) => mockPiece.parts.find((p) => p.id === id) ?? null;
  });

  describe('header', () => {
    it('lists every part in place of the single drum', async () => {
      await exportPdf();
      const texts = textCalls().map((c) => c.text);
      expect(texts).toContain('p0 — Nagado');
      expect(texts).toContain('p1 — Shime');
      expect(texts).not.toContain('Shime'); // the solo single-drum line is gone
    });
  });

  describe('stacking', () => {
    it('draws one sub-row per lane, ROW_H apart', async () => {
      mockPiece.lines = [
        makeSystem('s1', [[makeSound({ name: 'Don' })], [makeSound({ name: 'Ten' })]]),
      ];
      await exportPdf();
      expect(soundY('Ten') - soundY('Don')).toBe(ROW_H);
    });

    it('puts beat 0 of every part in the same column', async () => {
      mockPiece.lines = [
        makeSystem('s1', [[makeSound({ name: 'Don' })], [makeSound({ name: 'Ten' })]]),
      ];
      await exportPdf();
      expect(soundX('Don')).toBe(soundX('Ten'));
      expect(soundX('Don')).toBeCloseTo(PART_TILES_X + PART_BEAT_W / 8, 10);
    });

    it('aligns a later beat across parts even when the lanes differ', async () => {
      // Part 0 plays four quarter-beats, part 1 one whole beat; both parts' next
      // sound starts on beat 1.
      const quarter = (name) => makeSound({ name, duration: 1 });
      mockPiece.lines = [
        makeSystem('s1', [
          [
            quarter('a'),
            quarter('b'),
            quarter('c'),
            quarter('d'),
            makeSound({ name: 'Ka', duration: 4 }),
          ],
          [makeSound({ name: 'Doko', duration: 4 }), makeSound({ name: 'Su', duration: 4 })],
        ]),
      ];
      await exportPdf();
      expect(soundX('Ka')).toBe(soundX('Su'));
      // A whole-beat tile: the onset centre would hang the name off its left edge,
      // so the label sits clamped just inside it (both parts alike).
      expect(soundX('Ka')).toBeCloseTo(PART_TILES_X + PART_BEAT_W + CLAMPED_LABEL_X, 10);
    });

    it('wraps every lane at the same beat boundary', async () => {
      // Nine beats: beat 9 wraps to a second row, in both parts, back at the left.
      const beats = (prefix) =>
        Array.from({ length: 9 }, (_, i) => makeSound({ name: `${prefix}${i}`, duration: 4 }));
      mockPiece.lines = [makeSystem('s1', [beats('a'), beats('b')])];
      await exportPdf();
      expect(soundX('a8')).toBeCloseTo(PART_TILES_X + CLAMPED_LABEL_X, 10);
      expect(soundX('b8')).toBe(soundX('a8'));
      // The wrapped row sits below the first row's two lanes.
      expect(soundY('a8')).toBeGreaterThan(soundY('b0'));
    });
  });

  describe('beat ruler', () => {
    /** Beat dots (the only circles drawn), grouped by sub-row y. */
    function dotRows() {
      const rows = new Map();
      for (const [x, cy, r, style] of mockDoc.circle.mock.calls) {
        if (!rows.has(cy)) rows.set(cy, []);
        rows.get(cy).push({ x, filled: style === 'F', r });
      }
      return [...rows.values()];
    }

    it('rules a lane that is blank under the other part’s notes', async () => {
      // One player's set: part 0 plays beat 1, part 1 beat 2. Part 1's first beat
      // is blank, and must still show its beats.
      mockPiece.lines = [
        makeSystem('s1', [
          [makeSound({ name: 'Don', duration: 4 })],
          [{ ...makeSound({ name: 'Ten', duration: 4 }), gap: 4 }],
        ]),
      ];
      await exportPdf();
      const rows = dotRows();
      expect(rows).toHaveLength(2);
      for (const dots of rows) {
        expect(dots).toHaveLength(8); // both beats, on both sub-rows
        expect(dots.filter((d) => d.filled)).toHaveLength(2);
        expect(dots[0].x).toBeCloseTo(PART_TILES_X + PART_BEAT_W / 8, 10);
        expect(dots[0].filled).toBe(true);
      }
    });

    it('never rules past the music', async () => {
      mockPiece.lines = [
        makeSystem('s1', [
          [makeSound({ name: 'Don', duration: 4 })],
          [makeSound({ name: 'Ten', duration: 4 })],
        ]),
      ];
      await exportPdf();
      for (const dots of dotRows()) expect(dots).toHaveLength(4);
    });
  });

  describe('part labels', () => {
    it('names each part beside its sub-row', async () => {
      mockPiece.lines = [
        makeSystem('s1', [[makeSound({ name: 'Don' })], [makeSound({ name: 'Ten' })]]),
      ];
      await exportPdf();
      const labels = textCalls().filter((c) => c.text === 'p0' || c.text === 'p1');
      expect(labels).toHaveLength(2);
      expect(labels.every((l) => l.x === 20)).toBe(true);
    });

    it('labels a part-less jiuchi lane as Jiuchi', async () => {
      mockPiece.lines = [{ id: 's1', lanes: [{ id: 'l0', partId: null, sounds: [makeSound()] }] }];
      await exportPdf();
      expect(textCalls().map((c) => c.text)).toContain('Jiuchi');
    });
  });

  describe('taiko sets', () => {
    it('brackets the drums of one player and names them', async () => {
      mockPiece.sets = [{ id: 'set1', name: 'Player 1' }];
      mockPiece.parts = [
        part('p0', { setId: 'set1' }),
        part('p1', { taiko: 'Shime', setId: 'set1' }),
      ];
      mockPiece.lines = [
        makeSystem('s1', [[makeSound({ name: 'Don' })], [makeSound({ name: 'Ten' })]]),
      ];
      await exportPdf();

      const bracket = mockDoc.line.mock.calls.find(
        ([x1, , x2]) => x1 === BRACKET_X && x2 === BRACKET_X
      );
      expect(bracket).toBeDefined();
      const [, y1, , y2] = bracket;
      // Spans both sub-rows.
      expect(y2 - y1).toBeCloseTo(ROW_H + 13, 10);
      expect(textCalls().map((c) => c.text)).toContain('Player 1');
    });

    it('draws no bracket when no part is in a set', async () => {
      mockPiece.lines = [
        makeSystem('s1', [[makeSound({ name: 'Don' })], [makeSound({ name: 'Ten' })]]),
      ];
      await exportPdf();
      expect(
        mockDoc.line.mock.calls.filter(([x1, , x2]) => x1 === BRACKET_X && x2 === BRACKET_X)
      ).toHaveLength(0);
    });
  });

  describe('pagination', () => {
    it('never splits a system across a page break', async () => {
      mockPiece.parts = [part('p0'), part('p1'), part('p2')];
      mockPiece.partById = (id) => mockPiece.parts.find((p) => p.id === id) ?? null;
      // Each system is 3 × ROW_H + LINE_GAP = 53 mm, so systems straddle the
      // 283 mm page limit unless the whole system is kept together.
      mockPiece.lines = Array.from({ length: 8 }, (_, s) => ({
        id: `s${s}`,
        lanes: [0, 1, 2].map((i) => ({
          id: `s${s}-l${i}`,
          partId: `p${i}`,
          sounds: [makeSound({ name: `n${s}_${i}` })],
        })),
      }));
      await exportPdf();
      expect(mockDoc.addPage).toHaveBeenCalled();

      for (let s = 0; s < 8; s++) {
        const ys = [0, 1, 2].map((i) => soundY(`n${s}_${i}`));
        // A page break mid-system would reset y to the top margin, breaking the
        // run of ROW_H steps down the page.
        expect(ys[1] - ys[0]).toBe(ROW_H);
        expect(ys[2] - ys[1]).toBe(ROW_H);
        expect(ys[2] + DOT_ZONE).toBeLessThanOrEqual(297 - 14);
      }
    });
  });
});

describe('splitSystemIntoChunks', () => {
  const s = (duration) => ({ duration });

  it('returns one chunk for a system inside the row limit', () => {
    const chunks = splitSystemIntoChunks([{ sounds: [s(4), s(4)] }], 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][0].map((c) => c.startDiv)).toEqual([0, 4]);
  });

  it('splits every lane at the same absolute beat boundary', () => {
    const nine = Array.from({ length: 9 }, () => s(4));
    const chunks = splitSystemIntoChunks([{ sounds: nine }, { sounds: nine }], 4);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].map((lane) => lane.length)).toEqual([8, 8]);
    expect(chunks[1].map((lane) => lane.length)).toEqual([1, 1]);
    expect(chunks[1][0][0].startDiv).toBe(32);
  });

  it('keeps a lane that is shorter than the others in the first chunk', () => {
    const nine = Array.from({ length: 9 }, () => s(4));
    const chunks = splitSystemIntoChunks([{ sounds: nine }, { sounds: [s(4)] }], 4);
    expect(chunks[1][1]).toEqual([]);
  });

  it('keeps a sound whose start is in the chunk even when it overruns', () => {
    const chunks = splitSystemIntoChunks([{ sounds: [s(28), s(8)] }], 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][0]).toHaveLength(2);
  });

  it('places a sound after a gap at its gapped start division', () => {
    const chunks = splitSystemIntoChunks([{ sounds: [s(4), { duration: 4, gap: 4 }] }], 4);
    expect(chunks[0][0].map((c) => c.startDiv)).toEqual([0, 8]);
  });

  it('puts a sound whose gap pushes it over the row limit in the next chunk', () => {
    const chunks = splitSystemIntoChunks([{ sounds: [s(4), { duration: 4, gap: 28 }] }], 4);
    expect(chunks).toHaveLength(2);
    expect(chunks[0][0]).toHaveLength(1);
    expect(chunks[1][0][0].startDiv).toBe(32); // 1 beat played, 7 blank
  });

  it('returns one empty chunk per lane for an empty system', () => {
    expect(splitSystemIntoChunks([{ sounds: [] }, { sounds: [] }], 4)).toEqual([[[], []]]);
  });
});

describe('setRuns', () => {
  const p = (setId) => ({ setId });

  it('ignores parts with no set', () => {
    expect(setRuns([p(null), p(null)])).toEqual([]);
  });

  it('groups consecutive parts of one set', () => {
    expect(setRuns([p('a'), p('a'), p(null)])).toEqual([{ setId: 'a', from: 0, to: 1 }]);
  });

  it('splits a set interrupted by another part', () => {
    expect(setRuns([p('a'), p('b'), p('a')])).toEqual([
      { setId: 'a', from: 0, to: 0 },
      { setId: 'b', from: 1, to: 1 },
      { setId: 'a', from: 2, to: 2 },
    ]);
  });
});

describe('clampLabelX', () => {
  // A cell from 10 to 20 mm, so its centre is 15.
  const cell = [10, 10];

  it('leaves a label that already fits where it is', () => {
    expect(clampLabelX(15, 4, ...cell)).toBe(15);
  });

  it('slides a label off the left edge just inside it', () => {
    // Onset-centred at 11 with a 6 mm name would start at 8, 2 mm outside.
    expect(clampLabelX(11, 6, ...cell)).toBe(13);
  });

  it('slides a label off the right edge just inside it', () => {
    expect(clampLabelX(19, 6, ...cell)).toBe(17);
  });

  it('centres a label wider than its cell, so it overflows evenly', () => {
    expect(clampLabelX(11, 14, ...cell)).toBe(15);
  });

  it('leaves the label alone with no cell to stay inside', () => {
    expect(clampLabelX(11, 6, null, 10)).toBe(11);
    expect(clampLabelX(11, 6, 10, 0)).toBe(11);
  });
});
