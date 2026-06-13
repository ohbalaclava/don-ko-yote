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
}));

const mockSettings = vi.hoisted(() => ({
  defaultBackground: null,
}));

vi.mock('../src/data/settings.js', () => ({
  settings: mockSettings,
}));

import { exportPdf, splitIntoRows } from '../src/pdf.js';

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

  it('never splits a single oversized sound across rows', () => {
    const rows = splitIntoRows([beat(10)], 4); // 10 beats > 8
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
  });
});
