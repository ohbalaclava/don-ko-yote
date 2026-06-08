/**
 * Generate an RFC 4122 v4 UUID.
 *
 * Prefers `crypto.randomUUID()`, but that API is only exposed in a secure
 * context (HTTPS or localhost). When the app is served over plain HTTP on a
 * LAN IP — e.g. testing on a phone via `vite --host` — it is undefined, so we
 * fall back to building a v4 UUID from `crypto.getRandomValues`, which is
 * available in insecure contexts too.
 * @returns {string}
 */
export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
