## Display
1. Click on a tile to add it to end of the current line. Will require lines to be selectable.
1. Allow a sequence of tiles to be selected and grouped so they can be added to a library of patterns. Patterns in the library can then be added as a group tile to the score.
1. Move the 'hand' to the bottom of the tile
1. Don't display the instruction on the tile. Instead, display it unbroken under the tile. The instruction can extend beyond the limits of the originating tile, under subsequent tiles. If this happens and a subsequent tile also has an instruction, display that tile's instruction underneath the first one.
1. Display a small black circle centrally above each tile that lands on a head beat.
1. Mitsudomoe app icon
1. Mitsudomoe in front of title

## App Configuration
1. Allow for the possibility of app configuration ie settings. These should be edited through a modal dialog or whatever works best for mobile devices. The configuration should be saved to browser memory but also exportable to a json file. Support the following settings:
   1. Toggle proportional tile width. Tiles should either be all the same width or their width should be proportional to the fraction of the beat that they occupy.
   1. Font. There should be a serif font, a sans serif font, a monospaced font, and a script font (ideally with a brushed, far-eastern look)
   1. Dark mode/light mode
   
## Score configuration
1. Jiuchi

## PDF
1. Remove the tile outlines.
1. Export dialog with options for below: 
   1. Font
   1. Add icon
   1. Add background
   1. Add copyright or licence
   1. Add date

## New Features
1. Menu button to toggle a menu with the following items:
   1. Clear button with confirmation dialog
   1. Save button - save to browser memory. Automatically save if a score's title is changed.
   1. Load button - load from browser memory.
   1. Export button - export to json file
   1. Import button - import from json file
   1. Export to PDF
   2. Help - how to use

## Non-functional
1. Unit tests
2. Selenium tests?