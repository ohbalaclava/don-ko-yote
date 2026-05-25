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
}));

const mockSettings = vi.hoisted(() => ({
  defaultBackground: null,
}));

vi.mock('../src/data/settings.js', () => ({
  settings: mockSettings,
}));

import { exportPdf } from '../src/pdf.js';

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

    it('renders subtitle with taiko, jiuchi and beatsPerLine', async () => {
      await exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Shime  ·  七三  ·  4 beats/line');
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

    it('omits instruction text when absent', async () => {
      mockPiece.lines = [makeLine([makeSound()])];
      await exportPdf();
      // title + subtitle + hand + name + line number = 5 calls
      expect(mockDoc.text).toHaveBeenCalledTimes(5);
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
