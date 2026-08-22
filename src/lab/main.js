// Taiko synthesis lab - a standalone experiment page, deliberately isolated
// from the app. It imports nothing from src/audio, src/data or src/components,
// and the app imports nothing from here. The only intended coupling is that a
// preset tuned here can later be pasted into the app's audio engine.
import m from 'mithril';
import './lab.css';
import { ENGINES, engineById } from './engines/index.js';
import { defaultsFor } from './params.js';
import { Analysis } from './analyser.js';
import { impulseResponse } from './dsp/reverb.js';
import {
  BUILTIN_PRESETS,
  loadPresets,
  savePreset,
  deletePreset,
  applyToEngine,
  exportJson,
  importJson,
} from './presets.js';
import { EngineSwitch, Readouts, ParamPanel, Pads, Scopes, PresetPanel } from './ui.js';

// --- audio -----------------------------------------------------------------

let ctx = null;
let master = null;
let analysis = null;
let convolver = null;
let wet = null;
// Parameters the loaded impulse response was built from, so it is only rebuilt
// when the room actually changes rather than on every strike.
let irKey = '';

/**
 * Creates the audio graph on first use. Browsers leave a fresh AudioContext
 * suspended until a user gesture, so every strike path resumes it first.
 *
 * The reverb is a parallel send off master, deliberately placed AFTER the
 * analyser tap: the scopes stay dry so the waveform still shows the strike's
 * own envelope, which is what they are for.
 *
 *   master --> analysis --> destination        (dry, analysed)
 *          -> convolver -> wet -> destination (room, not analysed)
 *
 * @returns {AudioContext}
 */
function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.9;
    analysis = new Analysis(ctx);
    master.connect(analysis.node);
    analysis.node.connect(ctx.destination);

    convolver = ctx.createConvolver();
    convolver.normalize = false;
    wet = ctx.createGain();
    wet.gain.value = 0;
    master.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  syncReverb();
  return ctx;
}

/**
 * Brings the convolver into line with the reverb parameters. Called on every
 * strike path; the impulse response is only re-rendered when its shape changes.
 */
function syncReverb() {
  const seconds = state.params.reverbSize ?? 1.2;
  const damping = state.params.reverbDamping ?? 0.5;
  const key = seconds.toFixed(2) + '/' + damping.toFixed(2);
  if (key !== irKey) {
    irKey = key;
    const channels = impulseResponse({ sampleRate: ctx.sampleRate, seconds, damping });
    const buffer = ctx.createBuffer(channels.length, channels[0].length, ctx.sampleRate);
    channels.forEach((data, i) => buffer.copyToChannel(data, i));
    convolver.buffer = buffer;
  }
  wet.gain.value = state.params.reverbMix ?? 0;
}

// --- state -----------------------------------------------------------------

const state = {
  engineId: ENGINES[0].id,
  params: defaultsFor(ENGINES[0].params),
  presetName: '',
  saved: loadPresets(),
  json: '',
  message: '',
  roll: { on: false, bpm: 240 },
};

/** The engine the UI is currently driving. */
const engine = () => engineById(state.engineId);

/** Refreshes the JSON box from the live parameters. */
function syncJson() {
  state.json = exportJson(state.presetName || 'untitled', state.engineId, state.params);
}
syncJson();

/** Fires one strike now. */
function strike() {
  const c = audio();
  engine().strike(c, master, { when: c.currentTime + 0.01, params: state.params });
}

// --- roll scheduler --------------------------------------------------------

// Lookahead scheduling on the audio clock rather than a bare setInterval:
// setInterval jitter is very audible at roll speeds, and an even roll is
// exactly what exposes a decay tail that is too long or too short.
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
let rollTimer = null;
let nextRollTime = 0;

/** Schedules any roll strikes falling inside the lookahead window. */
function pumpRoll() {
  const c = audio();
  const interval = 60 / state.roll.bpm;
  while (nextRollTime < c.currentTime + LOOKAHEAD) {
    engine().strike(c, master, { when: nextRollTime, params: state.params });
    nextRollTime += interval;
  }
}

/** Starts or stops the repeating strike. */
function toggleRoll() {
  if (rollTimer) {
    clearInterval(rollTimer);
    rollTimer = null;
    state.roll.on = false;
    return;
  }
  const c = audio();
  nextRollTime = c.currentTime + 0.1;
  state.roll.on = true;
  pumpRoll();
  rollTimer = setInterval(pumpRoll, TICK_MS);
}

// --- displays --------------------------------------------------------------

const canvases = {};

/** Draws both scopes once per animation frame, once audio exists. */
function frame() {
  requestAnimationFrame(frame);
  if (!analysis) return;
  analysis.sample();
  if (canvases.wave) analysis.drawWave(canvases.wave);
  if (canvases.spectrum) {
    analysis.drawSpectrum(canvases.spectrum, engine().modeMarkers(state.params, ctx.sampleRate));
  }
}
requestAnimationFrame(frame);

// --- actions ---------------------------------------------------------------

/**
 * Updates one parameter. Nothing is re-rendered here - the modal engine caches
 * on the parameter values themselves, so the next strike picks the change up.
 * @param {string} key
 * @param {number} value
 */
function setParam(key, value) {
  state.params = { ...state.params, [key]: value };
  syncJson();
}

/**
 * Switches engine, keeping every shared parameter and filling in whatever the
 * new engine adds. Losing the drum you just dialled in on every switch would
 * make comparison useless.
 * @param {string} id
 */
function setEngine(id) {
  state.engineId = id;
  state.params = applyToEngine(engineById(id), state.params);
  syncJson();
}

/** @param {{ name: string, engine?: string, params: object }} preset */
function loadPreset(preset) {
  if (preset.engine) state.engineId = preset.engine;
  state.params = applyToEngine(engine(), preset.params);
  state.presetName = preset.name || '';
  state.message = 'Loaded ' + (preset.name || 'preset');
  syncJson();
  strike();
}

/** Saves the live parameters under the name in the box. */
function save() {
  const name = state.presetName.trim();
  if (!name) {
    state.message = 'Give the preset a name first.';
    return;
  }
  state.saved = savePreset(name, state.engineId, state.params);
  state.message = 'Saved ' + name;
}

/** Loads whatever is in the JSON box. */
function importFromBox() {
  try {
    const preset = importJson(state.json);
    loadPreset({
      name: preset.name || state.presetName,
      engine: preset.engine,
      params: preset.params,
    });
    state.message = 'Imported';
  } catch (err) {
    state.message = 'Bad JSON: ' + err.message;
  }
}

// --- keyboard --------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    strike();
  } else if (e.key >= '1' && e.key <= '8') {
    setParam('velocity', Number(e.key));
    strike();
  } else if (e.key.toLowerCase() === 'r') {
    toggleRoll();
  } else return;
  m.redraw();
});

// --- view ------------------------------------------------------------------

const Lab = {
  view() {
    const active = engine();
    return m('div', { class: 'mx-auto max-w-5xl space-y-4 p-4 pb-16' }, [
      m('header', { class: 'space-y-1' }, [
        m('h1', { class: 'text-xl font-semibold text-slate-100' }, 'Taiko synthesis lab'),
        m(
          'p',
          { class: 'text-xs text-slate-400' },
          'Standalone experiment. Nothing here is wired into the score app.'
        ),
      ]),
      m(EngineSwitch, { engines: ENGINES, active, onselect: setEngine }),
      m(Readouts, { items: active.readouts(state.params, ctx ? ctx.sampleRate : 48000) }),
      m(Scopes, {
        onmount: (name, dom) => {
          canvases[name] = dom;
        },
      }),
      m(Pads, {
        params: state.params,
        roll: state.roll,
        onstrike: strike,
        onchange: setParam,
        ontoggleroll: toggleRoll,
        onrollbpm: (bpm) => {
          state.roll.bpm = bpm;
        },
      }),
      m(ParamPanel, { specs: active.params, params: state.params, onchange: setParam }),
      m(PresetPanel, {
        builtins: BUILTIN_PRESETS,
        saved: state.saved,
        name: state.presetName,
        json: state.json,
        message: state.message,
        onload: loadPreset,
        onname: (value) => {
          state.presetName = value;
        },
        onsave: save,
        ondelete: (name) => {
          state.saved = deletePreset(name);
        },
        onjson: (value) => {
          state.json = value;
        },
        onimport: importFromBox,
      }),
    ]);
  },
};

m.mount(document.body, Lab);
