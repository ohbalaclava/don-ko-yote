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

- `symbols-high-straight.js` — the master list of sound symbols (`SymbolsSmallStraight` array) and jiuchi type definitions (`JIUCHI` array). Each symbol has `name`, `duration` (number, fraction of a beat), and `hand` (`'L'` or `'R'`). Each jiuchi has `id`, `label`, and `rhythm`.
- `piece.js` — singleton mutable state for the current piece. Shape: `{ title, jiuchi, beatsPerLine, selectedLineId, editingTile, selectMode, selection, lines: [{ id, sounds: [] }] }`. Sounds are either sound objects `{ id, name, hand, duration, instruction }` or group objects `{ id, type: 'group', name, sounds[], duration }`. All mutations go through methods on `piece` (e.g. `piece.addSound`, `piece.moveSound`, `piece.addGroup`, `piece.expandGroup`) which call `m.redraw()`. Select mode tracks `{ lineId, anchorId, soundIds[] }` for anchor-based contiguous range selection.
- `patterns.js` — `patternStore` manages saved patterns via IndexedDB. Methods: `load()`, `save(name, sounds)`, `delete(id)`. `patternStore.items` holds the current list in memory.
- `db.js` — Promise-based IndexedDB wrapper. Exposes `db.kv` (key-value store) and `db.patterns` (collection) with `get`/`set`/`all`/`save`/`delete` methods. Items auto-assigned UUIDs if no `id` present.

### UI layer (`src/components/`)

- `Header.jsx` — title input, jiuchi selector, beats-per-line input, Export PDF button
- `Score.jsx` — renders the list of `Line` components plus an "Add line" button; also manages select mode (toggle button) and saving selections as named patterns
- `Line.jsx` — a single horizontal row of `SoundTile`/`GroupTile` components with a SortableJS instance for intra/inter-line drag-to-reorder; shows beat count and remove button; runs `measureInstructions()` to lay out instruction labels below tiles in non-overlapping tracks
- `SoundTile.jsx` — a placed sound card; shows name, hand, and instruction label below the tile; small dot above tile marks beat boundaries; tap to open an inline editor for hand (L/R), instruction text, and remove; highlighted when selected in select mode
- `GroupTile.jsx` — a placed pattern (group) card with purple styling; shows pattern name, beat count, and sound count; inline editor offers "Expand in place" (replace with individual sounds) or remove
- `Palette.jsx` — sidebar with two sections: Sounds and Patterns; tap a tile to add it to the selected line, or drag it to any line; drag starts after a 6 px movement threshold (handled by `dragBehaviour()`); a ghost label floats during drag and drops to the nearest `[data-line-id]` container on release; PatternPaletteTile includes a delete button

### PDF export (`src/pdf.js`)

Uses jsPDF to generate an A4 portrait PDF. Iterates `piece.lines`, draws each sound as a bordered rectangle with hand (top), name (center, bold), and optional instruction (bottom, small). Handles page breaks. Filename defaults to `{piece.title || 'taiko'}.pdf`. Triggered by the Export PDF button in the header.

### Drag and drop

Two separate mechanisms:
1. **Palette → line**: custom pointer event drag in `Palette.jsx` — after a 6 px threshold, creates a ghost label div, tracks pointermove, on pointerup finds the element under the cursor and reads its `data-line-id`. Tapping (no drag) adds to the currently selected line instead.
2. **Within/between lines**: SortableJS instances on each `.sounds-container[data-line-id]` div, grouped as `'sounds'`. `onEnd` calls `piece.moveSound`.

### Adding a new symbol

Use the `/add-symbol` command.

### Adding a new jiuchi

Use the `/add-jiuchi` command.
