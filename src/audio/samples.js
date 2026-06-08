// Sampled-audio voice data: maps score sounds to recorded drum samples and
// loads/decodes the audio files into AudioBuffers. Kept separate from engine.js so
// the name→sample resolver stays a pure, unit-testable function.
import { getAudioContext } from './engine.js';
import { isKakegoe, baseSyllable } from '../data/kakegoe.js';

/** Builds an asset URL through BASE_URL so a future subpath deploy stays correct
 *  (no `base` is set today, so this resolves to `/assets/sounds/<file>`). */
const url = (file) => `${import.meta.env.BASE_URL}assets/sounds/${file}`;

/**
 * Kakegoe sample URLs keyed by call (see {@link isKakegoe}). One shared recording
 * per call, mixed into every taiko's set below so calls sound the same regardless
 * of the active drum.
 */
const KAKEGOE_SAMPLES = {
  HUP: url('HUP.m4a'),
  HA: url('HA.m4a'),
  SO: url('SO.m4a'),
  'SO-2': url('SO-2.m4a'), // shorter SO, used when the call's duration is reduced
  RE: url('RE.m4a'),
  'RE-1': url('RE-1.m4a'), // shorter RE, used when the call's duration is reduced
  sore: url('sore.m4a'),
};

/** Open strike syllables (shared by Shime and Katsugi) that map to a skin/single
 *  recording. Matched on the bare syllable so articulation variants (`TE'`, `tsu'`)
 *  fold in. The buzz/press `zu` is handled separately: it has its own recording per
 *  taiko (`Shime-zu`, `Katsugi-zu`). */
const OPEN_STRIKES = new Set(['TEN', 'KEN', 'TE', 'KE', 'tsu', 'ku', 'te', 'ke', 're']);

/**
 * Per-taiko sample sets, keyed by taiko display name. Each set maps a sample key
 * to the audio file URL. Adding a taiko is one entry here plus a branch in {@link sampleKey}.
 * Every taiko includes the shared kakegoe calls; taikos with only those (Okedo,
 * Odaiko) still synth their drum hits while sounding recorded calls.
 */
const SAMPLE_SETS = {
  Nagado: {
    'DON-L': url('DON-L.m4a'),
    'DON-R': url('DON-R.m4a'),
    'KA-L': url('KA-L.m4a'),
    'KA-R': url('KA-R.m4a'),
    KI: url('KI.m4a'),
    ...KAKEGOE_SAMPLES,
  },
  Shime: {
    Shime: url('Shime.m4a'),
    'Shime-zu': url('Shime-zu.m4a'),
    ...KAKEGOE_SAMPLES,
  },
  Katsugi: {
    'Katsugi-front': url('Katsugi-front.m4a'),
    'Katsugi-back': url('Katsugi-back.m4a'),
    'Katsugi-zu': url('Katsugi-zu.m4a'),
    ...KAKEGOE_SAMPLES,
  },
  Okedo: { ...KAKEGOE_SAMPLES },
  Odaiko: {
    'Odaiko-L': url('Odaiko-L.m4a'),
    'Odaiko-R': url('Odaiko-R.m4a'),
    ...KAKEGOE_SAMPLES,
  },
};

/**
 * Resolves a sound to its sample key for the given taiko, or null when no recorded
 * sample applies (the caller then synthesizes, or stays silent for a call).
 *
 * Kakegoe calls (HUP/HA/SO/RE/sore) resolve first and are taiko-independent — they
 * have no hand. SO and RE switch to a shorter recording (`SO-2`, `RE-1`) once the
 * user trims the call's duration. Otherwise a hand is required (rests return null)
 * and resolution is per taiko:
 * - Shime: the buzz/press `zu` maps to `Shime-zu`; every other strike syllable maps
 *   to the single `Shime` recording.
 * - Katsugi: the buzz `zu` maps to its own `Katsugi-zu` recording (both hands and
 *   skins); other strikes map to `Katsugi-front`, or `Katsugi-back` when the sound
 *   is marked `skin: 'back'`.
 * - Nagado: family from the first syllable's vowel — `o` (do/don/ko/ron) → DON,
 *   `i` (ki) → the hand-less KI recording, else (ka/ra) → KA; hand picks L/R
 *   (`B`/missing → R).
 * - Odaiko: every strike maps to the L or R recording by hand (`B`/missing → R).
 * Other taikos (Okedo) have no drum samples and return null.
 * @param {{ name: string, hand?: string, skin?: string, duration?: number }} sound
 * @param {string} taiko - Taiko display name.
 * @returns {string|null}
 */
export function sampleKey(sound, taiko) {
  const name = sound.name || '';
  if (isKakegoe(name)) {
    // HUP/HA/SO/RE/sore, no hand needed. SO and RE have shorter recordings used
    // once the user trims the call's duration (full call is 4 straight / 3 swing).
    const call = baseSyllable(name);
    if (call === 'SO' && sound.duration <= 2) return 'SO-2';
    if (call === 'RE' && sound.duration <= 1) return 'RE-1';
    return call;
  }

  if (sound.hand == null) return null; // rest
  const syllable = baseSyllable(name);

  if (taiko === 'Shime') {
    if (syllable === 'zu') return 'Shime-zu'; // own buzz/press recording
    return OPEN_STRIKES.has(syllable) ? 'Shime' : null;
  }
  if (taiko === 'Katsugi') {
    if (syllable === 'zu') return 'Katsugi-zu'; // own recording, both hands and skins
    if (!OPEN_STRIKES.has(syllable)) return null;
    return sound.skin === 'back' ? 'Katsugi-back' : 'Katsugi-front';
  }
  if (taiko === 'Nagado') {
    const vowel = syllable.charAt(1).toLowerCase();
    if (vowel === 'i') return 'KI'; // ki — its own recording, no L/R variant
    const family = vowel === 'o' ? 'DON' : 'KA';
    return `${family}-${sound.hand === 'L' ? 'L' : 'R'}`;
  }
  if (taiko === 'Odaiko') return sound.hand === 'L' ? 'Odaiko-L' : 'Odaiko-R';
  return null;
}

// Decoded buffers, keyed `${taiko}/${sampleKey}`. A null value marks a key that
// failed to load, so we don't retry it every play (the strike falls back to synth).
const buffers = new Map();
// In-flight / completed load promises per taiko, so loadSamples only fetches once.
const loads = new Map();

/** Cache key for a single decoded sample. */
function bufKey(taiko, key) {
  return `${taiko}/${key}`;
}

/**
 * Fetches and decodes every sample for `taiko` (once; memoised). Resolves
 * immediately for taikos without a sample set. Individual fetch/decode failures
 * are logged and leave that key uncached, so its strikes fall back to the synth.
 * @param {string} taiko - Taiko display name.
 * @returns {Promise<void>}
 */
export function loadSamples(taiko) {
  const set = SAMPLE_SETS[taiko];
  if (!set) return Promise.resolve();
  if (loads.has(taiko)) return loads.get(taiko);

  const ctx = getAudioContext();
  const promise = Promise.all(
    Object.entries(set).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        buffers.set(bufKey(taiko, key), buffer);
      } catch (err) {
        console.warn(`Failed to load sample ${taiko}/${key} (${url}):`, err);
        buffers.set(bufKey(taiko, key), null);
      }
    })
  ).then(() => {});
  loads.set(taiko, promise);
  return promise;
}

/**
 * Returns the decoded AudioBuffer for a taiko/sample key, or undefined when not
 * loaded (or it failed to load).
 * @param {string} taiko
 * @param {string} key - A sample key from {@link sampleKey}.
 * @returns {AudioBuffer|undefined}
 */
export function getBuffer(taiko, key) {
  return buffers.get(bufKey(taiko, key)) ?? undefined;
}
