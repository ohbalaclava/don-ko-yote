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
- Jiuchis (base rhythms) are authored **inline** in the score as **jiuchi sections** — there is no separate jiuchi library. A `{ id, type: 'jiuchi-section', taiko }` marker row (added like a heading/divider) begins a section; the sound lines after it, up to the next heading/divider/jiuchi-section, define one loop of the base rhythm, authored with the marker's own `taiko` symbol set (`piece.activeSymbolSet`). These lines are excluded from the linear melody (`excludeJiuchiSections`) and loop as the base rhythm under the following score until the next jiuchi section. `piece.jiuchiLineMap(lines)` maps each definition line id → its section taiko; `sequence.js` `jiuchiRegions(lines, time)` computes the `{ startDiv, endDiv, events, lengthDiv, taiko }` regions aligned to the main sequence. `settings.metronomeJiuchi` is `'auto'` | a standard jiuchi name | `'inline'` (inline regions; only meaningful when a jiuchi section exists).
- `scoreStore.js` — manages named score persistence. `save()` upserts the current piece; `loadScore(id)` replaces all piece state; `exportJson()` downloads a JSON file (id stripped); `importJson(text)` loads without saving. `init()` patches `piece.setTitle` for 1-second auto-save.
- `db.js` — Promise-based IndexedDB wrapper. Exposes `db.kv` (key-value store with `get`/`set`/`delete`) and `db.scores` / `db.patterns` (collections with `all`/`get`/`save`/`delete`). Items in collections are auto-assigned UUIDs on first save. Adding an object store requires a `DB_VERSION` bump; keep the legacy v1 wipe gated on `oldVersion < 2`. (v4 dropped the old `jiuchis` store.)

### UI layer (`src/components/`)

- `Header.jsx` — title input plus icon buttons: ♩ (score settings), ▲ (metronome settings), ⚙ (app settings), ☰ (menu).
- `Score.jsx` — scrollable list of `Line` components; toolbar with Select/Cancel toggle, undo/redo buttons, and a Save pattern button when sounds are selected; line reordering via SortableJS (`.line-drag-handle`). Renders `AddRowActions` at the foot only as a fallback when no sound line is selected to host it.
- `AddRowActions.jsx` — the contextual "+ Add line / heading / note / divider / jiuchi" toolbar. The `piece.add*` methods insert the new row immediately after the selected line, so it renders inside the selected `Line` (and additions land where the user is working).
- `Line.jsx` — a single horizontal row of `SoundTile` / `LigatureTile` / `GroupTile` components, wrapped in a `.line-block` (one SortableJS reorder child per line) that also hosts `AddRowActions` when the line is selected. SortableJS handles intra/inter-line drag-to-reorder. Shows beat count and a repeat-count badge. Long-pressing a tile (500ms, <5px movement) enters select mode. Runs `measureInstructions()` to lay out instruction labels below tiles in non-overlapping tracks.
- `SoundTile.jsx` — a placed sound card; shows name and hand; beat-boundary dot above tile. Tap to open the inline `SoundEditor` (hand L/R, instruction text, remove). Highlighted when selected.
- `LigatureTile.jsx` — groups two or more consecutive sub-beat sounds of equal duration into a single draggable tile (non-proportional mode only). Each sub-tile can open its own `SoundEditor`.
- `GroupTile.jsx` — a placed pattern (group) card with purple styling; inline editor offers "Expand in place" or remove.
- `Palette.jsx` — sidebar with Sounds and Patterns sections. Tap to add to selected line; drag to any line. `dragBehaviour()` handles the tap-vs-drag distinction (6 px threshold). `PatternPaletteTile` includes a delete button.
- `SettingsModal.jsx` — bottom sheet for app settings (proportional width, font, dark mode, default background image).
- `ScoreSettingsModal.jsx` — bottom sheet for score settings (beats per line, BPM, author, icon image upload).
- `MetronomeSettingsModal.jsx` — bottom sheet for the playback metronome (on/off, head-beat-only, emphasise head, jiuchi, use-Shime, volume). Opened from the ▲ button in `Header`. The jiuchi selector lists `Match score` (auto), the standard jiuchi names, and `Inline` (the score's jiuchi sections; enabled only when one exists). Head-only / emphasise / use-Shime grey out while `Inline` is selected (it plays the authored drum rhythm, not ticks); the jiuchi option buttons themselves stay selectable so the choice is always changeable. `piece.addJiuchiSection` auto-selects `Inline` (a default, not a lock).
- `JiuchiSectionRow.jsx` — the inline `jiuchi-section` marker row: green-styled, with a compact taiko picker constrained to the score's straight/swing time (`taikoGroupsForTime`) and a remove button. Calls `piece.setJiuchiSectionTaiko` / `piece.removeJiuchiSection`.
- `MenuSheet.jsx` — bottom sheet with New, Save, Load, Export/Import score, Export PDF, Clear, Help actions.
- `NewScoreSheet.jsx` — bottom sheet for creating a new score (jiuchi and beats per line).
- `LoadScoreSheet.jsx` — bottom sheet listing saved scores sorted by recency; supports load and delete.
- `HelpSheet.jsx` — bottom sheet with brief usage documentation.

### PDF export (`src/pdf.js`)

Uses jsPDF to generate an A4 portrait PDF. Iterates `piece.lines`, draws each sound as a bordered rectangle with hand (top), name (center, bold), emphasis underline if set, and optional instruction (bottom). Appends a repeat count badge when `line.repeat > 1`. Handles page breaks. Filename is `{piece.title || 'taiko'}.pdf`.

### Audio playback (`src/audio/` + `src/data/sequence.js`)

Plays the score through the Web Audio API. Three layers:

- `data/sequence.js` (pure, unit-tested) — `expandRepeats(lines)` unrolls block-repeat markers (single-line, multi-line, and nested; `count` = total plays) into an ordered list of sound lines; `buildSequence(lines, time)` flattens those into a continuous timed event stream `{ events: [{ soundId, name, hand, volume, startDiv, durationDiv }], totalDiv }` (lines are concatenated — wrapping is purely visual). Rests (`effectiveVolume` null) are included so the playhead can sweep them but carry no volume. `divToSeconds(div, bpm, time)` converts divisions to seconds. `sectionSlice(lines, headingId)` and `blockRepeatSlice(lines, markerId)` return the line subset for scoped playback (a heading-delimited section / a repeat block); both keep internal markers so repeats still apply. `excludeJiuchiSections(lines)` drops jiuchi-section markers and their definition lines from the main melody; `jiuchiRegions(lines, time)` returns the per-section looping base-rhythm regions (`{ startDiv, endDiv, events, lengthDiv, taiko }`) aligned to that main sequence.
- `data/metronome.js` (pure, unit-tested) — the optional playback metronome's beat-grid logic. `JIUCHI_PATTERNS` maps each standard jiuchi to the 1-indexed subdivisions it ticks within a beat; `jiuchiPositions(value, piece)` resolves a `'auto'`/name setting to those subdivisions; `metronomeTicks(totalDiv, time, { positions, headOnly, emphasise })` returns the ordered `{ div, accent }` ticks; `loopEvents(totalDiv, events, lengthDiv)` tiles a captured rhythm across a span (used per-region for inline jiuchi).
- `audio/engine.js` — lazy shared `AudioContext`, and a `voice` object (`strike`, `click`, `tick`) that synthesizes drum hits (pitched body + filtered noise burst; metallic partials for Kane), count-in clicks, and metronome ticks (`tick` plays the Shime TEN sample when enabled and loaded, else a synth click). Timbre comes from `voiceParams(sound, taiko)` (per-taiko base pitch/decay, rim-vs-centre brightness from the syllable, pan from hand, gain from volume). The `voice` object is the swap point for sampled audio later.
- `audio/player.js` — `player` singleton controller. Lookahead scheduler (`setInterval` schedules Web Audio events ahead of `audioContext.currentTime`), plus a rAF loop that drives the playhead highlight (`player.currentSoundId`, read by `SoundTile`/`LigatureTile`) and auto-stops at the end. Playback is a single play↔stop toggle throughout (no pause/resume); `stop()` resets. `resumeAudio()` must run inside the user gesture (the Play button) or mobile browsers stay silent. Optional count-in (one bar, capped at 4 beats) gated on `settings.countIn`. Optional metronome gated on `settings.metronome` — for standard jiuchis `_buildMetroTicks` turns `metronomeTicks` into a scheduled tick list; for `settings.metronomeJiuchi === 'inline'` `_buildInlineStrikes` loops each `jiuchiRegions` region's rhythm with that region's own taiko (per-strike taiko in `_metroStrikes`). Both are drained alongside the main strikes in `_schedule`. Playback is stopped when leaving the score view (`Score.onremove`) and on score load/new/clear.
  - **Scoped playback** — `play(piece, { lines, scope })` plays any subset of lines. `player.scope` (`{ type: 'all' | 'line' | 'section' | 'block', id }`) records what's playing so each button shows the right state (`player.isScope(type, id)`). `toggleScope(piece, lines, scope)` is a play↔stop toggle used by the ▶ on the selected `Line`, on each `SectionHeading` (via `sectionSlice`), and on each multi-line `BlockRepeatRow` (via `blockRepeatSlice`); `toggleAll(piece)` is the whole-piece play/stop toggle for the `Score` toolbar. A single line plays once (its own repeat is ignored); section/block previews apply internal repeats and skip the count-in. Known limitation: a block-repeat spanning a heading yields a partial repeat when played by section.

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

## Versioning

The app version lives in `src/version.js`. **Update it with every change to the app.**

Format is `major.minor`:

- Increment **minor** for normal changes (new features, fixes, UI updates).
- Increment **major** (and reset minor to 0) only for breaking changes — anything that makes existing saved data unreadable or incompatible (e.g. data format changes in IndexedDB schemas or exported JSON).

Current version: `2.3`.

## Adding a new symbol

Use the `/add-symbol` command.

## Adding a new jiuchi

Use the `/add-jiuchi` command.
