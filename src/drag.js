/**
 * Shared SortableJS options that require a short press-and-hold before a touch
 * drag can begin, so a scroll gesture that starts on a draggable element
 * scrolls the page instead of picking the element up. Moving more than the
 * threshold before the delay elapses cancels the pending drag. Mouse drags are
 * unaffected (`delayOnTouchOnly`).
 */
export const touchDragDelay = {
  delay: 150,
  delayOnTouchOnly: true,
  touchStartThreshold: 4,
};
