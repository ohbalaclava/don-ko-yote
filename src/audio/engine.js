// Web Audio sound engine. The synth strategy below is deliberately isolated behind
// a small `voice` interface (strike / click) so a future sampled-audio voice can be
// dropped in without touching the scheduler in player.js. Taikos with a recorded
// sample set (see samples.js) play those instead of the synth; everything else
// falls through to synthStrike.
import { sampleKey, getBuffer, loadSamples } from './samples.js';
import { isKakegoe } from '../data/kakegoe.js';

let ctx = null;
let master = null;
let output = null;
let noiseBuffer = null;

// Gain staging: voices → master (fixed) → limiter → output (user volume) → soft-clip.
// `master` is set so a single typical hit (a vol-4 strike) lands near 0 dBFS and the
// limiter only engages on overlaps/loud accents, rather than clamping every note.
// An earlier value of 10 ran ~+12 dB into the limiter; its 3 ms attack can't catch a
// drum transient, so every attack overshot and the soft-clip waveshaped it — audible
// clicking/distortion, worst when loud. The user's playback-volume knob lives on
// `output`, AFTER the limiter, so turning it up scales the limited signal instead of
// just compressing harder (which is why a pre-limiter knob felt dead above ~100%).
const BASE_MASTER = 2.5;
let masterVolume = 1;

/**
 * Sets the user playback-volume multiplier (1 = default) and applies it live if
 * the audio graph already exists. Drives the post-limiter output gain — values
 * above 100% push into the final soft-clip stage rather than hard-clipping.
 * @param {number} v - Volume multiplier (0 = silent).
 */
export function setMasterVolume(v) {
  masterVolume = v;
  if (output) output.gain.value = masterVolume;
}

/**
 * Builds a soft-clip curve that is exactly linear below ±LIN and bends gently toward
 * ±1 above it. Levels below LIN (now where typical playback sits) pass through with
 * no colouration; only true peaks — loud accents and dense overlaps — get rolled off
 * instead of hard-clipping. A plain tanh would already start shaping around ±0.3,
 * audibly squashing normal notes, so we keep the lower range strictly linear.
 * @returns {Float32Array}
 */
function makeSoftClipCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  const LIN = 0.7; // pass levels below this through untouched
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a <= LIN ? x : Math.sign(x) * (LIN + (1 - LIN) * Math.tanh((a - LIN) / (1 - LIN)));
  }
  return curve;
}

/** Lazily creates the shared AudioContext and the master → limiter → output graph. */
export function getAudioContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = BASE_MASTER;
    // Safety limiter on the master bus: with BASE_MASTER set so a typical hit peaks
    // near 0 dBFS, single notes sit below the threshold and pass through clean, while
    // loud accents (vol 5–8) and dense overlaps are caught just under 0 dBFS instead
    // of clipping. Threshold sits close to 0 so it only catches genuine peaks rather
    // than gain-reducing every note (which is what produced the constant overshoot).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    // User playback volume, applied after the limiter so the knob has real range.
    output = ctx.createGain();
    output.gain.value = masterVolume;
    // Final soft-clip: keeps boosted output (>100%) musical instead of hard-clipping.
    const softClip = ctx.createWaveShaper();
    softClip.curve = makeSoftClipCurve();
    softClip.oversample = '4x';
    master.connect(limiter);
    limiter.connect(output);
    output.connect(softClip);
    softClip.connect(ctx.destination);
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
 * Schedules a short metronome/count-in click at `when`. `accent` (the first beat
 * of a bar, or an emphasised metronome head) is higher and louder. Reached via
 * `voice.tick` (the synth fallback) for both the metronome and the count-in.
 * @param {number} when - Start time in seconds on the AudioContext clock.
 * @param {boolean} [accent=false]
 * @param {number} [gainMul=1] - Volume multiplier (1 = the base click level).
 */
function click(when, accent = false, gainMul = 1) {
  const c = getAudioContext();
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = accent ? 1500 : 1000;
  const g = c.createGain();
  g.gain.setValueAtTime((accent ? 0.35 : 0.22) * gainMul, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(g);
  g.connect(master);
  osc.start(when);
  osc.stop(when + 0.06);
}

// The synth click is a square wave, which is perceptually much louder and more
// piercing than a recorded drum hit at the same peak gain. This factor pulls the
// metronome's synth tick down to roughly match the samples (the score's and the
// Shime metronome) at the same volume setting; tune by ear against playback.
const METRO_SYNTH_GAIN = 0.15;

/**
 * Schedules one metronome tick at `when`. With `shime`, plays the Shime TEN sample
 * (louder when accented) if its buffer is loaded; otherwise — and whenever `shime`
 * is off — falls back to the synth click so the tick is never silent.
 * @param {number} when - Start time in seconds on the AudioContext clock.
 * @param {object} [opts]
 * @param {boolean} [opts.accent=false] - Emphasised head beat.
 * @param {boolean} [opts.shime=false] - Use the Shime TEN sample.
 * @param {number} [opts.volume=1] - Metronome volume multiplier.
 */
function metroTick(when, { accent = false, shime = false, volume = 1 } = {}) {
  if (!(volume > 0)) return; // silent, and avoids an exponential ramp from gain 0
  if (shime) {
    const buffer = getBuffer('Shime', 'Shime');
    if (buffer) {
      const c = getAudioContext();
      const g = c.createGain();
      g.gain.value = SAMPLE_BASE_GAIN * volume * (accent ? 1.5 : 1);
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(g);
      g.connect(master);
      src.start(when);
      return;
    }
  }
  click(when, accent, volume * METRO_SYNTH_GAIN);
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
  const key = sampleKey(sound, taiko);
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
 * decode finishes) still sounds via the synth. Kakegoe calls are vocal-only — they
 * have no synth voice, so a missing/unloaded call sample stays silent rather than
 * triggering a drum hit.
 */
function strike(sound, when, taiko) {
  if (sampleStrike(sound, when, taiko)) return;
  if (isKakegoe(sound.name)) return;
  synthStrike(sound, when, taiko);
}

/** The active voice. */
export const voice = {
  strike,
  tick: metroTick,
  /** Loads (once) any recorded samples for `taiko`; no-op for synth-only taikos. */
  preload: (taiko) => loadSamples(taiko),
};
