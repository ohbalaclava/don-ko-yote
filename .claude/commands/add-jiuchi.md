Add a new jiuchi type to the app.

The user will provide: an id (slug), a display label, and the rhythm type ('straight' or 'swing').

Steps:

1. Read `src/data/symbols.js`
2. Append a new entry to the `JIUCHI` array: `{ id: '<id>', label: '<label>', rhythm: '<rhythm>' }`
3. The new jiuchi will appear automatically in the Header dropdown — no other files need changing unless the user wants jiuchi-specific symbol filtering, in which case discuss the approach before implementing.
