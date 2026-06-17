import { resumeAudio, getAudioContext, voice } from './engine.js';
import { settings } from '../data/settings.js';
import { piece } from '../data/piece.js';
import { isKakegoe, KAKEGOE_VOLUME } from '../data/kakegoe.js';

// Modest level so UI feedback sits under real playback. Master volume applies
// downstream (it scales the post-limiter output, not these calls).
const FEEDBACK_VOLUME = 0.6;

/** True when UI audio feedback is enabled (the app setting). */
function enabled() {
  return settings.uiSounds;
}

/**
 * Plays a tile's own sound as tap feedback, in the current score's timbre.
 * Call from a user gesture (a tap handler) — `resumeAudio()` must run inside the
 * gesture or mobile browsers stay silent. Volume is resolved like playback
 * (`sequence.js`): kakegoe calls sound at a fixed level, others use their own
 * volume. Symbols with no audible voice (rests, vocalizations like SU) have no
 * volume, so they click instead.
 * @param {{ name: string, hand?: string, volume?: number }} sound
 */
export function feedbackSound(sound) {
  if (!enabled()) return;
  const volume = isKakegoe(sound.name) ? KAKEGOE_VOLUME : sound.volume;
  if (volume == null) return feedbackClick('tap');
  resumeAudio(); // fire-and-forget; awaiting would lose the gesture context
  const c = getAudioContext();
  voice.strike({ ...sound, volume }, c.currentTime, piece.taiko);
}

/**
 * Plays a short UI click. Call from a user gesture (see {@link feedbackSound}).
 * @param {'tap'|'pickup'|'drop'} [kind] - 'tap'/'pickup' are the normal click;
 *   'drop' is slightly higher (the accented tick) to mark a successful drop.
 */
export function feedbackClick(kind = 'tap') {
  if (!enabled()) return;
  resumeAudio();
  const c = getAudioContext();
  voice.tick(c.currentTime, { accent: kind === 'drop', volume: FEEDBACK_VOLUME });
}
