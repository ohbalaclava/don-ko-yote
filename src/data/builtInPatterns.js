/**
 * Built-in patterns for specific jiuchi types.
 * Keys match jiuchi names from symbolSets.js (e.g. 'Gobu Gobu', 'Shichisan').
 * Each entry: { name: string, sounds: Array<{ name, hand, duration }> }
 *
 * Duration is in app subdivisions. Total duration per pattern = piece.time × numBeats.
 *   Gobu Gobu: time=4, 2-beat patterns → total duration 8
 *   Shichisan: time=3, 3-beat patterns → total duration 9
 *
 * These are best-guess placeholders — fill in accurate sounds as needed.
 * hand values: 'R' (right), 'L' (left), 'B' (both)
 */
export const BUILT_IN_PATTERNS = {
  'Gobu Gobu': [
    // Single hits (2 beats each)
    {
      name: 'DON',
      sounds: [{ name: 'do', hand: 'R', duration: 8 }],
    },
    {
      name: 'KA',
      sounds: [{ name: 'ka', hand: 'L', duration: 8 }],
    },
    // Two-hit patterns (1 beat + 1 beat)
    {
      name: 'DOKO',
      sounds: [
        { name: 'do', hand: 'R', duration: 4 },
        { name: 'ko', hand: 'L', duration: 4 },
      ],
    },
    {
      name: 'KARA',
      sounds: [
        { name: 'ka', hand: 'R', duration: 4 },
        { name: 'ra', hand: 'L', duration: 4 },
      ],
    },
    // koro patterns (half-beat pair + full beat)
    {
      name: 'korodon',
      sounds: [
        { name: 'do', hand: 'R', duration: 2 },
        { name: 'ro', hand: 'L', duration: 2 },
        { name: 'do', hand: 'R', duration: 4 },
      ],
    },
    // Four-hit patterns (half-beat each)
    {
      name: 'dorororo',
      sounds: [
        { name: 'do', hand: 'R', duration: 2 },
        { name: 'ro', hand: 'L', duration: 2 },
        { name: 'do', hand: 'R', duration: 2 },
        { name: 'ro', hand: 'L', duration: 2 },
      ],
    },
  ],

  Shichisan: [
    // Single hits (3 beats each)
    {
      name: 'DON',
      sounds: [{ name: 'do', hand: 'R', duration: 9 }],
    },
    // Two-hit patterns
    {
      name: "DO'KO",
      sounds: [
        { name: 'do', hand: 'R', duration: 6 },
        { name: 'ko', hand: 'L', duration: 3 },
      ],
    },
    {
      name: "DOKO'",
      sounds: [
        { name: 'do', hand: 'R', duration: 3 },
        { name: 'ko', hand: 'L', duration: 6 },
      ],
    },
    // koro patterns
    {
      name: 'koroDON',
      sounds: [
        { name: 'do', hand: 'R', duration: 2 },
        { name: 'ro', hand: 'L', duration: 1 },
        { name: 'do', hand: 'R', duration: 6 },
      ],
    },
  ],
};
