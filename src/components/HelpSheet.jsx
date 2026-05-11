import m from 'mithril';

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
              <div class="flex items-center justify-between mb-2">
                <h2 class="text-xl font-bold dark:text-white">How to use</h2>
                <button
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
                  onclick={onClose}
                >
                  ×
                </button>
              </div>

              <Section title="Sounds palette">
                <Row label="Tap a sound" desc="Adds it to the end of the selected line." />
                <Row label="Drag a sound" desc="Drop it onto any line to add it there." />
                <Row
                  label="Tap a pattern"
                  desc="Adds the pattern as a group tile on the selected line."
                />
              </Section>

              <Section title="Lines">
                <Row label="Tap a line" desc="Selects it — new sounds are added here." />
                <Row label="Drag ⠿" desc="Reorder lines by dragging the grip handle." />
                <Row label="⊕" desc="Duplicate a line, inserting the copy below." />
                <Row label="✕" desc="Remove the line and all its sounds." />
              </Section>

              <Section title="Tiles">
                <Row
                  label="Tap a tile"
                  desc="Opens the inline editor: change hand (L/R), add an instruction, or remove."
                />
                <Row
                  label="Drag a tile"
                  desc="Reorder within a line or move to another line. Blocked if the target line is full."
                />
              </Section>

              <Section title="Select mode">
                <Row
                  label="Select button"
                  desc="Enter select mode. Tap tiles to define a contiguous range."
                />
                <Row
                  label="Save pattern"
                  desc="Saves the selected tiles as a named pattern in the palette."
                />
              </Section>

              <Section title="Beats per line">
                <Row
                  label="Limit"
                  desc="Set in ♩ Score settings. Sounds that would overflow are automatically wrapped to the next line."
                />
                <Row
                  label="0 = unlimited"
                  desc="No limit is applied when beats per line is set to 0."
                />
              </Section>

              <Section title="Score settings ♩">
                <Row label="Jiuchi" desc="The rhythmic structure (displayed in the header)." />
                <Row label="Beats per line" desc="Maximum beats before wrapping to a new line." />
                <Row label="BPM" desc="Tempo in beats per minute." />
                <Row label="Author" desc="Composer name, included in exports." />
                <Row label="Icon" desc="Upload an image displayed in the score." />
              </Section>

              <Section title="App settings ⚙">
                <Row label="Font" desc="Typeface used for tile names and the score title." />
                <Row label="Proportional tiles" desc="Tile width reflects its beat duration." />
                <Row label="Dark mode" desc="Switch between light and dark themes." />
              </Section>

              <Section title="Menu ☰">
                <Row label="New" desc="Start a fresh score, choosing jiuchi and beats per line." />
                <Row label="Save / Load" desc="Persist scores to browser storage." />
                <Row
                  label="Export / Import score"
                  desc="Download or upload a score as a portable JSON file."
                />
                <Row label="Export PDF" desc="Generate a printable A4 PDF of the score." />
                <Row label="Clear" desc="Remove all sounds from the current score." />
              </Section>
            </div>
          </div>
        </div>
      );
    },
  };
}
