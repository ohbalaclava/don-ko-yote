const MAX = 32;
let stack = [];
let ptr = -1;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export const history = {
  init(state) {
    stack = [clone(state)];
    ptr = 0;
  },

  /**
   * Pushes a new state, discarding any redo history beyond the current pointer.
   * Drops the oldest entry when the stack exceeds MAX.
   * @param {object} state
   */
  push(state) {
    stack = stack.slice(0, ptr + 1);
    stack.push(clone(state));
    if (stack.length > MAX) stack.shift();
    ptr = stack.length - 1;
  },

  canUndo() { return ptr > 0; },
  canRedo() { return ptr < stack.length - 1; },

  /** @returns {object|null} The state to restore, or null if already at the beginning. */
  undo() {
    if (ptr <= 0) return null;
    ptr--;
    return clone(stack[ptr]);
  },

  /** @returns {object|null} The state to restore, or null if already at the end. */
  redo() {
    if (ptr >= stack.length - 1) return null;
    ptr++;
    return clone(stack[ptr]);
  },

  reset(state) {
    stack = [clone(state)];
    ptr = 0;
  },
};
