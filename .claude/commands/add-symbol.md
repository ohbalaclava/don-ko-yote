Add a new sound symbol to the palette.

The user will provide: name, duration (as a fraction of a beat), and default hand (L or R).

Steps:
1. Read `src/data/symbols.js`
2. Append a new entry to the `SYMBOLS` array: `{ name: '<name>', duration: <duration>, hand: '<hand>' }`
   - Express duration as a JS fraction (e.g. `1/2`, `1/3`, `1/4`, `1`) not a decimal
3. Show the user the line you added and confirm the symbol will appear in the palette immediately