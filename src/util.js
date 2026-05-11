/**
 * Returns true when n sits within 1e-9 of an integer.
 * Used to detect beat boundaries against floating-point sums of fractional durations.
 * @param {number} n
 * @returns {boolean}
 */
export function isIntegerBeat(n) {
  return Math.abs(n - Math.round(n)) < 1e-9;
}
