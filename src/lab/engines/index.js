// Engine registry. The UI is built entirely from what an engine declares here,
// so adding a third synthesis method means adding a module and one line below.
//
// Every engine implements:
//   id, label, blurb
//   params            ParamSpec[]  - drives the slider UI
//   strike(ctx, destination, { when, params })
//   readouts(params, sampleRate)   - derived values shown next to the sliders
//   modeMarkers(params, sampleRate) - frequencies the spectrum display marks
//
// `strike` is deliberately shaped like the app's `voice.strike(sound, when,
// taiko)` in src/audio/engine.js, so porting a winning engine back is a mapping
// layer rather than a rewrite.
import { modal } from './modal.js';
import { fm } from './fm.js';
import { mesh } from './mesh.js';

export const ENGINES = [modal, fm, mesh];

/**
 * @param {string} id
 * @returns {object} The engine, falling back to the first registered one.
 */
export function engineById(id) {
  return ENGINES.find((engine) => engine.id === id) ?? ENGINES[0];
}
