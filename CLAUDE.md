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

**Framework quirk:** Views are written in Mithril hyperscript (`m('div', attrs, children)` / `m(Component, attrs)`) — no JSX, no build-time JSX transform. Lifecycle hooks are `oncreate`, `onupdate`, `onremove` — not React equivalents. Component files keep the `.jsx` extension but contain no JSX.

### App navigation

`main.jsx` renders one of two views based on the `scoreActive` flag:

- **Home screen** (`!scoreActive`) — logo, New score / Load score / Import score buttons, and a gear button to open app settings.
- **Score view** (`scoreActive`) — `Header` + `Score` + `Palette`, with modal overlays managed by `main.jsx`.

### Parts, systems and lanes (ensemble scores)

A score is written for one or more **parts** — the drums playing side by side, one notation row each, read as a conductor's score (beat N of every part in the same column). Every score goes through this one code path: a solo score is simply a score with one part, and it renders exactly as the app always has.

- `piece.parts` — ordered top → bottom, `[{ id, name, taiko, setId, volume, muted }]`. `name` is optional (the taiko shows instead); `muted` is part of the arrangement and is saved.
- `piece.sets` — `[{ id, name }]`, a **taiko set**: the drums one person plays. A part carries an optional `setId`; consecutive parts sharing one are linked by a bracket carrying the player's name. A set only survives while a part references it (`_normaliseParts`).
- A sound row in `piece.lines` is a **system**: `{ id, lanes: [{ id, partId, sounds: [] }] }`. The system keeps the **legacy line id**, so `block-repeat.lineIds`, `jiuchiLineMap` and every structural helper (`markerDepth`, `lineDepth`, `singleLineRepeatMap`, `jiuchiSectionSpan`) keep their meaning: a repeat or a jiuchi section covers a whole system, across all parts. A system carries **no `type`**, so `isSoundLine` is unchanged.
- A **lane** is exactly the pre-ensemble line object plus `partId`. `data-line-id` is a lane id, and `piece.selectedLineId`, `piece.selection.lineId`, `editingTile.lineId`, `addSound` / `moveSound(s)` / `removeSound` / `updateSound` / `addGroup` all address lanes.

Two invariants:

1. **One lane per part per system, in `piece.parts` order** (`piece._normaliseSystems`, `migrate.js` `normaliseSystems`). Adding a part pushes a lane onto every system; removing one drops its lanes. The exception is a jiuchi-section _definition_ system, which carries a single `{ partId: null }` lane and takes its drum from the section marker.
2. **`piece.taiko === piece.parts[0].taiko`** — maintained by `setTaiko` and the part mutators. `piece.taiko` stays a persisted scalar because it also encodes straight/swing (the `symbolSet` / `time` / jiuchi pairing) and keeps an exported score readable by an older app version.

**Ensemble-ness is derived, never stored:** `piece.parts.length > 1`. There is no layout flag and no mode for the user to pick.

Helpers (all exported from `piece.js`, reused by `sequence.js`, `pdf.js`, `player.js` and the components): `lanesOf(row)` (tolerates a legacy `{ id, sounds }` row, which is what makes migration and the older test fixtures forgiving), `findLane(lines, laneId)` → `{ system, lane, systemIdx, laneIdx }`, `laneFor(system, partId)`, `laneDur(lane)`, `systemSpan(system)`. Drum resolution is `piece.taikoForLane(laneId)`: a jiuchi definition lane takes the section taiko, otherwise its part's.

Part mutators: `addPart`, `removePart` (refuses the last part), `reorderPart`, `setPartTaiko`, `setPartName`, `setPartVolume` / `setPartVolumeLive`, `togglePartMute`, `assignPartToSet`, `addSet`, `setSetName`, `removeSet`. A new score is solo or an ensemble of N identical parts (the Solo / Ensemble choice in `NewScoreSheet`, via `piece.reset({ parts })`); further parts are added here or from `+ part` at the foot of the score.

### Data layer (`src/data/`)

- `symbols.js` — master list of sound symbols (`SYMBOLS` array) and jiuchi type definitions (`JIUCHI` array). Each symbol has `name`, `duration` (fraction of a beat), and `hand` (`'L'` or `'R'`). Each jiuchi has `id`, `label`, and `rhythm`.
- `piece.js` — singleton mutable state for the current piece. Shape: `{ id, title, format, taiko, jiuchi, beatsPerLine, bpm, author, icon, showVolume, metronome, metronomeHeadOnly, metronomeEmphasiseHead, metronomeJiuchi, metronomeShime, metronomeVolume, selectedLineId, editingTile, selectMode, selection, parts: [], sets: [], lines: [{ id, lanes: [{ id, partId, sounds: [] }], repeat: number }] }` — see **Parts, systems and lanes** above for the row shape. The `metronome*` fields are the per-score metronome config (see `PERSISTED_FIELDS`). Sounds are sound objects `{ id, name, hand, duration, instruction }`. All mutations go through methods on `piece` (e.g. `piece.addSound`, `piece.moveSound`, `piece.addPart`) which push to history and call `m.redraw()`; the sound mutators take a **lane** id. Select mode tracks `{ lineId, anchorId, soundIds[] }` (a lane id) for anchor-based contiguous range selection.
- `history.js` — linear undo/redo stack (max 32 entries). `history.push(state)` truncates future entries. `history.undo()` / `history.redo()` return the state to restore, or `null`.
- `settings.js` — singleton for app-level preferences (`proportionalWidth`, `font`, `darkMode`, `defaultBackground`, `defaultAuthor`, `defaultShowVolume`, `countIn`, master `volume`). Persisted to IndexedDB via `db.kv`. `settings.set(key, value)` persists and redraws. `defaultBackground` is a data URL that serves as a fallback when a score has no background image set. Metronome config is **not** here — it is stored per-score on `piece`.
- `patterns.js` — `patternStore` manages saved patterns via IndexedDB. Methods: `load()`, `save(name, sounds)`, `delete(id)`. `patternStore.items` holds the current list in memory.
- Jiuchis (base rhythms) are authored **inline** in the score as **jiuchi sections** — there is no separate jiuchi library. A `{ id, type: 'jiuchi-section', taiko }` marker row (added like a heading/divider) begins a section; the sound lines after it, up to the next heading/divider/jiuchi-section, define one loop of the base rhythm, authored with the marker's own `taiko` symbol set (`piece.activeSymbolSet`). These lines are excluded from the linear melody (`excludeJiuchiSections`) and loop as the base rhythm under the following score until the next jiuchi section. `piece.jiuchiLineMap(lines)` maps each definition line id → its section taiko; `sequence.js` `jiuchiRegions(lines, time)` computes the `{ startDiv, endDiv, events, lengthDiv, taiko }` regions aligned to the main sequence. `piece.metronomeJiuchi` (per-score) is `'auto'` | `'inline'` (inline regions; only meaningful when a jiuchi section exists); legacy named-jiuchi values are normalised to `'auto'` in `loadFromData`.
- `scoreStore.js` — manages named score persistence. `save()` upserts the current piece; `loadScore(id)` replaces all piece state; `exportJson()` downloads a JSON file (id stripped); `importJson(text)` loads without saving. `init()` patches `piece.setTitle` for 1-second auto-save.
- `migrate.js` — load-time migration, idempotent and run by every `scoreStore` load path. `migrateScore(source)` → `{ parts, sets, lines }`: a record with `format < 2` or no `parts` gets one part from `source.taiko` and each legacy `{ id, sounds }` row wrapped in a one-lane system **keeping its id** (the lane gets a fresh one, since nothing persisted names a lane); `normaliseSystems` then enforces invariant 1. `expandGroupsInLines` still expands the removed group tiles. `legacyMirror(lines)` adds part 0's `sounds` array beside each system's `lanes` for **exported JSON only**, so a 2.x app reads a usable single-drum score — never written to IndexedDB, since an old → new round-trip through it would drop the other parts. The record is versioned by `format` (now `2`); `db.js`'s `DB_VERSION` does not move, because no object store changed.
- `db.js` — Promise-based IndexedDB wrapper. Exposes `db.kv` (key-value store with `get`/`set`/`delete`) and `db.scores` / `db.patterns` (collections with `all`/`get`/`save`/`delete`). Items in collections are auto-assigned UUIDs on first save. Adding an object store requires a `DB_VERSION` bump; keep the legacy v1 wipe gated on `oldVersion < 2`. (v4 dropped the old `jiuchis` store.)

### UI layer (`src/components/`)

- `Header.jsx` — title input plus icon buttons: ♩ (score settings), ▲ (metronome settings), ⚙ (app settings), ☰ (menu).
- `Score.jsx` — the toolbar (Select/Cancel toggle, BPM stepper, play-all, undo/redo, Save pattern when sounds are selected) plus the scrollable list of `System` components, reordered by SortableJS (`.line-drag-handle`) with a FLIP slide. The toolbar sits outside `.score-scroll`, which is the **one scroller** for the score body: vertical as always, and horizontal so an ensemble's lanes can run wider than the viewport while every system shares one `scrollLeft` — which is what keeps the beat columns aligned down the page and lets the part gutter stick to the left edge. Renders `AddRowActions` at the foot only as a fallback when no lane is selected to host it, and a `+ part` button at the foot of the gutter when the score is an ensemble.
- `AddRowActions.jsx` — the contextual "+ Line / Heading / Note / Divider / Jiuchi" toolbar. The `piece.add*` methods insert the new row immediately after the selected lane's **system**, so it renders inside the selected `System` (and additions land where the user is working).
- `System.jsx` — one score row: the lanes of that system stacked over a shared beat grid, wrapped in a `.line-block` (one SortableJS reorder child per row) that also hosts `AddRowActions` when a lane of it is selected. A **solo score renders the pre-ensemble single-lane row verbatim** — drag handle, lane, trailing beat-count / play / remove column — and the ensemble layout only appears once a second part exists: a sticky-left gutter (handle, remove) plus a sticky part-label column per lane carrying the part name (only when named), a `taikoSelect` drum picker (`piece.setPartTaiko`, choices from `taikoGroupsForTime(piece.time)`, so the drum is changeable without opening score settings), the set bracket and name, the beat count and per-part M (mute) / S (solo) buttons. `rowStyling()` is split out so the sticky gutter cells can repaint the row tint behind themselves.
- `Lane.jsx` — one part's horizontal row of `SoundTile` / `LigatureTile` components (`.sounds-container[data-line-id=<laneId>]`). SortableJS handles intra/inter-lane drag-to-reorder; `laneGroupName(lane)` puts each part in its **own** drop group (`sounds-<partId>`) so a sound cannot be dropped into another part's lane — a different drum means a different symbol set. An `aligned` lane (the ensemble layout) never wraps and is always fixed-width-per-division, which is what makes a tile's width exactly `duration × 2rem` and so puts beat N of every part in the same column. Long-pressing a tile (500ms, <5px movement) enters select mode. Runs `measureInstructions()` to lay out instruction labels below tiles in non-overlapping tracks.
- `SoundTile.jsx` — a placed sound card; shows name and hand; beat-boundary dot above tile. Tap to open the inline `SoundEditor` (hand L/R, instruction text, remove). Highlighted when selected.
- `LigatureTile.jsx` — groups two or more consecutive sub-beat sounds of equal duration into a single draggable tile (non-proportional mode only). Each sub-tile can open its own `SoundEditor`.
- `Palette.jsx` — sidebar with Sounds and Patterns sections. Tap to add to the selected lane; drag to a lane. Each tile container is a SortableJS **clone source** in the selected lane's drop group (`makeCloneSource` / `syncCloneGroup`), so a palette drag gets the same gap-opening animation as in-score reordering and can only land in a lane of the selected part. `PatternPaletteTile` includes a delete button.
- `SettingsModal.jsx` — bottom sheet for app settings (proportional width, font, dark mode, default background image).
- `ScoreSettingsModal.jsx` — bottom sheet for score settings (parts, beats per line, BPM, author, version, use-volume, background image upload). Hosts `PartsSection`.
- `PartsSection.jsx` — the Parts editor inside score settings: the ordered list of parts with name, taiko picker (`taikoGroupsForTime(piece.time)`), taiko-set assignment (`New player` creates a set and assigns it in one gesture), volume, mute, solo, reorder and remove, plus `+ Add part` and rename fields for the sets in use. This is where a solo score grows its second part — and part 0's drum is set here too.
- `MetronomeSettingsModal.jsx` — bottom sheet for the playback metronome (on/off, count-in, head-beat-only, emphasise head, jiuchi, use-Shime, volume). These read/write the **per-score** `piece.metronome*` fields via `piece.setMetronome` (not global settings), except the count-in toggle, which is the app-level `settings.countIn`. Opened from the ▲ button in `Header`. A `Play custom jiuchi` toggle switches `metronomeJiuchi` between `'auto'` (tick the score's jiuchi) and `'inline'` (loop the score's jiuchi sections as drum rhythms); it is disabled only when the score has no jiuchi section _and_ the toggle is off, so a stale `'inline'` stays switchable. Head-only / emphasise / use-Shime grey out while inline is selected (it plays the authored drum rhythm, not ticks). `piece.addJiuchiSection` auto-selects inline (a default, not a lock). Also hosts the standalone practice loop in its own card (session-only source/BPM on the player): one `Source` dropdown offers a tick, drum strikes on any taiko, or — in a `Custom jiuchi` optgroup — any of the score's jiuchi sections plus an `All sections` entry (shown with two or more), since a section brings its own taiko and so replaces the voice choice rather than combining with it.
- `JiuchiSectionRow.jsx` — the inline `jiuchi-section` marker row: green-styled, with a compact taiko picker constrained to the score's straight/swing time (`taikoGroupsForTime`) and a remove button. Calls `piece.setJiuchiSectionTaiko` / `piece.removeJiuchiSection`.
- `MenuSheet.jsx` — bottom sheet with New, Save, Load, Export/Import score, Export PDF, Clear, Help actions.
- `NewScoreSheet.jsx` — bottom sheet for creating a new score (taiko, jiuchi, BPM and beats per line). It opens with a **Solo / Ensemble** choice; Ensemble reveals a part count (2-`MAX_NEW_PARTS`) and every part starts on the chosen taiko, so drums, names and sets are refined afterwards in `PartsSection`.
- `LoadScoreSheet.jsx` — bottom sheet listing saved scores sorted by recency; supports load and delete.
- `HelpSheet.jsx` — bottom sheet with brief usage documentation.

### PDF export (`src/pdf.js`)

Uses jsPDF to generate an A4 portrait PDF. Iterates `piece.lines`, draws each sound with its name (centre, bold), emphasis underline if set, hand/volume below and an optional instruction label packed into non-overlapping tracks (`drawSoundCell` renders one cell for both layouts). Appends a repeat count badge for a single-line repeat, draws multi-line block repeats as section bars after the main pass (`lineYMap`, keyed by **system** id), and handles page breaks. Filename is `{piece.title || 'taiko'}.pdf`.

**Ensemble layout** — gated on `piece.parts.length > 1`, so a solo score keeps today's geometry (`TILES_X` 24 / `TILES_W` 162 / `BEAT_W` 20.25) byte for byte. An ensemble widens the left zone to `PART_LABEL_W` 24 mm for part names and the set bracket, leaving `PART_BEAT_W` 18.5 mm per beat, and `drawEnsembleSystem` draws one `ROW_H` sub-row per lane over a shared beat ruler. `splitSystemIntoChunks(lanes, time)` assigns each sound to chunk `floor(startDiv / (BEATS_PER_ROW * time))`, so every lane wraps at the same absolute beat and the columns stay aligned; each chunk is laid out (including its instruction tracks) before anything is drawn, so `ensureSpace` can keep a whole system off a page break. `setRuns(parts)` gives the consecutive runs sharing a set, drawn as one vertical bracket at `BRACKET_X` with the player's name. Ensemble cells are always proportional — `settings.proportionalWidth` governs the solo layout only — and the header lists each part (`name — taiko`) in place of the single drum.

### Audio playback (`src/audio/` + `src/data/sequence.js`)

Plays the score through the Web Audio API. Three layers:

- `data/sequence.js` (pure, unit-tested) — `expandRepeats(lines)` unrolls block-repeat markers (single-line, multi-line, and nested; `count` = total plays) into an ordered list of sound lines; `buildSequence(lines, time, partId)` flattens those into a continuous timed event stream `{ events: [{ soundId, name, hand, volume, startDiv, durationDiv }], totalDiv }` (lines are concatenated — wrapping is purely visual). Rests (`effectiveVolume` null) are included so the playhead can sweep them but carry no volume. `divToSeconds(div, bpm, time)` converts divisions to seconds. `sectionSlice(lines, headingId)` and `blockRepeatSlice(lines, markerId)` return the line subset for scoped playback (a heading-delimited section / a repeat block); both keep internal markers so repeats still apply. `excludeJiuchiSections(lines)` drops jiuchi-section markers and their definition lines from the main melody; `jiuchiRegions(lines, time)` returns the per-section looping base-rhythm regions (`{ startDiv, endDiv, events, lengthDiv, taiko }`) aligned to that main sequence. `jiuchiPracticeLoop(lines, source, time)` captures one jiuchi section — or every section chained in score order (`ALL_JIUCHI_SECTIONS`) — as a single standalone cycle for the practice loop. `buildSequence`'s optional `partId` selects that part's lane of each system (omitted: the first lane, which is the whole score for a solo piece), and `buildPartSequences(lines, parts, time)` → `{ streams: [{ partId, taiko, events }], totalDiv }` builds one stream per part, each with its **own** cursor, `totalDiv` being the longest. Every other helper operates on the structural spine and is part-agnostic.
- `data/metronome.js` (pure, unit-tested) — the optional playback metronome's beat-grid logic. `JIUCHI_PATTERNS` maps each standard jiuchi to the 1-indexed subdivisions it ticks within a beat; `jiuchiPositions(value, piece)` resolves a `'auto'`/name setting to those subdivisions; `metronomeTicks(totalDiv, time, { positions, headOnly, emphasise })` returns the ordered `{ div, accent }` ticks; `loopEvents(totalDiv, events, lengthDiv)` tiles a captured rhythm across a span (used per-region for inline jiuchi).
- `audio/engine.js` — lazy shared `AudioContext`, and a `voice` object (`strike`, `click`, `tick`) that synthesizes drum hits (pitched body + filtered noise burst; metallic partials for Kane), count-in clicks, and metronome ticks (`tick` plays the Shime TEN sample when enabled and loaded, else a synth click). Timbre comes from `voiceParams(sound, taiko)` (per-taiko base pitch/decay, rim-vs-centre brightness from the syllable, pan from hand, gain from volume). `voice.strike(sound, when, taiko, gainMul)` takes an optional continuous gain trim applied on top of that curve — the metronome balances itself against the score with it, since folding its volume into `sound.volume` would be clamped to the 1-8 steps (cuts bottomed out at step 1, never silent). The `voice` object is the swap point for sampled audio later.
- `audio/samples.js` — the recorded voice: `sampleKey(sound, taiko)` resolves a sound to a recording, and `loadSamples(taiko)` fetches and decodes a taiko's set. Decoded buffers are cached **by URL**, not by taiko: every set includes the same kakegoe calls and Okedo borrows Nagado's drums, so taiko-keyed caching would decode the same file once per taiko and hold a duplicate buffer for each. A strike with no decoded buffer falls back to the synth, so warming matters — `Score` calls `voice.preload` for every taiko in `piece.taikosInUse()` (the score's, each jiuchi section's, and Shime when the metronome uses its sample) on open and on every redraw, memoised on the taiko list so a mid-session taiko change warms without waiting for the first strike.
- `audio/player.js` — `player` singleton controller. Lookahead scheduler (`setInterval` schedules Web Audio events ahead of `audioContext.currentTime`), plus a rAF loop that drives the playhead highlight (`player.currentSoundIds`, a Set read via `player.isSounding(id)` by `SoundTile`/`LigatureTile` — in an ensemble every simultaneous tile lights up) and auto-stops at the end. Playback is a single play↔stop toggle throughout (no pause/resume); `stop()` resets. `resumeAudio()` must run inside the user gesture (the Play button) or mobile browsers stay silent. Optional count-in (one bar, capped at 4 beats) gated on `settings.countIn`. Optional metronome gated on `settings.metronome` — for standard jiuchis `_buildMetroTicks` turns `metronomeTicks` into a scheduled tick list; for `settings.metronomeJiuchi === 'inline'` `_buildInlineStrikes` loops each `jiuchiRegions` region's rhythm with that region's own taiko (per-strike taiko in `_metroStrikes`). Both are drained alongside the main strikes in `_schedule`. Playback is stopped when leaving the score view (`Score.onremove`) and on score load/new/clear.
  - **Practice loop** — `playMetronome(piece)` loops one cycle of a jiuchi indefinitely with no score, under `scope.type === 'metronome'`. Its source and tempo are session-only fields on the player (`metroSection`, `metroTaiko`, `metroBpm`, all set via `setMetroSource` / `setMetroBpm`, which restart a running loop), deliberately independent of the per-score `piece.metronome*` config: `metroSection` names a jiuchi-section marker — or `ALL_JIUCHI_SECTIONS` — and `jiuchiPracticeLoop(lines, source, time)` captures it as one cycle, chaining every section back to back for the `all` source and tagging each event with its own section's `taiko` so a chained loop switches drum as it goes (a rest-only section keeps its span as authored silence; one with no definition lines is skipped). Otherwise the score's named jiuchi plays as `voice.tick` ticks, or as `primaryStrike` hits when `metroTaiko` is set. An unusable source (removed, or nothing audible) resolves to null and falls back to ticks, so the loop is never silent.
  - **Ensemble mixing** — `play()` calls `buildPartSequences` for the audible parts, tags each event with its part's `taiko` and a `gain` of `part.volume / Math.sqrt(streams.length)`, then merge-sorts every stream into the single `_events` array (the `_buildInlineStrikes` pattern already proves a mixed-taiko array works) and preloads every taiko in play. The `√` trim is because `BASE_MASTER` in `engine.js` is tuned for one stream; **pan is not available** for separating parts — it is the hand cue. Audible parts are the soloed one if any, else every unmuted one: `piece.togglePartMute` is persisted arrangement state, `player.togglePartSolo` / `player.soloPartId` is session-only, and both apply from the next play. `feedback.js`'s tap preview uses `piece.taikoForLane(piece.selectedLineId)`, so editing sounds like the drum you are editing on.
  - **Scoped playback** — `play(piece, { lines, scope })` plays any subset of lines. `player.scope` (`{ type: 'all' | 'line' | 'part' | 'section' | 'block' | 'jiuchi' | 'metronome', id }`) records what's playing so each button shows the right state (`player.isScope(type, id)`). `toggleScope(piece, lines, scope)` is a play↔stop toggle used by the ▶ on the selected lane in `System`, on each `SectionHeading` (via `sectionSlice`), on each `JiuchiSectionRow` (via `jiuchiSectionSlice`) and on each multi-line `BlockRepeatRow` (via `blockRepeatSlice`); `toggleAll(piece)` is the whole-piece play/stop toggle for the `Score` toolbar. `'line'` and `'jiuchi'` are **single-voice** previews — they play exactly the lanes handed in, with the taiko resolved from the lane or the section marker, so a jiuchi definition lane previews as authored; `'part'` plays one part alone over the whole score (`play` supports it; no button uses it yet). A single lane plays once (its own repeat is ignored); section/block previews apply internal repeats and skip the count-in. Known limitation: a block-repeat spanning a heading yields a partial repeat when played by section.

### Drag and drop

Three separate mechanisms:

1. **Palette → lane**: a SortableJS clone source per palette section, pointed at the selected lane's drop group (`makeCloneSource` / `syncCloneGroup` in `Palette.jsx`). A dragged tile clones into a `.sounds-container`, whose `onAdd` commits the insertion. Tapping (no drag) adds to the currently selected lane instead.
2. **Within/between lanes**: SortableJS instances on each `.sounds-container[data-line-id]` div, grouped by `laneGroupName(lane)` — `'sounds'` for a solo score, `'sounds-<partId>'` in an ensemble so a drop can only land in a lane of the same part (a jiuchi definition lane is `'sounds-ji'`). `onEnd` calls `piece.moveSound` / `piece.moveSounds`. A `domIndexToDataIndex()` helper maps DOM drop indices to data indices accounting for multi-sound `LigatureTile`s.
3. **Row reordering**: SortableJS instance in `Score.jsx` on `.lines-container`, using `.line-drag-handle` as the drag handle. `onEnd` calls `piece.reorderLine`. A system is one child, so a reorder moves every part of that row together.

## Synthesis lab (`src/lab/`, `lab/index.html`)

A standalone experiment page for building a physically-modelled taiko synth to
replace the recorded samples. **It is isolated on purpose:** `src/lab/` imports
nothing from `src/audio`, `src/data` or `src/components`, and the app imports
nothing from it. Keep it that way — the lab is where synthesis ideas are tried
and rejected, and the app must not depend on any of them.

- Served by `npm run dev` at `/lab/`. It is **excluded from `npm run build`** so
  the deployed PWA and its service worker never see it; `npm run lab:build`
  (POSIX shell — sets `LAB=1`) emits it when a static copy is wanted.
- `dsp/membrane.js`, `dsp/render.js` — the pure model: Bessel modes of a circular
  membrane, the fundamental derived from radius/tension/thickness, hit-position
  excitation via `J_m`, frequency-dependent damping, a shell air mode, and an
  offline renderer that sums the decaying sinusoids. Unit-tested in
  `tests/lab-membrane.test.js` / `tests/lab-render.test.js`.
- `dsp/reverb.js` — the room. Generates a stereo impulse response (decaying
  noise, tail lowpass sweeping down with `reverbDamping`, decorrelated channels)
  driven by the `reverbMix`/`reverbSize`/`reverbDamping` shared params. It is a
  host-graph effect, not an engine one: `main.js` hangs a convolver send off
  master **after** the analyser tap, so the scopes stay dry while the ear hears
  the room. The IR is energy-normalised (`convolver.normalize = false`), so wet
  level does not swing with room size. Unit-tested in `tests/lab-reverb.test.js`.
- `params.js` — the shared control vocabulary (`SHARED_PARAMS`). Every engine
  consumes the same keys so switching engine is a true A/B, and the UI generates
  its sliders from these specs — adding a control means adding a spec, never
  editing the UI.
- `engines/` — pluggable synthesis methods behind one `strike(ctx, destination,
{ when, params })` interface, deliberately shaped like the app's
  `voice.strike(sound, when, taiko)`. `modal` is the additive physical model
  (rendered offline, buffers cached on the waveform-affecting parameters); `fm`
  is the cheap comparison; `mesh` is a 2D digital waveguide mesh over the head
  (`dsp/mesh.js`, unit-tested in `tests/lab-mesh.test.js`) run at its own
  iteration rate and resampled, so partials and hit-position behaviour emerge
  from the grid rather than a mode table. Mesh pitch lands within ~2% of the
  target fundamental at the default grid radius (mesh dispersion), tightening as
  the grid gets finer.
- `presets.js` — localStorage plus JSON export/import; `BUILTIN_PRESETS` holds
  rough Shime/Nagado/Katsugi/Odaiko starting points at real dimensions.

If an engine wins, the port back is a new `src/audio/synthVoice.js` mapping
taiko name to a preset and `sound.name`/`sound.volume` to hit position and
velocity, replacing the body of `synthStrike` in `src/audio/engine.js`.

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

Current version: `3.8`.

## Adding a new symbol

Use the `/add-symbol` command.

## Adding a new jiuchi

Use the `/add-jiuchi` command.
