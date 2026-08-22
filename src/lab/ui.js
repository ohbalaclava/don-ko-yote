// Lab UI, in Mithril hyperscript (no JSX - same convention as the app).
//
// Nothing here knows about any particular engine: controls are generated from
// the active engine's ParamSpec list, so a new engine gets a full UI for free.
import m from 'mithril';
import { PARAM_GROUPS, fromSlider, toSlider, formatValue } from './params.js';

const PANEL = 'rounded-lg border border-slate-700 bg-slate-900/60 p-3';
const LABEL = 'text-xs uppercase tracking-wide text-slate-400';
const BTN =
  'rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 active:bg-slate-600';

/** Joins class fragments, dropping the empty ones. */
const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Segmented engine selector. */
export const EngineSwitch = {
  view({ attrs: { engines, active, onselect } }) {
    return m('div', { class: 'flex flex-wrap gap-2' }, [
      engines.map((engine) =>
        m(
          'button',
          {
            class: cx(BTN, engine.id === active.id && 'border-sky-400 bg-sky-500/20 text-sky-200'),
            onclick: () => onselect(engine.id),
          },
          engine.label
        )
      ),
      m('p', { class: 'w-full text-xs text-slate-400' }, active.blurb),
    ]);
  },
};

/** Derived values (fundamental, air mode, mode count) for the active engine. */
export const Readouts = {
  view({ attrs: { items } }) {
    return m(
      'div',
      { class: 'grid grid-cols-2 gap-2 sm:grid-cols-4' },
      items.map((item) =>
        m('div', { class: cx(PANEL, 'py-2') }, [
          m('div', { class: LABEL }, item.label),
          m('div', { class: 'font-mono text-sm text-sky-300' }, item.value),
        ])
      )
    );
  },
};

/** One parameter slider, mapped through the spec's scale. */
const Slider = {
  view({ attrs: { spec, value, onchange } }) {
    return m('label', { class: 'block' }, [
      m('div', { class: 'flex items-baseline justify-between gap-2' }, [
        m('span', { class: 'text-sm text-slate-200' }, spec.label),
        m(
          'span',
          { class: 'font-mono text-xs text-slate-400' },
          formatValue(spec, value) + (spec.unit ? ' ' + spec.unit : '')
        ),
      ]),
      m('input', {
        type: 'range',
        min: 0,
        max: 1000,
        step: 1,
        value: Math.round(toSlider(spec, value) * 1000),
        class: 'w-full accent-sky-400',
        oninput: (e) => onchange(spec.key, fromSlider(spec, e.target.value / 1000)),
      }),
      spec.hint && m('p', { class: 'text-[11px] leading-tight text-slate-500' }, spec.hint),
    ]);
  },
};

/** All sliders for an engine, split into its declared groups. */
export const ParamPanel = {
  view({ attrs: { specs, params, onchange } }) {
    // Engine-specific groups (e.g. FM) follow the shared ones, in declaration order.
    const groups = [...PARAM_GROUPS];
    for (const spec of specs) if (!groups.includes(spec.group)) groups.push(spec.group);

    return m(
      'div',
      { class: 'grid gap-3 sm:grid-cols-2' },
      groups
        .map((group) => specs.filter((spec) => spec.group === group))
        .filter((list) => list.length)
        .map((list) =>
          m('section', { class: PANEL }, [
            m('h3', { class: cx(LABEL, 'mb-2') }, list[0].group),
            m(
              'div',
              { class: 'space-y-3' },
              list.map((spec) =>
                m(Slider, { key: spec.key, spec, value: params[spec.key], onchange })
              )
            ),
          ])
        )
    );
  },
};

/**
 * Strike pad, hit-position shortcuts, velocity row and the roll control.
 * A roll is what actually exposes a bad decay tail, so it is a first-class
 * control rather than an afterthought.
 */
export const Pads = {
  view({ attrs: { params, onstrike, onchange, roll, ontoggleroll, onrollbpm } }) {
    const hitPad = (label, pos) =>
      m(
        'button',
        {
          class: cx(
            BTN,
            'flex-1',
            Math.abs(params.hitPos - pos) < 0.02 && 'border-sky-400 text-sky-200'
          ),
          onclick: () => {
            onchange('hitPos', pos);
            onstrike();
          },
        },
        label
      );

    return m('div', { class: cx(PANEL, 'space-y-3') }, [
      m(
        'button',
        {
          class:
            'w-full rounded-lg bg-sky-500 py-6 text-lg font-semibold text-slate-900 hover:bg-sky-400 active:bg-sky-300',
          onclick: () => onstrike(),
        },
        'Strike'
      ),
      m('div', { class: 'flex gap-2' }, [
        hitPad('Centre', 0),
        hitPad('Mid', 0.45),
        hitPad('Rim', 0.85),
      ]),
      m('div', [
        m('div', { class: cx(LABEL, 'mb-1') }, 'Velocity'),
        m(
          'div',
          { class: 'flex gap-1' },
          [1, 2, 3, 4, 5, 6, 7, 8].map((v) =>
            m(
              'button',
              {
                class: cx(
                  BTN,
                  'flex-1 px-0',
                  params.velocity === v && 'border-sky-400 bg-sky-500/20 text-sky-200'
                ),
                onclick: () => {
                  onchange('velocity', v);
                  onstrike();
                },
              },
              String(v)
            )
          )
        ),
      ]),
      m('div', { class: 'flex items-center gap-2' }, [
        m(
          'button',
          {
            class: cx(BTN, roll.on && 'border-rose-400 bg-rose-500/20 text-rose-200'),
            onclick: ontoggleroll,
          },
          roll.on ? 'Stop roll' : 'Roll'
        ),
        m('input', {
          type: 'range',
          min: 60,
          max: 600,
          step: 5,
          value: roll.bpm,
          class: 'flex-1 accent-rose-400',
          oninput: (e) => onrollbpm(Number(e.target.value)),
        }),
        m('span', { class: 'w-16 font-mono text-xs text-slate-400' }, roll.bpm + ' bpm'),
      ]),
      m(
        'p',
        { class: 'text-[11px] text-slate-500' },
        'Keys: space strikes, 1-8 sets velocity, R toggles the roll.'
      ),
    ]);
  },
};

/** Waveform and spectrum canvases. Drawing is driven by main.js. */
export const Scopes = {
  view({ attrs: { onmount } }) {
    const canvas = (name, title) =>
      m('div', { class: PANEL }, [
        m('div', { class: cx(LABEL, 'mb-1') }, title),
        m('canvas', { class: 'h-32 w-full', oncreate: (vnode) => onmount(name, vnode.dom) }),
      ]);
    return m('div', { class: 'grid gap-3 sm:grid-cols-2' }, [
      canvas('wave', 'Waveform + envelope'),
      canvas('spectrum', 'Spectrum (green = predicted modes, amber = air)'),
    ]);
  },
};

/** Built-in and saved presets, plus the JSON export/import box. */
export const PresetPanel = {
  view({ attrs }) {
    const { builtins, saved, name, json, message } = attrs;
    const { onload, onname, onsave, ondelete, onjson, onimport } = attrs;

    const chip = (label, onclick, onremove) =>
      m('span', { class: 'inline-flex overflow-hidden rounded-md border border-slate-600' }, [
        m(
          'button',
          { class: 'bg-slate-800 px-2.5 py-1 text-sm hover:bg-slate-700', onclick },
          label
        ),
        onremove &&
          m(
            'button',
            {
              class: 'bg-slate-800 px-2 py-1 text-sm text-rose-300 hover:bg-rose-500/20',
              title: 'Delete',
              onclick: onremove,
            },
            m.trust('&times;')
          ),
      ]);

    return m('div', { class: cx(PANEL, 'space-y-3') }, [
      m('div', [
        m('div', { class: cx(LABEL, 'mb-1') }, 'Starting points'),
        m(
          'div',
          { class: 'flex flex-wrap gap-2' },
          builtins.map((preset) => chip(preset.name, () => onload(preset)))
        ),
      ]),
      m('div', [
        m('div', { class: cx(LABEL, 'mb-1') }, 'Saved'),
        saved.length
          ? m(
              'div',
              { class: 'flex flex-wrap gap-2' },
              saved.map((preset) =>
                chip(
                  preset.name,
                  () => onload(preset),
                  () => ondelete(preset.name)
                )
              )
            )
          : m('p', { class: 'text-xs text-slate-500' }, 'Nothing saved yet.'),
      ]),
      m('div', { class: 'flex gap-2' }, [
        m('input', {
          class:
            'flex-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-200',
          placeholder: 'Preset name',
          value: name,
          oninput: (e) => onname(e.target.value),
        }),
        m('button', { class: BTN, onclick: onsave }, 'Save'),
      ]),
      m('div', [
        m('div', { class: cx(LABEL, 'mb-1') }, 'JSON'),
        m('textarea', {
          class:
            'h-40 w-full rounded-md border border-slate-600 bg-slate-800 p-2 font-mono text-[11px] text-slate-200',
          value: json,
          oninput: (e) => onjson(e.target.value),
        }),
        m('div', { class: 'mt-2 flex items-center gap-2' }, [
          m('button', { class: BTN, onclick: onimport }, 'Load from JSON'),
          message && m('span', { class: 'text-xs text-slate-400' }, message),
        ]),
      ]),
    ]);
  },
};
