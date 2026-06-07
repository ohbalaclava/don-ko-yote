import m from 'mithril';
import { VERSION } from '../version.js';

function Section() {
  return {
    view({ attrs: { title }, children }) {
      return (
        <div class="py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
            {title}
          </h3>
          <div class="flex flex-col gap-1.5">{children}</div>
        </div>
      );
    },
  };
}

function Row() {
  return {
    view({ attrs: { label, desc } }) {
      return (
        <div class="flex gap-3 text-sm">
          <span class="shrink-0 font-medium dark:text-white w-28">{label}</span>
          <span class="text-gray-500 dark:text-gray-400">{desc}</span>
        </div>
      );
    },
  };
}

export function HelpSheet() {
  return {
    view({ attrs: { onClose } }) {
      return (
        <div class="fixed inset-0 z-40 bg-black/50 flex flex-col justify-end" onclick={onClose}>
          <div
            class="bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onclick={(e) => e.stopPropagation()}
          >
            <div class="flex justify-center pt-3 pb-1">
              <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            </div>

            <div class="px-5 pb-8">
              <div class="py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-baseline gap-2">
                    <span class="text-lg font-bold dark:text-white">kuchi·shoga</span>
                    <span class="text-sm text-gray-400 dark:text-gray-500">v{VERSION}</span>
                  </div>
                  <button
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                    onclick={onClose}
                  >
                    ×
                  </button>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  A mobile-first app for composing taiko drum sheet music using kuchi shoga
                  syllables, with audio playback and PDF export.
                </p>
                <a
                  href="mailto:dev@disnae.org"
                  class="text-sm text-indigo-600 dark:text-indigo-400"
                >
                  dev@disnae.org
                </a>
              </div>

              <div class="pt-4 mb-2">
                <h2 class="text-xl font-bold dark:text-white">How to use</h2>
              </div>

              <Section title="Sounds palette">
                <Row label="Tap a sound" desc="Adds it to the end of the selected line." />
                <Row label="Drag a sound" desc="Drop it onto any line to add it there." />
                <Row
                  label="Tap a pattern"
                  desc="Adds the pattern expanded into individual tiles on the selected line."
                />
              </Section>

              <Section title="Lines">
                <Row
                  label="Tap a line"
                  desc="Selects it — new sounds are added here and a ▶ play button appears."
                />
                <Row
                  label="▶ (line)"
                  desc="Preview the selected line once, ignoring its repeat count."
                />
                <Row label="Drag ⠿" desc="Reorder lines by dragging the grip handle." />
                <Row label="✕" desc="Remove the line and all its sounds." />
              </Section>

              <Section title="Tiles">
                <Row
                  label="Tap a tile"
                  desc="Opens the inline editor: hand (L/B/R), instruction text, accent, volume, duration, ligature join, and remove."
                />
                <Row
                  label="Long-press"
                  desc="Hold a tile for half a second to enter tile select mode with that tile pre-selected."
                />
                <Row label="Drag a tile" desc="Reorder within a line or move to another line." />
              </Section>

              <Section title="Select — tiles">
                <Row
                  label="Tiles button"
                  desc="Enter tile select mode. Tap tiles to build a contiguous selection."
                />
                <Row
                  label="Save pattern"
                  desc="Save the selected tiles as a named pattern in the palette."
                />
              </Section>

              <Section title="Select — lines">
                <Row
                  label="Lines button"
                  desc="Enter line select mode. Tap any row (lines, headings, notes) to select it."
                />
                <Row label="Duplicate" desc="Insert copies of the selected rows below." />
                <Row
                  label="Repeat"
                  desc="Wrap the selected rows in a repeat block. The block plays that many times during playback and PDF export."
                />
                <Row label="Delete" desc="Remove the selected rows." />
              </Section>

              <Section title="Repeats">
                <Row
                  label="Single-line"
                  desc="A ×N badge appears inline on a line inside a single-row repeat block. Use − and + to change the count. Tapping − when count is 2 removes the repeat."
                />
                <Row
                  label="Block repeat row"
                  desc="An orange row spans a multi-line repeat block. Use − / + to adjust the count and ▶ to preview the block."
                />
              </Section>

              <Section title="Structure rows">
                <Row
                  label="+ Add heading"
                  desc="Tap to edit the name. The ▶ button previews all lines between this heading and the next."
                />
                <Row label="+ Add note" desc="Free-text annotation that appears between lines." />
                <Row label="+ Add divider" desc="Visual separator between sections." />
                <Row
                  label="Drag ⠿"
                  desc="All row types can be reordered by dragging their grip handle."
                />
              </Section>

              <Section title="Playback">
                <Row label="▶ (toolbar)" desc="Play the whole piece. Tap again (⏹) to stop." />
                <Row
                  label="▶ (line)"
                  desc="Preview the selected line. Shown on the right when a line is selected."
                />
                <Row label="▶ (heading)" desc="Preview the section beneath this heading." />
                <Row
                  label="▶ (repeat block)"
                  desc="Preview the repeated block with its repeats applied."
                />
              </Section>

              <Section title="Metronome ▲">
                <Row
                  label="Metronome"
                  desc="Play a beat track alongside the score during playback. Opened from the ▲ button in the header."
                />
                <Row
                  label="Head beat only"
                  desc="Tick once per beat instead of on every subdivision."
                />
                <Row label="Emphasise head" desc="Accent the start of each beat." />
                <Row
                  label="Jiuchi"
                  desc="Which subdivisions to tick when not head-only. 'Match score' follows the piece's jiuchi."
                />
                <Row
                  label="Use Shime sound"
                  desc="Tick with the Shime TEN sample instead of a synth click."
                />
                <Row label="Volume" desc="Level of the metronome track." />
              </Section>

              <Section title="Editor">
                <Row label="⌫" desc="Delete the last tile on the selected line." />
                <Row
                  label="↺ / ↻"
                  desc="Undo and redo. Backspace also undoes when focus is not in a text field."
                />
              </Section>

              <Section title="Beats per line">
                <Row
                  label="Limit"
                  desc="Set in ♩ Score settings. Sounds that would overflow are automatically wrapped to the next line."
                />
              </Section>

              <Section title="Score settings ♩">
                <Row label="Beats per line" desc="Maximum beats before wrapping to a new line." />
                <Row label="BPM" desc="Tempo used for playback." />
                <Row
                  label="Use volume"
                  desc="Show per-tile volume controls and play with accents."
                />
                <Row label="Author" desc="Composer name, included in exports." />
                <Row label="Version" desc="Version label, included in exports." />
                <Row label="Background" desc="Upload an image displayed in the score." />
              </Section>

              <Section title="App settings ⚙">
                <Row label="Proportional tiles" desc="Tile width reflects its beat duration." />
                <Row label="Font" desc="Typeface used for tile names and the score title." />
                <Row label="Dark mode" desc="Switch between light and dark themes." />
                <Row label="Count-in" desc="Play one bar of click sounds before playback begins." />
                <Row
                  label="Use volume (default)"
                  desc="Whether new scores start with volume mode on."
                />
                <Row label="Author (default)" desc="Pre-fill the author field on new scores." />
                <Row
                  label="Background (default)"
                  desc="Default background image applied to new scores."
                />
              </Section>

              <Section title="Menu ☰">
                <Row
                  label="New"
                  desc="Start a fresh score: choose a taiko, jiuchi, BPM, and beats per line."
                />
                <Row label="Save / Load" desc="Persist scores to browser storage." />
                <Row
                  label="Export"
                  desc="Download the score as a printable A4 PDF or as a portable JSON file."
                />
                <Row label="Import" desc="Load a score or pattern library from a JSON file." />
                <Row label="Clear" desc="Remove all sounds from the current score." />
              </Section>
            </div>
          </div>
        </div>
      );
    },
  };
}
