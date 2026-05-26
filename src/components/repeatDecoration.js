const BAR = 4;
const GAP = 2;

/**
 * Returns inline style for a row inside `depth` nested block-repeats: a
 * left-aligned linear-gradient drawing `depth` orange bars with gaps between,
 * plus enough left padding to push content past them. Returns null when depth
 * is 0 so the caller can fall through to its default styling.
 *
 * The gradient is painted from the border-box origin so the bars appear flush
 * with the outer-left edge of the element even when a `border-l-4` is present
 * (the transparent border lets the background show through). The padding is
 * reduced by 4px relative to the raw bar gutter to account for that border.
 */
export function repeatDecoration(depth) {
  if (depth === 0) return null;
  const stops = [];
  for (let i = 0; i < depth; i++) {
    const start = i * (BAR + GAP);
    stops.push(`#fb923c ${start}px ${start + BAR}px`);
    if (i < depth - 1) {
      stops.push(`transparent ${start + BAR}px ${start + BAR + GAP}px`);
    }
  }
  // Terminal transparent stop so the gradient doesn't bleed across the whole row.
  const lastBarEnd = (depth - 1) * (BAR + GAP) + BAR;
  stops.push(`transparent ${lastBarEnd}px`);
  const barsWidth = depth * (BAR + GAP) - GAP;
  return {
    backgroundImage: `linear-gradient(to right, ${stops.join(', ')})`,
    backgroundRepeat: 'no-repeat',
    // background-origin: border-box paints the gradient from the outer-left edge,
    // so the bars sit flush against the element's left side regardless of border width.
    backgroundOrigin: 'border-box',
    // Subtract 4px for the border-l-4 that all rows carry; content lands at the
    // same visual position as before (barsWidth + 8px from outer edge).
    paddingLeft: `${barsWidth + 4}px`,
  };
}

/** Pixel width of the bar gutter for `depth` nested repeats (0 when depth is 0). */
export function repeatBarsWidth(depth) {
  if (depth === 0) return 0;
  return depth * (BAR + GAP) - GAP;
}
