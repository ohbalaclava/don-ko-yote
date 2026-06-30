Add a new jiuchi type to the app.

A jiuchi is a named base rhythm. There is no central `JIUCHI` array — a jiuchi is
just a string listed in the `jiuchis` array of each symbol set it's valid for,
plus a metronome tick pattern. Symbol sets live in `src/data/symbols-*.js`
(`high-straight`, `high-swing`, `low-straight`, `low-swing`); `time: 4` sets are
straight, `time: 3` sets are swing.

The user will provide: a display name (e.g. `Shiberoku`) and the rhythm type
(`straight` or `swing`). Ask which if not given.

Steps:

1. Add the name to the `jiuchis` array in every symbol set matching the rhythm:
   - straight → `src/data/symbols-high-straight.js` and `src/data/symbols-low-straight.js`
   - swing → `src/data/symbols-high-swing.js` and `src/data/symbols-low-swing.js`
     This makes `getSymbolSet(taiko, jiuchi)` accept the combo and adds it to
     `ALL_JIUCHIS` (derived in `src/data/symbolSets.js`).

2. Add a metronome tick pattern to `JIUCHI_PATTERNS` in `src/data/metronome.js`:
   1-indexed subdivisions within a beat. Straight beats have 4 divisions (valid
   positions 1–4), swing beats have 3 (valid positions 1–3). E.g. Mitsu-uchi is
   `[1, 3, 4]`, Gobu Gobu / Shichisan are `[1, 3]`.

3. The jiuchi then appears automatically in the New score sheet
   (`NewScoreSheet.jsx`) and the Metronome settings jiuchi selector
   (`MetronomeSettingsModal.jsx`) via `ALL_JIUCHIS`.

4. Bump the version in `src/version.js` (minor — it's not a breaking change).

Variant-gated jiuchis: to hide a new jiuchi behind a URL hash (e.g. only visible
under `#shiberoku`), still do steps 1–2 (keeps it a valid, saveable combo), then
add it to `VARIANT_JIUCHIS` in `src/data/symbolSets.js` mapping its name to the
hash variant. Both UI lists filter through `visibleJiuchis`, so it stays hidden
until the hash is set. See `src/data/variant.js` for the hash primitive.
