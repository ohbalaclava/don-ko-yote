// Sampled-audio voice data: maps score sounds to recorded drum samples and
// loads/decodes the wav files into AudioBuffers. Kept separate from engine.js so
// the name→sample resolver stays a pure, unit-testable function.
import { getAudioContext } from './engine.js';

/**
 * Per-taiko sample sets, keyed by taiko display name. Each set maps a sample key
 * (`'DON-L'` etc.) to the wav URL. Only Nagado is recorded today; adding another
 * taiko is a one-line entry here. URLs go through BASE_URL so a future subpath
 * deploy stays correct (no `base` is set today, so this is `/assets/...`).
 */
const SAMPLE_SETS = {
  Nagado: {
    'DON-L': `${import.meta.env.BASE_URL}assets/sounds/DON-L.wav`,
    'DON-R': `${import.meta.env.BASE_URL}assets/sounds/DON-R.wav`,
    'KA-L': `${import.meta.env.BASE_URL}assets/sounds/KA-L.wav`,
    'KA-R': `${import.meta.env.BASE_URL}assets/sounds/KA-R.wav`,
    KI: `${import.meta.env.BASE_URL}assets/sounds/KI.wav`,
  },
};

/**
 * Resolves a sound to its sample key, or null when the sound has no hand (a rest,
 * which the scheduler never sounds). Family comes from the first syllable's
 * vowel: a centre hit (do/don/ko/kon/ro/ron) reads `o` and uses the DON sample;
 * the rim click (ki) reads `i` and uses the single hand-less KI sample; everything
 * else (ka/ra) uses the rim KA sample. For DON/KA, hand picks the L/R recording
 * (`B`/missing → R).
 * @param {{ name: string, hand?: string }} sound
 * @returns {'DON-L'|'DON-R'|'KA-L'|'KA-R'|'KI'|null}
 */
export function sampleKey(sound) {
  if (sound.hand == null) return null;
  const letters = (sound.name || '').replace(/[^a-z]/gi, '');
  const vowel = letters.charAt(1).toLowerCase();
  if (vowel === 'i') return 'KI'; // ki — its own recording, no L/R variant
  const family = vowel === 'o' ? 'DON' : 'KA';
  const suffix = sound.hand === 'L' ? 'L' : 'R';
  return `${family}-${suffix}`;
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
