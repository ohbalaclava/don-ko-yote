// The part-merge maths: one event stream per audible part, flattened onto one
// timeline with a per-event taiko and gain. The scheduler and the audio graph are
// not exercised — the engine is mocked and only `player._events` is inspected.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('mithril', () => ({ default: { redraw: vi.fn() } }));

const mockSettings = vi.hoisted(() => ({ set: vi.fn(), countIn: false }));
vi.mock('../src/data/settings.js', () => ({ settings: mockSettings }));

const ctx = vi.hoisted(() => ({ currentTime: 0 }));
const mockVoice = vi.hoisted(() => ({
  strike: vi.fn(),
  tick: vi.fn(),
  preload: vi.fn(async () => {}),
}));
vi.mock('../src/audio/engine.js', () => ({
  getAudioContext: () => ctx,
  resumeAudio: async () => {},
  voice: mockVoice,
}));

import { piece, lanesOf } from '../src/data/piece.js';
import { player } from '../src/audio/player.js';

function sym(name = 'Don', hand = 'R', duration = 4) {
  return { name, hand, duration };
}

/** The lane of part `partIdx` on the first sound system. */
function lane(partIdx = 0) {
  return lanesOf(piece.lines[0])[partIdx];
}

/** `{ taiko, gain, soundName }` for each built event, in schedule order. */
function built() {
  return player._events.map((e) => ({
    taiko: e.taiko,
    gain: e.gain,
    name: e.sound.name,
    atSec: e.atSec,
  }));
}

beforeEach(() => {
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = { querySelector: () => null };
  ctx.currentTime = 0;
  mockVoice.preload.mockClear();
  player.soloPartId = null;
  piece.reset({ taiko: 'Nagado', jiuchi: 'Gobu Gobu', beatsPerLine: 8 });
});

afterEach(() => {
  player.stop();
});

/** Two parts on different drums, each with one sound on the first system. */
function twoParts() {
  piece.addPart({ taiko: 'Shime', name: 'Ji' });
  piece.addSound(lane(0).id, sym('Don'));
  piece.addSound(lane(1).id, sym('Ten'));
}

// ── Merging ───────────────────────────────────────────────────────────────────

describe('play over an ensemble score', () => {
  it('builds an event for every part', async () => {
    twoParts();
    await player.play(piece);
    expect(
      built()
        .map((e) => e.name)
        .sort()
    ).toEqual(['Don', 'Ten']);
  });

  it('tags each event with its own part taiko', async () => {
    twoParts();
    await player.play(piece);
    const byName = Object.fromEntries(built().map((e) => [e.name, e.taiko]));
    expect(byName).toEqual({ Don: 'Nagado', Ten: 'Shime' });
  });

  it('trims each part by the square root of the number of streams', async () => {
    twoParts();
    await player.play(piece);
    for (const e of built()) expect(e.gain).toBeCloseTo(1 / Math.sqrt(2), 10);
  });

  it('scales a part volume into its gain', async () => {
    twoParts();
    piece.setPartVolume(piece.parts[1].id, 0.5);
    await player.play(piece);
    const byName = Object.fromEntries(built().map((e) => [e.name, e.gain]));
    expect(byName.Don).toBeCloseTo(1 / Math.sqrt(2), 10);
    expect(byName.Ten).toBeCloseTo(0.5 / Math.sqrt(2), 10);
  });

  it('merges the streams in time order', async () => {
    piece.addPart({ taiko: 'Shime' });
    piece.addSound(lane(0).id, sym('Don'));
    piece.addSound(lane(0).id, sym('Ka'));
    piece.addSound(lane(1).id, sym('Ten'));
    await player.play(piece);
    const times = built().map((e) => e.atSec);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The second part's single sound shares division 0 with the first part's.
    expect(times[0]).toBe(times[1]);
  });

  it('preloads every taiko in play', async () => {
    twoParts();
    await player.play(piece);
    expect(mockVoice.preload.mock.calls.flat().sort()).toEqual(['Nagado', 'Shime']);
  });
});

// ── Mute and solo ─────────────────────────────────────────────────────────────

describe('mute and solo', () => {
  it('drops a muted part', async () => {
    twoParts();
    piece.togglePartMute(piece.parts[1].id);
    await player.play(piece);
    expect(built().map((e) => e.name)).toEqual(['Don']);
  });

  it('plays only the soloed part', async () => {
    twoParts();
    player.togglePartSolo(piece.parts[1].id);
    await player.play(piece);
    expect(built().map((e) => e.name)).toEqual(['Ten']);
  });

  it('ignores a mute on the soloed part', async () => {
    twoParts();
    piece.togglePartMute(piece.parts[1].id);
    player.togglePartSolo(piece.parts[1].id);
    await player.play(piece);
    expect(built().map((e) => e.name)).toEqual(['Ten']);
  });

  it('restores every unmuted part when the solo is cleared', async () => {
    twoParts();
    const id = piece.parts[1].id;
    player.togglePartSolo(id);
    player.togglePartSolo(id);
    await player.play(piece);
    expect(built()).toHaveLength(2);
  });

  it('a single stream is not trimmed for spread', async () => {
    twoParts();
    player.togglePartSolo(piece.parts[1].id);
    await player.play(piece);
    expect(built()[0].gain).toBe(1);
  });
});

// ── Scopes ────────────────────────────────────────────────────────────────────

describe('scoped playback', () => {
  it('plays one part under a part scope', async () => {
    twoParts();
    await player.play(piece, { scope: { type: 'part', id: piece.parts[1].id } });
    expect(built().map((e) => e.name)).toEqual(['Ten']);
    expect(built()[0].taiko).toBe('Shime');
  });

  it('plays exactly the lanes handed to a line scope', async () => {
    twoParts();
    const only = { id: piece.lines[0].id, lanes: [lane(1)] };
    await player.play(piece, { lines: [only], scope: { type: 'line', id: lane(1).id } });
    expect(built().map((e) => e.name)).toEqual(['Ten']);
  });

  it('voices a line scope with that lane taiko', async () => {
    twoParts();
    const only = { id: piece.lines[0].id, lanes: [lane(1)] };
    await player.play(piece, { lines: [only], scope: { type: 'line', id: lane(1).id } });
    expect(built()[0].taiko).toBe('Shime');
  });
});

// ── Solo score parity ─────────────────────────────────────────────────────────

describe('a single-part score', () => {
  it('plays at full gain in the score taiko', async () => {
    piece.addSound(lane(0).id, sym('Don'));
    await player.play(piece);
    expect(built()).toEqual([{ name: 'Don', taiko: 'Nagado', gain: 1, atSec: 0 }]);
  });
});

// ── Playhead ──────────────────────────────────────────────────────────────────

describe('the playhead', () => {
  it('holds every sound under it at once', async () => {
    twoParts();
    await player.play(piece);
    // Mid-way through the first beat, both parts' sounds are ringing.
    ctx.currentTime = player._startTime + 0.01;
    player._followPlayhead();
    expect(player.currentSoundIds.size).toBe(2);
    for (const e of player._events) expect(player.isSounding(e.soundId)).toBe(true);
  });

  it('empties when the playhead is past everything', async () => {
    twoParts();
    await player.play(piece);
    ctx.currentTime = player._startTime - 1; // before division 0
    player._followPlayhead();
    expect(player.currentSoundIds.size).toBe(0);
  });
});
