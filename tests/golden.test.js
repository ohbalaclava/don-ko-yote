// Golden tests for the 3.0 parts migration: a score saved by 2.45 must load,
// sound and print exactly as it did before systems and lanes existed. These are
// the guard on "a single-part score is unchanged" — if one of them goes red, the
// migration changed the music, not just the data shape.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({ set: vi.fn(), proportionalWidth: false }));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

const mockDoc = vi.hoisted(() => {
  const calls = [];
  const rec =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  return {
    calls,
    setFont: rec('setFont'),
    setFontSize: rec('setFontSize'),
    setTextColor: rec('setTextColor'),
    setDrawColor: rec('setDrawColor'),
    setFillColor: rec('setFillColor'),
    setLineWidth: rec('setLineWidth'),
    text: rec('text'),
    rect: rec('rect'),
    line: rec('line'),
    circle: rec('circle'),
    addPage: rec('addPage'),
    setPage: rec('setPage'),
    addImage: rec('addImage'),
    getTextWidth: () => 5,
    output: () => new Blob(['pdf'], { type: 'application/pdf' }),
    save: rec('save'),
  };
});
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function () {
    return mockDoc;
  }),
}));

import { piece } from '../src/data/piece.js';
import { migrateScore } from '../src/data/migrate.js';
import { buildSequence, totalSpan } from '../src/data/sequence.js';
import { exportPdf } from '../src/pdf.js';

// ── A representative 2.45 score ───────────────────────────────────────────────
// Deliberately exercises every row kind, a repeat, an uneven line, a rest and a
// jiuchi section — the features whose timing or layout the migration could move.

function sound(id, name, hand, duration = 4, extra = {}) {
  return { id, name, hand, duration, ...extra };
}

function legacyScore() {
  return {
    title: 'Golden',
    taiko: 'Nagado',
    jiuchi: 'Gobu Gobu',
    beatsPerLine: 4,
    bpm: 132,
    author: 'Tester',
    icon: null,
    showVolume: false,
    lines: [
      { id: 'h1', type: 'heading', text: 'Part A' },
      {
        id: 'l1',
        sounds: [
          sound('s1', 'Don', 'R'),
          sound('s2', 'Ka', 'L', 2),
          sound('s3', 'Ka', 'R', 2, { emphasis: true }),
          sound('s4', '—', 'R', 4, { implicit: true }),
        ],
      },
      { id: 'l2', sounds: [sound('s5', 'Don', 'R'), sound('s6', 'Don', 'L', 4, { volume: 3 })] },
      { id: 'b1', type: 'block-repeat', lineIds: ['l1', 'l2'], count: 2 },
      { id: 'v1', type: 'divider' },
      { id: 'm1', type: 'jiuchi-section', taiko: 'Shime' },
      { id: 'd1', sounds: [sound('s7', 'Ten', 'R', 2), sound('s8', 'Ten', 'L', 2)] },
      { id: 'v2', type: 'divider' },
      { id: 'l3', sounds: [sound('s9', 'Don', 'R')], repeat: 3 },
      { id: 'n1', type: 'note', text: 'Softly' },
    ],
  };
}

const TIME = 4; // Nagado / Gobu Gobu is straight time

/** Every field a 2.45 save wrote (its `PERSISTED_FIELDS`), plus `lines`. */
const PRE_30_FIELDS = [
  'title',
  'taiko',
  'jiuchi',
  'beatsPerLine',
  'bpm',
  'author',
  'version',
  'icon',
  'showVolume',
  'metronome',
  'metronomeHeadOnly',
  'metronomeEmphasiseHead',
  'metronomeJiuchi',
  'metronomeShime',
  'metronomeVolume',
  'lines',
];

/** The legacy lines, as a 2.45 app would hold them (readers tolerate this shape). */
const legacyLines = legacyScore().lines;

/** The same score after the 3.0 migration. */
function migratedLines() {
  return migrateScore(legacyScore()).lines;
}

// ── Persisted fields ──────────────────────────────────────────────────────────

describe('loading a 2.45 score', () => {
  beforeEach(() => {
    piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8 });
  });

  it('keeps every scalar field as saved', () => {
    const score = legacyScore();
    piece.loadFromData(score);
    const snap = piece._snapshot();
    for (const key of [
      'title',
      'taiko',
      'jiuchi',
      'beatsPerLine',
      'bpm',
      'author',
      'icon',
      'showVolume',
    ]) {
      expect(snap[key]).toEqual(score[key]);
    }
  });

  it('adds only the format stamp, parts and sets', () => {
    const score = legacyScore();
    piece.loadFromData(score);
    const { parts, sets, lines } = migrateScore(score);
    piece.parts = parts;
    piece.sets = sets;
    piece.lines = lines;
    const snap = piece._snapshot();
    // Measured against what 2.45 persisted, not against the fixture: the fixture
    // omits the metronome defaults, which a save has always written.
    const added = Object.keys(snap).filter((k) => !PRE_30_FIELDS.includes(k));
    expect(added.sort()).toEqual(['format', 'parts', 'sets']);
  });

  it('migrates to exactly one part on the score drum', () => {
    const { parts } = migrateScore(legacyScore());
    expect(parts).toHaveLength(1);
    expect(parts[0].taiko).toBe('Nagado');
  });

  it('keeps every row id, so repeats and jiuchi sections still resolve', () => {
    expect(migratedLines().map((l) => l.id)).toEqual(legacyLines.map((l) => l.id));
  });
});

// ── Playback ──────────────────────────────────────────────────────────────────

describe('buildSequence over a migrated score', () => {
  /** Events minus `lineId`, which legitimately moves from the row to its lane. */
  const musical = (lines) => buildSequence(lines, TIME).events.map(({ lineId: _l, ...e }) => e);

  it('produces the same events in the same order', () => {
    expect(musical(migratedLines())).toEqual(musical(legacyLines));
  });

  it('produces the same total length', () => {
    expect(buildSequence(migratedLines(), TIME).totalDiv).toBe(
      buildSequence(legacyLines, TIME).totalDiv
    );
  });

  it('agrees with totalSpan', () => {
    const lines = migratedLines();
    expect(totalSpan(lines)).toBe(buildSequence(lines, TIME).totalDiv);
  });

  it('tags each event with its lane, and every lane belongs to the score', () => {
    const lines = migratedLines();
    const laneIds = new Set(lines.flatMap((l) => (l.lanes ?? []).map((x) => x.id)));
    const { events } = buildSequence(lines, TIME);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(laneIds.has(e.lineId)).toBe(true);
  });
});

// ── PDF ───────────────────────────────────────────────────────────────────────

describe('exportPdf over a migrated score', () => {
  async function draw(lines) {
    mockDoc.calls.length = 0;
    piece.reset({ taiko: 'Nagado', jiuchi: 'Gobu Gobu', beatsPerLine: 4 });
    piece.loadFromData(legacyScore());
    piece.lines = lines;
    await exportPdf();
    return mockDoc.calls.map((c) => JSON.stringify(c));
  }

  it('makes the same draw calls as the pre-3.0 shape', async () => {
    const before = await draw(legacyLines);
    const after = await draw(migratedLines());
    expect(after).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });
});
