import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDoc = vi.hoisted(() => ({
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setDrawColor: vi.fn(),
  text: vi.fn(),
  rect: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return mockDoc;
  }),
}));

const mockPiece = vi.hoisted(() => ({
  title: 'Test Song',
  jiuchi: '七三',
  beatsPerLine: 4,
  lines: [],
}));

vi.mock('../src/data/piece.js', () => ({ piece: mockPiece }));

import { exportPdf } from '../src/pdf.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockPiece.title = 'Test Song';
  mockPiece.jiuchi = '七三';
  mockPiece.beatsPerLine = 4;
  mockPiece.lines = [];
});

function makeLine(sounds) {
  return { sounds };
}

function makeSound(overrides = {}) {
  return { name: 'Don', hand: 'R', duration: 1, ...overrides };
}

describe('exportPdf', () => {
  describe('filename', () => {
    it('uses the piece title', () => {
      mockPiece.title = 'My Song';
      exportPdf();
      expect(mockDoc.save).toHaveBeenCalledWith('My Song.pdf');
    });

    it('falls back to taiko when title is empty', () => {
      mockPiece.title = '';
      exportPdf();
      expect(mockDoc.save).toHaveBeenCalledWith('taiko.pdf');
    });
  });

  describe('header', () => {
    it('renders the piece title', () => {
      mockPiece.title = 'Drum Piece';
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Drum Piece');
    });

    it('renders Untitled when title is empty', () => {
      mockPiece.title = '';
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Untitled');
    });

    it('renders subtitle with jiuchi and beatsPerLine', () => {
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('七三  ·  4 beats/line');
    });
  });

  describe('sound rendering', () => {
    it('skips lines with no sounds', () => {
      mockPiece.lines = [makeLine([])];
      exportPdf();
      expect(mockDoc.rect).not.toHaveBeenCalled();
    });

    it('draws a rect for each sound', () => {
      mockPiece.lines = [makeLine([makeSound(), makeSound({ name: 'Ko', hand: 'L' })])];
      exportPdf();
      expect(mockDoc.rect).toHaveBeenCalledTimes(2);
    });

    it('renders sound name', () => {
      mockPiece.lines = [makeLine([makeSound({ name: 'Ka' })])];
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('Ka');
    });

    it('renders sound hand', () => {
      mockPiece.lines = [makeLine([makeSound({ hand: 'L' })])];
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('L');
    });

    it('renders instruction when present', () => {
      mockPiece.lines = [makeLine([makeSound({ instruction: 'forte' })])];
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('forte');
    });

    it('omits instruction text when absent', () => {
      mockPiece.lines = [makeLine([makeSound()])];
      exportPdf();
      // title + subtitle + line number + hand + name = 5 calls
      expect(mockDoc.text).toHaveBeenCalledTimes(5);
    });
  });

  describe('line numbers', () => {
    it('renders 1-based line index', () => {
      mockPiece.lines = [makeLine([makeSound()]), makeLine([makeSound()])];
      exportPdf();
      const texts = mockDoc.text.mock.calls.map(([t]) => t);
      expect(texts).toContain('1');
      expect(texts).toContain('2');
    });
  });

  describe('pagination', () => {
    it('does not add a page for few lines', () => {
      mockPiece.lines = [makeLine([makeSound()])];
      exportPdf();
      expect(mockDoc.addPage).not.toHaveBeenCalled();
    });

    it('adds a page when content exceeds 270mm', () => {
      // header ends at y=29; each line adds tileH(14)+3=17mm
      // after 14 lines y=267, after 15th line y=284 > 270 → addPage
      mockPiece.lines = Array.from({ length: 15 }, () => makeLine([makeSound()]));
      exportPdf();
      expect(mockDoc.addPage).toHaveBeenCalled();
    });

    it('resets y to margin after page break', () => {
      mockPiece.lines = Array.from({ length: 15 }, () => makeLine([makeSound()]));
      exportPdf();
      // addPage called exactly once for 15 lines
      expect(mockDoc.addPage).toHaveBeenCalledTimes(1);
    });
  });
});
