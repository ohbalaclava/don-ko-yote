# kuchi·shoga: User Guide

## What is kuchi·shoga?

kuchi·shoga is a mobile-friendly web app for writing taiko drum sheet music. You build a score by arranging sound tiles onto horizontal lines, set the hand (left or right) and any movement instructions for each sound, then export the finished score as a PDF to print or share.

The app works entirely in your browser — your patterns are saved locally and no account is needed.

---

## Interface overview

The screen is divided into three areas:

- **Header** (top) — title, jiuchi style, beats per line, and PDF export
- **Score** (middle) — your lines of sounds, where you arrange the music
- **Palette** (bottom) — the available sounds and saved patterns to drag or tap into the score

---

## Sounds

The palette lists all available drum sounds:

| Name | Hand | Duration |
| ---- | ---- | -------- |
| TEN  | R    | 1 beat   |
| KEN  | L    | 1 beat   |
| TE   | R    | ½ beat   |
| KE   | L    | ½ beat   |
| zu   | R    | ½ beat   |
| tsu  | R    | ½ beat   |
| ku   | L    | ½ beat   |
| tere | R    | ½ beat   |
| rere | R    | ½ beat   |
| te   | R    | ¼ beat   |
| ke   | L    | ¼ beat   |

---

## Building a score

### Adding sounds to a line

**Tap** a sound in the palette to add it to the currently selected line (highlighted in blue in the score).

**Drag** a sound from the palette and drop it onto any line to place it there.

### Reordering sounds

Drag a tile within a line or between lines to reorder it. The tile snaps into its new position when you release.

### Selecting a line

Tap anywhere on a line (not on a tile) to select it. The selected line gets a blue border and is the target for palette taps.

### Adding and removing lines

- Tap **+ Add line** at the bottom of the score to append a new line.
- Tap the **×** button on the right of a line to remove it and all its sounds.

---

## Editing a sound tile

Tap any placed sound tile to open its editor. From there you can:

- **Toggle hand** — switch between L (left) and R (right)
- **Add an instruction** — a short movement cue (e.g. "step left") displayed below the tile in the score and printed in the PDF
- **Remove** — delete the tile from the line

Tap outside the editor or tap the tile again to close it.

A small dot above a tile marks the start of a beat boundary.

---

## Patterns

A pattern is a saved sequence of sounds that you can reuse across your score. Pattern tiles appear in purple.

### Creating a pattern

1. Tap **Select** (above the score) to enter select mode.
2. Tap individual tiles to select them, or tap the first and then shift-tap (or tap-hold on mobile) to select a contiguous range.
3. Tap **Save pattern** — the app suggests a name based on the selected tile names; edit it if you like, then confirm.
4. Tap **Select** again (or **Cancel**) to leave select mode.

### Using a pattern

Patterns appear in the **Patterns** section of the palette. Tap to add to the selected line, or drag to any line, just like individual sounds.

### Expanding a pattern

Tap a purple pattern tile in the score and choose **Expand in place** to replace it with its individual sounds, which you can then edit separately.

### Deleting a pattern

Tap the **×** on a pattern tile in the palette to permanently remove it.

---

## Settings

### Title

Type a title in the header; it appears at the top of the exported PDF.

### Jiuchi

Choose the rhythmic feel of the piece:

- **Gobu-gobu** — straight (even) feel
- **Shichisan** — swing feel

### Beats per line

Set how many beats each line represents (1–32). The score shows a beat count for each line; sounds that overflow the beat count are still kept but shown as over budget.

---

## Exporting to PDF

Tap **Export PDF** in the header. A PDF is generated and downloaded automatically, named after your title (or "taiko" if no title is set). The PDF contains:

- Title and jiuchi/beats-per-line subtitle
- Each line of the score, with sounds drawn as labelled boxes showing hand, name, and any instructions
- Automatic page breaks

---

## Tips

- Build common rhythm phrases as patterns so you can drop them in quickly.
- Use instructions sparingly — short cues like "step L" or "turn" are clearest in the PDF.
- The beat count shown on each line helps you stay in time signature before exporting.
