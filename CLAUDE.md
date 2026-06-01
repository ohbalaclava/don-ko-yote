# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Build for production
npm run preview  # Preview production build locally
npm test         # Run unit tests (Vitest)
```

## Architecture

A mobile-first single-page Mithril.js app for creating taiko drum sheet music and exporting it as PDF. No routing.

**Framework quirk:** JSX is configured to use Mithril's `m` as the factory (not React). See `vite.config.js`. Components use `m(Component, attrs)` syntax or JSX that compiles to `m(...)`. Lifecycle hooks are `oncreate`, `onupdate`, `onremove` — not React equivalents.

### App navigation

`main.jsx` renders one of two views based on the `scoreActive` flag:

- **Home screen** (`!scoreActive`) — logo, New score / Load score / Import score buttons, and a gear button to open app settings.
- **Score view** (`scoreActive`) — `Header` + `Score` + `Palette`, with modal overlays managed by `main.jsx`.

### Data layer (`src/data/`)

- `symbols.js` — master list of sound symbols (`SYMBOLS` array) and jiuchi type definitions (`JIUCHI` array). Each symbol has `name`, `duration` (fraction of a beat), and `hand` (`'L'` or `'R'`). Each jiuchi has `id`, `label`, and `rhythm`.
- `piece.js` — singleton mutable state for the current piece. Shape: `{ id, title, jiuchi, beatsPerLine, bpm, author, icon, selectedLineId, editingTile, selectMode, selection, lines: [{ id, sounds: [], repeat: number }] }`. Sounds are either sound objects `{ id, name, hand, duration, instruction }` or group objects `{ id, type: 'group', name, sounds[], duration }`. All mutations go through methods on `piece` (e.g. `piece.addSound`, `piece.moveSound`, `piece.addGroup`, `piece.expandGroup`) which push to history and call `m.redraw()`. Select mode tracks `{ lineId, anchorId, soundIds[] }` for anchor-based contiguous range selection.
- `history.js` — linear undo/redo stack (max 32 entries). `history.push(state)` truncates future entries. `history.undo()` / `history.redo()` return the state to restore, or `null`.
- `settings.js` — singleton for app-level preferences (`proportionalWidth`, `font`, `darkMode`, `defaultBackground`). Persisted to IndexedDB via `db.kv`. `settings.set(key, value)` persists and redraws. `defaultBackground` is a data URL that serves as a fallback when a score has no background image set.
- `patterns.js` — `patternStore` manages saved patterns via IndexedDB. Methods: `load()`, `save(name, sounds)`, `delete(id)`. `patternStore.items` holds the current list in memory.
- `scoreStore.js` — manages named score persistence. `save()` upserts the current piece; `loadScore(id)` replaces all piece state; `exportJson()` downloads a JSON file (id stripped); `importJson(text)` loads without saving. `init()` patches `piece.setTitle` for 1-second auto-save.
- `db.js` — Promise-based IndexedDB wrapper. Exposes `db.kv` (key-value store with `get`/`set`/`delete`) and `db.scores` / `db.patterns` (collections with `all`/`get`/`save`/`delete`). Items in collections are auto-assigned UUIDs on first save.

### UI layer (`src/components/`)

- `Header.jsx` — title input plus three icon buttons: ♩ (score settings), ⚙ (app settings), ☰ (menu).
- `Score.jsx` — scrollable list of `Line` components; toolbar with Select/Cancel toggle, undo/redo buttons, and a Save pattern button when sounds are selected; line reordering via SortableJS (`.line-drag-handle`).
- `Line.jsx` — a single horizontal row of `SoundTile` / `LigatureTile` / `GroupTile` components. SortableJS handles intra/inter-line drag-to-reorder. Shows beat count and a repeat-count badge. Long-pressing a tile (500ms, <5px movement) enters select mode. Runs `measureInstructions()` to lay out instruction labels below tiles in non-overlapping tracks.
- `SoundTile.jsx` — a placed sound card; shows name and hand; beat-boundary dot above tile. Tap to open the inline `SoundEditor` (hand L/R, instruction text, remove). Highlighted when selected.
- `LigatureTile.jsx` — groups two or more consecutive sub-beat sounds of equal duration into a single draggable tile (non-proportional mode only). Each sub-tile can open its own `SoundEditor`.
- `GroupTile.jsx` — a placed pattern (group) card with purple styling; inline editor offers "Expand in place" or remove.
- `Palette.jsx` — sidebar with Sounds and Patterns sections. Tap to add to selected line; drag to any line. `dragBehaviour()` handles the tap-vs-drag distinction (6 px threshold). `PatternPaletteTile` includes a delete button.
- `SettingsModal.jsx` — bottom sheet for app settings (proportional width, font, dark mode, default background image).
- `ScoreSettingsModal.jsx` — bottom sheet for score settings (beats per line, BPM, author, icon image upload).
- `MenuSheet.jsx` — bottom sheet with New, Save, Load, Export/Import score, Export PDF, Clear, Help actions.
- `NewScoreSheet.jsx` — bottom sheet for creating a new score (jiuchi and beats per line).
- `LoadScoreSheet.jsx` — bottom sheet listing saved scores sorted by recency; supports load and delete.
- `HelpSheet.jsx` — bottom sheet with brief usage documentation.

### PDF export (`src/pdf.js`)

Uses jsPDF to generate an A4 portrait PDF. Iterates `piece.lines`, draws each sound as a bordered rectangle with hand (top), name (center, bold), emphasis underline if set, and optional instruction (bottom). Appends a repeat count badge when `line.repeat > 1`. Handles page breaks. Filename is `{piece.title || 'taiko'}.pdf`.

### Audio playback (`src/audio/` + `src/data/sequence.js`)

Plays the score through the Web Audio API. Three layers:

- `data/sequence.js` (pure, unit-tested) — `expandRepeats(lines)` unrolls block-repeat markers (single-line, multi-line, and nested; `count` = total plays) into an ordered list of sound lines; `buildSequence(lines, time)` flattens those into a continuous timed event stream `{ events: [{ soundId, name, hand, volume, startDiv, durationDiv }], totalDiv }` (lines are concatenated — wrapping is purely visual). Rests (`effectiveVolume` null) are included so the playhead can sweep them but carry no volume. `divToSeconds(div, bpm, time)` converts divisions to seconds. `sectionSlice(lines, headingId)` and `blockRepeatSlice(lines, markerId)` return the line subset for scoped playback (a heading-delimited section / a repeat block); both keep internal markers so repeats still apply.
- `audio/engine.js` — lazy shared `AudioContext`, and a `voice` object (`strike`, `click`) that synthesizes drum hits (pitched body + filtered noise burst; metallic partials for Kane) and count-in clicks. Timbre comes from `voiceParams(sound, taiko)` (per-taiko base pitch/decay, rim-vs-centre brightness from the syllable, pan from hand, gain from volume). The `voice` object is the swap point for sampled audio later.
- `audio/player.js` — `player` singleton controller. Lookahead scheduler (`setInterval` schedules Web Audio events ahead of `audioContext.currentTime`), plus a rAF loop that drives the playhead highlight (`player.currentSoundId`, read by `SoundTile`/`LigatureTile`) and auto-stops at the end. `toggle()` plays / pauses (via `AudioContext.suspend`) / resumes; `stop()` resets. `resumeAudio()` must run inside the user gesture (the Play button) or mobile browsers stay silent. Optional count-in (one bar, capped at 4 beats) gated on `settings.countIn`. Playback is stopped when leaving the score view (`Score.onremove`) and on score load/new/clear.
  - **Scoped playback** — `play(piece, { lines, scope })` plays any subset of lines. `player.scope` (`{ type: 'all' | 'line' | 'section' | 'block', id }`) records what's playing so each button shows the right state (`player.isScope(type, id)`). `toggleScope(piece, lines, scope)` is a play↔stop toggle used by the ▶ on the selected `Line`, on each `SectionHeading` (via `sectionSlice`), and on each multi-line `BlockRepeatRow` (via `blockRepeatSlice`); `toggleAll(piece)` is the whole-piece play/pause for the `Score` toolbar. A single line plays once (its own repeat is ignored); section/block previews apply internal repeats and skip the count-in. Known limitation: a block-repeat spanning a heading yields a partial repeat when played by section.

### Drag and drop

Two separate mechanisms:

1. **Palette → line**: custom pointer-event drag in `Palette.jsx` — after a 6 px threshold, creates a ghost label div, tracks `pointermove`, on `pointerup` finds the element under the cursor and reads its `data-line-id`. Tapping (no drag) adds to the currently selected line instead.
2. **Within/between lines**: SortableJS instances on each `.sounds-container[data-line-id]` div, grouped as `'sounds'`. `onEnd` calls `piece.moveSound` / `piece.moveSounds`. A `domIndexToDataIndex()` helper maps DOM drop indices to data indices accounting for multi-sound `LigatureTile`s.
3. **Line reordering**: SortableJS instance in `Score.jsx` on `.lines-container`, using `.line-drag-handle` as the drag handle. `onEnd` calls `piece.reorderLine`.

## Testing

Tests live in `tests/` at the project root. Use Vitest (`npm test`). Use `fake-indexeddb` for IndexedDB-dependent tests (see `tests/db.test.js`). Import source files with relative paths from `tests/`, e.g. `../src/data/piece.js`.

Write tests for non-trivial pure logic in the data layer. UI components generally don't need unit tests — exercise them manually via the dev server.

## Code style

- **Comments**: Add JSDoc (`/** ... */`) to non-trivial functions — document parameters, return values, and any non-obvious behaviour. Skip trivial one-liner setters. Use inline `//` comments only for constraints or invariants that would surprise a reader.
- **No unused code**: Remove dead code rather than commenting it out.

## Adding a new symbol

Use the `/add-symbol` command.

## Adding a new jiuchi

Use the `/add-jiuchi` command.
