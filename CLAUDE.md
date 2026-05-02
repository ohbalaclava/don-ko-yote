# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Build for production
npm run preview  # Preview production build locally
```

No tests or linter configured.

## Architecture

A mobile-first single-page Mithril.js app for creating taiko drum sheet music and exporting it as PDF. No routing.

**Framework quirk:** JSX is configured to use Mithril's `m` as the factory (not React). See `vite.config.js`. Components use `m(Component, attrs)` syntax or JSX that compiles to `m(...)`. Lifecycle hooks are `oncreate`, `onupdate`, `onremove` — not React equivalents.

### Data layer (`src/data/`)

- `symbols.js` — the master list of sound symbols (`SYMBOLS` array) and jiuchi type definitions (`JIUCHI` array). Each symbol has `name`, `duration` (number, fraction of a beat), and `hand` (`'L'` or `'R'`). Each jiuchi has `id`, `label`, and `rhythm`.
- `piece.js` — singleton mutable state for the current piece. Shape: `{ title, jiuchi, beatsPerLine, lines: [{ id, sounds: [{ id, name, hand, duration, instruction }] }] }`. All mutations go through methods on `piece` (e.g. `piece.addSound`, `piece.moveSound`) which call `m.redraw()`.

### UI layer (`src/components/`)

- `Header.jsx` — title input, jiuchi selector, beats-per-line input, Export PDF button
- `Score.jsx` — renders the list of `Line` components plus an "Add line" button
- `Line.jsx` — a single horizontal row of `SoundTile` components with a SortableJS instance for intra/inter-line drag-to-reorder; shows beat count and remove button
- `SoundTile.jsx` — a placed sound card; tap to open an inline editor for hand (L/R), instruction text, and remove. Module-level `editing` variable tracks the currently open tile.
- `Palette.jsx` — grid of draggable sound tiles; uses pointer events to create a floating ghost on drag and drops into the nearest `[data-line-id]` container on release

### PDF export (`src/pdf.js`)

Uses jsPDF to generate an A4 portrait PDF. Iterates `piece.lines`, draws each sound as a bordered rectangle with hand, name, and optional instruction. Triggered by the Export PDF button in the header.

### Drag and drop

Two separate mechanisms:
1. **Palette → line**: custom pointer event drag in `Palette.jsx` — creates a ghost div, tracks pointermove, on pointerup finds the element under the cursor and reads its `data-line-id`.
2. **Within/between lines**: SortableJS instances on each `.sounds-container[data-line-id]` div, grouped as `'sounds'`. `onEnd` calls `piece.moveSound`.

### Adding a new symbol

Use the `/add-symbol` command.

### Adding a new jiuchi

Use the `/add-jiuchi` command.
