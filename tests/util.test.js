import { describe, it, expect } from 'vitest';
import { packIntoTracks } from '../src/util.js';

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
