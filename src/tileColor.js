import { effectiveVolume } from './util.js';

/** Base hues for the hand × skin cross product (Tailwind 500-series RGB values). */
export const TINT_HUES = {
  'R-front': { r: 239, g: 68, b: 68 }, // red-500
  'R-back': { r: 249, g: 115, b: 22 }, // orange-500
  'L-front': { r: 59, g: 130, b: 246 }, // blue-500
  'L-back': { r: 168, g: 85, b: 247 }, // purple-500
};

/**
 * Computes the colour-coding tint for a placed sound: hue from hand × skin,
 * alpha from volume (1 → 0.08 pale, 8 → 0.50 strong — capped so text stays
 * readable over the tint in both light and dark modes).
 *
 * Sounds without a committed single hand — rests, silent tiles, hand 'B',
 * symbols whose hand is still an unchosen alternative — get no tint.
 * `skin` is read unconditionally (like the italic back-skin rendering), so a
 * lingering `skin: 'back'` on a one-skin taiko still shifts the hue.
 *
 * @param {object} sound placed sound object
 * @returns {{ r: number, g: number, b: number, alpha: number } | null}
 */
export function tileTint(sound) {
  if (sound.hand !== 'R' && sound.hand !== 'L') return null;
  const vol = effectiveVolume(sound);
  if (vol == null) return null;
  const base = TINT_HUES[`${sound.hand}-${sound.skin === 'back' ? 'back' : 'front'}`];
  return { ...base, alpha: 0.08 + (vol - 1) * 0.06 };
}

/**
 * Tint as a CSS colour for on-screen tiles, or null when the sound is untinted.
 *
 * @param {object} sound placed sound object
 * @returns {string | null} e.g. 'rgba(239,68,68,0.26)'
 */
export function tileTintCss(sound) {
  const t = tileTint(sound);
  return t ? `rgba(${t.r},${t.g},${t.b},${t.alpha})` : null;
}

/**
 * Border colour for a tinted tile: the tint hue at a much stronger alpha, so
 * the tile edge stands out against its own tinted background (the default
 * light-gray border washes out over a colour fill).
 *
 * @param {object} sound placed sound object
 * @returns {string | null} e.g. 'rgba(239,68,68,0.61)'
 */
export function tileBorderCss(sound) {
  const t = tileTint(sound);
  return t ? `rgba(${t.r},${t.g},${t.b},${Math.min(0.9, t.alpha + 0.35)})` : null;
}

/**
 * Tint as an opaque RGB colour for PDF export, with the alpha pre-blended
 * onto the white page background.
 *
 * @param {object} sound placed sound object
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function tileTintPdfRgb(sound) {
  const t = tileTint(sound);
  if (!t) return null;
  const blend = (c) => Math.round(c * t.alpha + 255 * (1 - t.alpha));
  return { r: blend(t.r), g: blend(t.g), b: blend(t.b) };
}
