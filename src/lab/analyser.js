// Waveform and spectrum displays.
//
// Tuning a drum synth purely by ear wastes time: you can hear that something is
// wrong long before you can hear what. The spectrum with the model's own mode
// frequencies drawn on top answers that directly - if a partial you can hear is
// not on a marker, it is coming from somewhere the model did not intend.

/** Peak-hold decay per frame. A one-shot strike is gone in milliseconds otherwise. */
const HOLD_DECAY = 0.94;

const LOW_HZ = 20;
const HIGH_HZ = 16000;

/**
 * Sizes a canvas's backing store to its CSS box at device resolution.
 * @param {HTMLCanvasElement} canvas
 * @returns {{ ctx: CanvasRenderingContext2D, w: number, h: number }}
 */
function surface(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/** Log-scaled x position for a frequency. */
const xFor = (freq, w) =>
  (Math.log(Math.max(LOW_HZ, freq) / LOW_HZ) / Math.log(HIGH_HZ / LOW_HZ)) * w;

export class Analysis {
  /**
   * @param {AudioContext} ctx
   */
  constructor(ctx) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.35;
    this.wave = new Float32Array(this.analyser.fftSize);
    this.bins = new Float32Array(this.analyser.frequencyBinCount);
    this.hold = new Float32Array(this.analyser.frequencyBinCount).fill(-140);
    this.sampleRate = ctx.sampleRate;
    /** Scrolling envelope history, so a decay tail is visible after it has passed. */
    this.envelope = new Float32Array(240);
    this.envelopeAt = 0;
  }

  /** The node that engines should be routed through. */
  get node() {
    return this.analyser;
  }

  /** Samples the analyser once. Call once per animation frame, before drawing. */
  sample() {
    this.analyser.getFloatTimeDomainData(this.wave);
    this.analyser.getFloatFrequencyData(this.bins);
    for (let i = 0; i < this.bins.length; i++) {
      const decayed = -140 + (this.hold[i] + 140) * HOLD_DECAY;
      this.hold[i] = Math.max(decayed, this.bins[i]);
    }
    let peak = 0;
    for (let i = 0; i < this.wave.length; i++) peak = Math.max(peak, Math.abs(this.wave[i]));
    this.envelope[this.envelopeAt] = peak;
    this.envelopeAt = (this.envelopeAt + 1) % this.envelope.length;
  }

  /** Clears the peak hold and the envelope history. */
  reset() {
    this.hold.fill(-140);
    this.envelope.fill(0);
  }

  /**
   * Draws the live waveform with the recent peak envelope behind it.
   * @param {HTMLCanvasElement} canvas
   */
  drawWave(canvas) {
    const { ctx, w, h } = surface(canvas);
    const mid = h / 2;

    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();

    // Envelope history: oldest sample at the left edge.
    ctx.fillStyle = 'rgba(56,189,248,0.18)';
    const n = this.envelope.length;
    for (let i = 0; i < n; i++) {
      const v = this.envelope[(this.envelopeAt + i) % n];
      const x = (i / n) * w;
      ctx.fillRect(x, mid - v * mid, w / n + 1, v * h);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(1, (window.devicePixelRatio || 1) * 1.2);
    ctx.beginPath();
    for (let i = 0; i < this.wave.length; i++) {
      const x = (i / this.wave.length) * w;
      const y = mid - this.wave[i] * mid * 0.95;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /**
   * Draws the log-frequency spectrum (live plus peak hold) with the engine's
   * predicted mode frequencies marked.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{ freq: number, amp: number, air?: boolean }>} markers
   */
  drawSpectrum(canvas, markers = []) {
    const { ctx, w, h } = surface(canvas);
    const dpr = window.devicePixelRatio || 1;
    const binHz = this.sampleRate / 2 / this.bins.length;
    const dbToY = (db) => h - ((db + 100) / 100) * h;

    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.lineWidth = 1;
    for (const freq of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = xFor(freq, w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(freq >= 1000 ? freq / 1000 + 'k' : String(freq), x + 3 * dpr, h - 4 * dpr);
    }

    // Predicted modes, drawn under the data so the data stays readable.
    for (const marker of markers) {
      if (marker.freq < LOW_HZ || marker.freq > HIGH_HZ) continue;
      const x = xFor(marker.freq, w);
      ctx.strokeStyle = marker.air ? 'rgba(251,191,36,0.55)' : 'rgba(74,222,128,0.45)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - Math.min(1, Math.abs(marker.amp)) * h * 0.5);
      ctx.stroke();
    }

    const trace = (data, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (let i = 1; i < data.length; i++) {
        const freq = i * binHz;
        if (freq < LOW_HZ) continue;
        if (freq > HIGH_HZ) break;
        const x = xFor(freq, w);
        const y = dbToY(Math.max(-100, data[i]));
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    trace(this.hold, 'rgba(244,114,182,0.55)', Math.max(1, dpr));
    trace(this.bins, '#f472b6', Math.max(1, dpr * 1.3));
  }
}
