import { describe, it, expect } from 'vitest';
import { packIntoTracks, groupIntoLigatures, groupSoundsForDisplay } from '../src/util.js';

/** Compact sound factory for grouping tests. */
const snd = (name, hand, duration, extra = {}) => ({ name, hand, duration, ...extra });

describe('packIntoTracks', () => {
  it('returns empty result for no spans', () => {
    expect(packIntoTracks([])).toEqual({ tracks: [], trackCount: 0 });
  });

  it('places a single span on track 0', () => {
    expect(packIntoTracks([{ start: 0, end: 10 }])).toEqual({ tracks: [0], trackCount: 1 });
  });

  it('keeps non-overlapping spans on the same track', () => {
    // second span starts exactly where the first ends -> still fits track 0
    const spans = [
      { start: 0, end: 10 },
      { start: 10, end: 20 },
    ];
    expect(packIntoTracks(spans)).toEqual({ tracks: [0, 0], trackCount: 1 });
  });

  it('pushes an overlapping span onto a new track', () => {
    const spans = [
      { start: 0, end: 15 },
      { start: 10, end: 20 },
    ];
    expect(packIntoTracks(spans)).toEqual({ tracks: [0, 1], trackCount: 2 });
  });

  it('reuses the lowest free track once an earlier one clears', () => {
    // span 0 occupies track 0 until 15; span 1 overlaps -> track 1; span 2
    // starts at 15 so track 0 is free again.
    const spans = [
      { start: 0, end: 15 },
      { start: 10, end: 20 },
      { start: 15, end: 25 },
    ];
    expect(packIntoTracks(spans)).toEqual({ tracks: [0, 1, 0], trackCount: 2 });
  });

  it('treats end === start as non-overlapping (track end is exclusive)', () => {
    const spans = [
      { start: 0, end: 5 },
      { start: 5, end: 5 },
    ];
    const { tracks } = packIntoTracks(spans);
    expect(tracks).toEqual([0, 0]);
  });
});

describe('groupIntoLigatures', () => {
  it('returns [] for no sounds', () => {
    expect(groupIntoLigatures([], 4)).toEqual([]);
  });

  it('joins same-beat, alternating-hand, equal-duration sub-beats (even time)', () => {
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 1), snd('do', 'R', 1), snd('ko', 'L', 1)];
    const result = groupIntoLigatures(sounds, 4);
    expect(result).toHaveLength(1);
    expect(result[0].sounds).toEqual(sounds);
    expect(result[0].startPos).toBe(0);
  });

  it('emits a full-beat sound as a single item', () => {
    const sounds = [snd('DON', 'R', 4)];
    expect(groupIntoLigatures(sounds, 4)).toEqual([{ sound: sounds[0], startPos: 0 }]);
  });

  it('does not join when the next hand matches (no alternation)', () => {
    const sounds = [snd('do', 'R', 1), snd('do', 'R', 1)];
    const result = groupIntoLigatures(sounds, 4);
    expect(result.map((it) => ('sound' in it ? 'single' : 'group'))).toEqual(['single', 'single']);
  });

  it('ignores the equal-duration rule for odd time (swing)', () => {
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 2)];
    const result = groupIntoLigatures(sounds, 3);
    expect(result).toHaveLength(1);
    expect(result[0].sounds).toEqual(sounds);
  });

  it('honours ligature:false to break an otherwise-automatic join', () => {
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 1, { ligature: false })];
    const result = groupIntoLigatures(sounds, 4);
    expect(result).toHaveLength(2);
  });

  it('honours ligature:true to force-join across a beat boundary', () => {
    const sounds = [snd('DON', 'R', 4), snd('ko', 'L', 1, { ligature: true })];
    const result = groupIntoLigatures(sounds, 4);
    expect(result).toHaveLength(1);
    expect(result[0].sounds).toEqual(sounds);
  });

  it('honours the offset for beat-boundary detection', () => {
    // starting at offset 3 (mid-beat for time 4): the two sounds straddle beats 0 and 1
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 1)];
    const result = groupIntoLigatures(sounds, 4, 3);
    expect(result).toHaveLength(2);
    expect(result[0].startPos).toBe(3);
    expect(result[1].startPos).toBe(4);
  });
});

describe('groupSoundsForDisplay', () => {
  it('proportional mode emits one item per sound with no grouping or markers', () => {
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 1)];
    expect(groupSoundsForDisplay(sounds, true, 4)).toEqual([
      { sound: sounds[0], startPos: 0 },
      { sound: sounds[1], startPos: 1 },
    ]);
  });

  it('non-proportional mode groups ligatures (no markers for 2+ groups)', () => {
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 1)];
    const result = groupSoundsForDisplay(sounds, false, 4);
    expect(result).toHaveLength(1);
    expect(result[0].sounds).toEqual(sounds);
  });

  it('inserts beat markers for boundaries inside a single multi-beat tile', () => {
    const sounds = [snd('DON', 'R', 8)]; // spans beats 0 and 1 at time 4
    const result = groupSoundsForDisplay(sounds, false, 4);
    expect(result).toEqual([
      { sound: sounds[0], startPos: 0 },
      { type: 'beat-marker', beat: 1 },
    ]);
  });

  it('does not insert a marker for a tile that ends exactly on a beat', () => {
    const sounds = [snd('DON', 'R', 4)]; // exactly one beat at time 4
    const result = groupSoundsForDisplay(sounds, false, 4);
    expect(result).toEqual([{ sound: sounds[0], startPos: 0 }]);
  });

  it("marks a beat landing inside a ligature's last member (swing)", () => {
    // time 3: TE'(2) + KEN(3) auto-join; beat 1 falls inside KEN (pos 2-5), so the
    // marker sits in the gap after the ligature tile rather than on its edge.
    const sounds = [snd("TE'", 'R', 2), snd('KEN', 'L', 3)];
    const result = groupSoundsForDisplay(sounds, false, 3);
    expect(result).toHaveLength(2);
    expect(result[0].sounds).toEqual(sounds);
    expect(result[1]).toEqual({ type: 'beat-marker', beat: 1 });
  });

  it('does not mark a ligature whose members each start on a beat', () => {
    // time 4: two sub-beat sounds joined, both within beat 0 -> no interior beat.
    const sounds = [snd('do', 'R', 1), snd('ko', 'L', 1)];
    const result = groupSoundsForDisplay(sounds, false, 4);
    expect(result).toHaveLength(1);
    expect(result[0].sounds).toEqual(sounds);
  });
});
