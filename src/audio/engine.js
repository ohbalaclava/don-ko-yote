// Web Audio sound engine. The synth strategy below is deliberately isolated behind
// a small `voice` interface (strike / click) so a future sampled-audio voice can be
// dropped in without touching the scheduler in player.js. Taikos with a recorded
// sample set (see samples.js) play those instead of the synth; everything else
// falls through to synthStrike.
import { sampleKey, getBuffer, loadSamples } from './samples.js';

let ctx = null;
let master = null;
let noiseBuffer = null;

// Master-bus gain is BASE_MASTER scaled by the user's playback-volume setting
// (1 = default). The setting lets users compensate for quiet/loud devices; the
// limiter below still catches the resulting peaks.
const BASE_MASTER = 0.9;
let masterVolume = 1;

/**
 * Sets the user playback-volume multiplier (1 = default) and applies it live if
 * the audio graph already exists. Called by settings on load and change.
 * @param {number} v - Volume multiplier (0 = silent).
 */
export function setMasterVolume(v) {
  masterVolume = v;
  if (master) master.gain.value = BASE_MASTER * masterVolume;
}

/** Lazily creates the shared AudioContext and a master gain node. */
export function getAudioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = BASE_MASTER * masterVolume;
    // Safety limiter on the master bus: normal playing sits below the threshold
    // and passes through clean, while loud notes (vol 5–8) and dense overlaps are
    // caught just under 0 dBFS instead of clipping. This lets the per-note gains
    // run hot (see voiceParams) for usable loudness on weak mobile speakers.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  return ctx;
}

/**
 * Resumes the AudioContext. Must be called from within a user-gesture handler;
 * iOS Safari and Chrome's autoplay policy leave a freshly-created context
 * suspended until a gesture resumes it.
 * @returns {Promise<void>}
 */
export function resumeAudio() {
  const c = getAudioContext();
  return c.state === 'suspended' ? c.resume() : Promise.resolve();
}

/** One second of mono white noise, reused for every percussive attack. */
function getNoiseBuffer(c) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

// Base timbre per taiko family: body frequency (Hz), amplitude decay (s), and
// whether the drum rings metallically (the atarigane / Kane hand-gong).
const TAIKO_VOICE = {
  Shime: { freq: 320, decay: 0.16 },
  Katsugi: { freq: 240, decay: 0.22 },
  Kane: { freq: 720, decay: 0.5, metal: true },
  Nagado: { freq: 130, decay: 0.45 },
  Okedo: { freq: 150, decay: 0.4 },
  Odaiko: { freq: 80, decay: 0.6 },
};
const DEFAULT_VOICE = { freq: 160, decay: 0.35 };

/**
 * Derives synth parameters for a single strike from the sound and the current
 * taiko. Rim/click syllables (ka, ra, ki) are brighter and noisier than centre
 * hits (do, ten); hand maps to stereo pan; volume (1–8) maps to gain.
 * @param {{ name: string, hand?: string, volume: number }} sound
 * @param {string} taiko - Taiko display name.
 */
export function voiceParams(sound, taiko) {
  const base = TAIKO_VOICE[taiko] ?? DEFAULT_VOICE;
  const first = (sound.name || '').charAt(0).toLowerCase();
  const rim = first === 'k' || first === 'r'; // ka/ki/ko/ra/re/ro — rim-ish
  // Volume 1–8 maps to gain exponentially (~1.6× / +4 dB per step) so accents
  // read clearly against soft notes. Anchored at the typical accent (vol 4 → 0.5)
  // rather than the rarely-used vol 8, so real scores (mostly vol 2–4) play at a
  // usable level instead of ~10% amplitude. Loud notes run past 1.0 (vol 8 ≈ 3.3)
  // and are caught by the master limiter rather than clipping.
  const v = Math.min(8, Math.max(1, sound.volume));
  const gain = 0.5 * Math.pow(1.6, v - 4);
  const pan = sound.hand === 'L' ? -0.35 : sound.hand === 'R' ? 0.35 : 0;
  return {
    freq: base.freq * (rim ? 1.5 : 1),
    decay: base.decay * (rim ? 0.6 : 1),
    noiseAmt: rim ? 1.1 : 0.5,
    metal: !!base.metal,
    gain,
    pan,
  };
}

/** Connects a node to the master bus through a stereo panner. */
function panTo(c, node, pan) {
  const p = c.createStereoPanner();
  p.pan.value = pan;
  node.connect(p);
  p.connect(master);
  return p;
}

/**
 * Schedules one synthesized drum strike at `when` (AudioContext time).
 * @param {{ name: string, hand?: string, volume: number }} sound
 * @param {number} when - Start time in seconds on the AudioContext clock.
 * @param {string} taiko - Taiko display name (selects the timbre).
 */
function synthStrike(sound, when, taiko) {
  const c = getAudioContext();
  const { freq, decay, noiseAmt, metal, gain, pan } = voiceParams(sound, taiko);

  // Pitched body: a sine (or detuned inharmonic pair for metal) with a fast pitch
  // drop and exponential amplitude decay.
  const bodyGain = c.createGain();
  bodyGain.gain.setValueAtTime(gain, when);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
  panTo(c, bodyGain, pan);

  const partials = metal ? [1, 1.48, 2.61] : [1];
  for (const ratio of partials) {
    const osc = c.createOscillator();
    osc.type = metal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq * ratio * 1.7, when);
    osc.frequency.exponentialRampToValueAtTime(freq * ratio, when + 0.04);
    osc.connect(bodyGain);
    osc.start(when);
    osc.stop(when + decay + 0.05);
  }

  // Attack transient: a short filtered noise burst.
  const noise = c.createBufferSource();
  noise.buffer = getNoiseBuffer(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * (metal ? 4 : 2.5);
  bp.Q.value = 0.8;
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(gain * noiseAmt, when);
  nGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
  noise.connect(bp);
  bp.connect(nGain);
  panTo(c, nGain, pan);
  noise.start(when);
  noise.stop(when + 0.1);
}

/**
 * Schedules a short count-in click at `when`. `accent` (the first beat of a bar)
 * is higher and louder.
 * @param {number} when - Start time in seconds on the AudioContext clock.
 * @param {boolean} [accent=false]
 */
function click(when, accent = false) {
  const c = getAudioContext();
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = accent ? 1500 : 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(accent ? 0.35 : 0.22, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(g);
  g.connect(master);
  osc.start(when);
  osc.stop(when + 0.06);
}

// Base gain for sampled strikes at the typical accent (volume 4), before the
// per-note volume curve. Recordings carry their own peak level and dynamics, so
// this is independent of the synth's gain and must be tuned by ear against the
// synth loudness and the master limiter.
const SAMPLE_BASE_GAIN = 0.8;

/**
 * Schedules one recorded-sample strike at `when`, if a decoded sample exists for
 * this sound's taiko. Returns false when no sample is available (no set for the
 * taiko, a rest, or a buffer that hasn't loaded), so the caller can fall back to
 * the synth. Left/right is baked into the chosen recording, so no panner is used.
 * @param {{ name: string, hand?: string, volume: number }} sound
 * @param {number} when - Start time in seconds on the AudioContext clock.
 * @param {string} taiko - Taiko display name.
 * @returns {boolean} True if a sample was scheduled.
 */
function sampleStrike(sound, when, taiko) {
  const key = sampleKey(sound);
  if (!key) return false;
  const buffer = getBuffer(taiko, key);
  if (!buffer) return false;

  const c = getAudioContext();
  // Same exponential shape as the synth (~+4 dB per volume step, anchored at the
  // vol-4 accent), but with the sample-specific base gain.
  const v = Math.min(8, Math.max(1, sound.volume));
  const g = c.createGain();
  g.gain.value = SAMPLE_BASE_GAIN * Math.pow(1.6, v - 4);
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(g);
  g.connect(master);
  src.start(when);
  return true;
}

/**
 * Plays a sound: a recorded sample when one is available for the taiko, otherwise
 * the synth. The swap is per-strike so a taiko with only some samples (or before
 * decode finishes) still sounds via the synth.
 */
function strike(sound, when, taiko) {
  if (!sampleStrike(sound, when, taiko)) synthStrike(sound, when, taiko);
}

/** The active voice. */
export const voice = {
  strike,
  click,
  /** Loads (once) any recorded samples for `taiko`; no-op for synth-only taikos. */
  preload: (taiko) => loadSamples(taiko),
};
