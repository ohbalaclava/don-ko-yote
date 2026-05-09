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

  push(state) {
    stack = stack.slice(0, ptr + 1);
    stack.push(clone(state));
    if (stack.length > MAX) stack.shift();
    ptr = stack.length - 1;
  },

  canUndo() { return ptr > 0; },
  canRedo() { return ptr < stack.length - 1; },

  undo() {
    if (ptr <= 0) return null;
    ptr--;
    return clone(stack[ptr]);
  },

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
