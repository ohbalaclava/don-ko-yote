import m from 'mithril';
import { buildSequence, divToSeconds } from '../data/sequence.js';
import { getAudioContext, resumeAudio, suspendAudio, voice } from './engine.js';
import { settings } from '../data/settings.js';

const LOOKAHEAD = 0.1; // seconds of audio scheduled ahead of the clock
const TICK = 25; // scheduler poll interval (ms)
const LEAD_IN = 0.12; // small delay so the first note isn't scheduled in the past

/**
 * Singleton playback controller. Flattens the piece into a timed event stream and
 * schedules synth strikes against the AudioContext clock using the classic
 * lookahead pattern (a coarse setInterval that schedules precisely-timed Web Audio
 * events a little ahead of now). A separate rAF loop tracks the playhead for the
 * tile highlight and auto-stops at the end.
 */
export const player = {
  playing: false,
  paused: false,
  currentSoundId: null,

  _events: [],
  _taiko: '',
  _startTime: 0, // AudioContext time at which the score's division 0 sounds
  _endTime: 0,
  _nextIdx: 0,
  _timer: null,
  _raf: null,

  /**
   * Play / pause / resume in one entry point, suitable for a single toggle button.
   * Must be called from a user-gesture handler (it resumes the AudioContext).
   * @param {object} piece - The piece singleton.
   */
  toggle(piece) {
    if (!this.playing) return this.play(piece);
    if (this.paused) return this.resume();
    return this.pause();
  },

  /**
   * Starts playback from the beginning. No-ops if already playing or if the score
   * produces no events.
   * @param {object} piece
   */
  async play(piece) {
    if (this.playing) return;
    const { events, totalDiv } = buildSequence(piece.lines, piece.time);
    if (!events.length) return;

    await resumeAudio();
    const c = getAudioContext();
    const { bpm, time, taiko } = piece;

    this._events = events.map((e) => ({
      sound: { name: e.name, hand: e.hand, volume: e.volume },
      soundId: e.soundId,
      atSec: divToSeconds(e.startDiv, bpm, time),
      endSec: divToSeconds(e.startDiv + e.durationDiv, bpm, time),
      audible: e.volume != null,
    }));
    this._taiko = taiko;

    const base = c.currentTime + LEAD_IN;
    const countInSec = settings.countIn ? this._scheduleCountIn(base, piece) : 0;
    this._startTime = base + countInSec;
    this._endTime = this._startTime + divToSeconds(totalDiv, bpm, time);
    this._nextIdx = 0;

    this.playing = true;
    this.paused = false;
    this.currentSoundId = null;
    this._timer = setInterval(() => this._schedule(), TICK);
    this._schedule();
    this._raf = requestAnimationFrame(() => this._followPlayhead());
    m.redraw();
  },

  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    suspendAudio(); // freezes the AudioContext clock, halting pending + future notes
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    m.redraw();
  },

  async resume() {
    if (!this.playing || !this.paused) return;
    await resumeAudio();
    this.paused = false;
    this._raf = requestAnimationFrame(() => this._followPlayhead());
    m.redraw();
  },

  stop() {
    if (this._timer) clearInterval(this._timer);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._timer = null;
    this._raf = null;
    this._events = [];
    this._nextIdx = 0;
    const wasActive = this.playing;
    const wasPaused = this.paused;
    this.playing = false;
    this.paused = false;
    this.currentSoundId = null;
    // If we stop while paused, the AudioContext is suspended with notes still
    // queued in the lookahead window. Resume so they flush against the (now dead)
    // schedule rather than firing as a blip when the next play() resumes the clock.
    if (wasActive && wasPaused) resumeAudio();
    if (wasActive) m.redraw();
  },

  /**
   * Schedules a count-in of clicks ending at `base + return value`. Counts in one
   * bar (`beatsPerLine`), capped at 4 so wide lines don't produce an overlong lead-in.
   * @returns {number} The count-in duration in seconds.
   */
  _scheduleCountIn(base, piece) {
    const beats = Math.min(piece.beatsPerLine > 0 ? piece.beatsPerLine : 4, 4);
    const beatSec = divToSeconds(piece.time, piece.bpm, piece.time);
    for (let i = 0; i < beats; i++) voice.click(base + i * beatSec, i === 0);
    return beats * beatSec;
  },

  /** Schedules every event whose start falls within the lookahead window. */
  _schedule() {
    if (!this.playing || this.paused) return;
    const c = getAudioContext();
    const horizon = c.currentTime + LOOKAHEAD;
    while (this._nextIdx < this._events.length) {
      const e = this._events[this._nextIdx];
      const when = this._startTime + e.atSec;
      if (when >= horizon) break;
      if (e.audible) voice.strike(e.sound, when, this._taiko);
      this._nextIdx++;
    }
  },

  /** rAF loop: updates the highlighted tile and stops playback at the end. */
  _followPlayhead() {
    if (!this.playing || this.paused) return;
    const c = getAudioContext();
    if (c.currentTime >= this._endTime) {
      this.stop();
      return;
    }
    const elapsed = c.currentTime - this._startTime;
    let id = null;
    if (elapsed >= 0) {
      for (const e of this._events) {
        if (e.atSec <= elapsed && elapsed < e.endSec) {
          id = e.soundId;
          break;
        }
      }
    }
    if (id !== this.currentSoundId) {
      this.currentSoundId = id;
      m.redraw();
    }
    this._raf = requestAnimationFrame(() => this._followPlayhead());
  },
};
