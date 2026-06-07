import m from 'mithril';
import { buildSequence, divToSeconds } from '../data/sequence.js';
import { getAudioContext, resumeAudio, voice } from './engine.js';
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
  currentSoundId: null,
  // What is currently playing, so scoped play buttons can show the right state:
  // { type: 'all' | 'line' | 'section' | 'block', id?: string }. Null when stopped.
  scope: null,

  _events: [],
  _taiko: '',
  _startTime: 0, // AudioContext time at which the score's division 0 sounds
  _endTime: 0,
  _nextIdx: 0,
  _timer: null,
  _raf: null,
  // Bumped by play when it claims control, and by stop. An async play captures the
  // value before its `await` and bails if it changed, so a second tap or a stop
  // during the await can't start a stale loop.
  _epoch: 0,

  /** True when the given scope descriptor matches what's currently playing. */
  isScope(type, id) {
    return this.playing && this.scope?.type === type && this.scope?.id === id;
  },

  /**
   * Play/stop toggle for a scoped selection (a single line, a section, a repeat
   * block). Playing the active scope again stops it; any other scope is replaced.
   * Must be called from a user-gesture handler (it resumes the AudioContext).
   * @param {object} piece
   * @param {Array<object>} lines - The subset of lines to play.
   * @param {{ type: string, id?: string }} scope
   */
  toggleScope(piece, lines, scope) {
    const active = this.isScope(scope.type, scope.id);
    this.stop(); // play() no-ops while playing, so always clear first
    if (!active) this.play(piece, { lines, scope });
  },

  /**
   * The whole-piece play/stop toggle for the main toolbar. Stops when already
   * playing the whole piece; otherwise replaces any scoped preview and plays.
   * @param {object} piece
   */
  toggleAll(piece) {
    if (this.scope?.type === 'all') return this.stop();
    this.stop();
    return this.play(piece, { scope: { type: 'all' } });
  },

  /**
   * Starts playback from the beginning. No-ops if already playing or if the
   * (sub)selection produces no events.
   * @param {object} piece
   * @param {{ lines?: Array<object>, scope?: { type: string, id?: string } }} [opts]
   *   `lines` defaults to the whole piece; `scope` records what is playing for the
   *   UI (defaults to `{ type: 'all' }`). The count-in is only played for `'all'`
   *   scope — scoped previews skip it.
   */
  async play(piece, opts = {}) {
    if (this.playing) return;
    const lines = opts.lines ?? piece.lines;
    const scope = opts.scope ?? { type: 'all' };
    const { bpm, time, taiko } = piece;
    if (!(bpm > 0)) return; // 0 / blank / negative bpm would make every time Infinity
    const { events, totalDiv } = buildSequence(lines, time);
    if (!events.length) return;

    // Claim control synchronously so a second tap is rejected by the guard above
    // before this one's `await` resolves, and capture the epoch to detect a
    // stop that lands during the await.
    this.playing = true;
    this.scope = scope;
    this.currentSoundId = null;
    const epoch = ++this._epoch;
    await resumeAudio();
    if (this._epoch !== epoch) return;
    // Decode any recorded samples for this taiko before scheduling, so the first
    // hits aren't silent while decode is in flight. No-op for synth-only taikos.
    await voice.preload(taiko);
    if (this._epoch !== epoch) return;
    const c = getAudioContext();

    this._events = events.map((e) => ({
      sound: {
        name: e.name,
        hand: e.hand,
        skin: e.skin,
        volume: e.volume,
        duration: e.durationDiv,
      },
      soundId: e.soundId,
      atSec: divToSeconds(e.startDiv, bpm, time),
      endSec: divToSeconds(e.startDiv + e.durationDiv, bpm, time),
      audible: e.volume != null,
    }));
    this._taiko = taiko;

    const base = c.currentTime + LEAD_IN;
    // Count-in only for whole-piece playback; scoped previews start immediately.
    const useCountIn = scope.type === 'all' && settings.countIn;
    const countInSec = useCountIn ? this._scheduleCountIn(base, piece) : 0;
    this._startTime = base + countInSec;
    this._endTime = this._startTime + divToSeconds(totalDiv, bpm, time);
    this._nextIdx = 0;

    this._timer = setInterval(() => this._schedule(), TICK);
    this._schedule();
    this._raf = requestAnimationFrame(() => this._followPlayhead());
    m.redraw();
  },

  stop() {
    this._epoch++; // invalidate any in-flight play()
    if (this._timer) clearInterval(this._timer);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._timer = null;
    this._raf = null;
    this._events = [];
    this._nextIdx = 0;
    const wasActive = this.playing;
    this.playing = false;
    this.scope = null;
    this.currentSoundId = null;
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
    if (!this.playing) return;
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
    if (!this.playing) return;
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
      if (id != null) this._scrollIntoView(id);
      m.redraw();
    }
    this._raf = requestAnimationFrame(() => this._followPlayhead());
  },

  /**
   * Keeps the currently-playing tile on screen by scrolling its ancestor scroll
   * container the minimum amount needed. Tiles carry `data-sound-id`; ligatures
   * expose the first sub-sound's id on their outer element, so the lookup resolves
   * for both plain and ligated tiles. `block: 'nearest'` avoids jumpy re-centering
   * on every note — it only scrolls when the tile has reached the viewport edge.
   */
  _scrollIntoView(soundId) {
    const el = document.querySelector(`[data-sound-id="${soundId}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
};
