// A guard against mixed-key children arrays in the score row. Mithril runs its
// fragment key check inside `m()` itself (`render/hyperscript.js` →
// `Vnode.normalizeChildren`), so simply *building* the System vnode tree throws
// `In fragments, vnodes must either all have keys or none have keys.` — no DOM
// and no diff needed. Lane's own view never runs, since it is only a vnode here.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `m.redraw` (called by every piece mutator) schedules through
// requestAnimationFrame, which node does not provide — stub it, since nothing is
// mounted and no redraw can do anything here.
vi.hoisted(() => {
  globalThis.requestAnimationFrame = () => 0;
});

const mockSettings = vi.hoisted(() => ({
  set: vi.fn(),
  proportionalWidth: false,
  font: 'sans',
  volume: 1,
}));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));
vi.mock('sortablejs', () => ({ default: { create: vi.fn(() => ({ destroy: vi.fn() })) } }));
vi.mock('../src/audio/engine.js', () => ({
  getAudioContext: () => ({ currentTime: 0 }),
  resumeAudio: async () => {},
  voice: { strike: vi.fn(), tick: vi.fn(), preload: vi.fn(async () => {}) },
}));

import { piece, lanesOf, isSoundLine } from '../src/data/piece.js';
import { System } from '../src/components/System.jsx';

function sym(name = 'Don', hand = 'R', duration = 4) {
  return { name, hand, duration };
}

/** Builds the vnode tree for the system at `idx`, the way `Score` renders it. */
function build(idx, attrs = {}) {
  const system = piece.lines[idx];
  return System().view({
    attrs: { system, index: idx, repeatDepth: 0, singleRepeat: null, ...attrs },
  });
}

/** Every sound system, built — the whole score's rows in one pass. */
function buildAll(attrs = {}) {
  return piece.lines.map((row, idx) => (isSoundLine(row) ? build(idx, attrs) : null));
}

beforeEach(() => {
  piece.reset({ taiko: 'Shime', jiuchi: 'Gobu Gobu', beatsPerLine: 8 });
  piece.addSound(lanesOf(piece.lines[0])[0].id, sym());
});

describe('a solo system', () => {
  it('builds', () => {
    expect(build(0).tag).toBe('div');
  });

  it('builds when selected, in line-select mode, and inside a repeat', () => {
    piece.selectLine(lanesOf(piece.lines[0])[0].id);
    expect(() => build(0, { repeatDepth: 2 })).not.toThrow();
    expect(() => build(0, { singleRepeat: { id: 'r1', count: 3 } })).not.toThrow();
    piece.lineSelectMode = true;
    piece.toggleLineSelection(piece.lines[0].id);
    expect(() => build(0)).not.toThrow();
    piece.lineSelectMode = false;
  });
});

describe('an ensemble system', () => {
  beforeEach(() => {
    piece.addPart({ taiko: 'Nagado' });
    piece.addPart({ taiko: 'Shime' });
    // Parts 2 and 3 are one player's taiko set, so their rows carry a bracket.
    const set = piece.addSet('Player 2');
    piece.assignPartToSet(piece.parts[1].id, set.id);
    piece.assignPartToSet(piece.parts[2].id, set.id);
  });

  it('builds with three parts, two of them bracketed as a set', () => {
    expect(piece.parts).toHaveLength(3);
    expect(lanesOf(piece.lines[0])).toHaveLength(3);
    expect(build(0).tag).toBe('div');
  });

  it('builds with a lane selected, in line-select mode, and inside a repeat', () => {
    piece.selectLine(lanesOf(piece.lines[0])[1].id);
    expect(() => build(0, { repeatDepth: 1 })).not.toThrow();
    expect(() => build(0, { singleRepeat: { id: 'r1', count: 2 } })).not.toThrow();
    piece.lineSelectMode = true;
    piece.toggleLineSelection(piece.lines[0].id);
    expect(() => build(0)).not.toThrow();
    piece.lineSelectMode = false;
  });

  it('builds a part-less jiuchi definition row', () => {
    piece.addJiuchiSection();
    const idx = piece.lines.findIndex((row) => isSoundLine(row) && lanesOf(row).length === 1);
    expect(idx).toBeGreaterThan(-1);
    expect(lanesOf(piece.lines[idx])[0].partId).toBeNull();
    expect(() => build(idx)).not.toThrow();
    expect(() => buildAll()).not.toThrow();
  });
});

describe('a jiuchi definition row in a solo score', () => {
  it('builds', () => {
    piece.addJiuchiSection();
    expect(() => buildAll()).not.toThrow();
  });
});
