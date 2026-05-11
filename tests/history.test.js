import { describe, it, expect, beforeEach } from 'vitest';
import { history } from '../src/data/history.js';

beforeEach(() => {
  history.reset({ val: 0 });
});

describe('history', () => {
  describe('init', () => {
    it('seeds the stack and disables undo/redo', () => {
      history.init({ val: 1 });
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('canUndo / canRedo', () => {
    it('canUndo is false with only one entry', () => {
      expect(history.canUndo()).toBe(false);
    });

    it('canUndo is true after a push', () => {
      history.push({ val: 1 });
      expect(history.canUndo()).toBe(true);
    });

    it('canRedo is false before any undo', () => {
      history.push({ val: 1 });
      expect(history.canRedo()).toBe(false);
    });

    it('canRedo is true after an undo', () => {
      history.push({ val: 1 });
      history.undo();
      expect(history.canRedo()).toBe(true);
    });
  });

  describe('push', () => {
    it('discards redo history when pushing after an undo', () => {
      history.push({ val: 1 });
      history.push({ val: 2 });
      history.undo();
      history.push({ val: 3 });
      expect(history.canRedo()).toBe(false);
    });

    it('trims the oldest entry when the stack exceeds 32', () => {
      // MAX=32 means 32 total entries (current + 31 prior), so max undos = 31.
      for (let i = 1; i <= 40; i++) history.push({ val: i });
      let count = 0;
      while (history.canUndo()) {
        history.undo();
        count++;
      }
      expect(count).toBe(31);
    });

    it('stores a deep clone so later mutations do not affect stored state', () => {
      const state = { arr: [1, 2] };
      history.init(state);
      history.push({ arr: [3] });
      history.undo();
      const result = history.undo(); // back to beginning — should be null since only base
      // Mutating the retrieved state should not alter stored history
      const restored = history.redo();
      restored.arr.push(99);
      expect(history.undo()).toEqual({ arr: [1, 2] });
    });
  });

  describe('undo', () => {
    it('returns null when already at the beginning', () => {
      expect(history.undo()).toBeNull();
    });

    it('returns the previous state', () => {
      history.push({ val: 1 });
      expect(history.undo()).toEqual({ val: 0 });
    });

    it('steps back one entry at a time', () => {
      history.push({ val: 1 });
      history.push({ val: 2 });
      history.undo();
      expect(history.undo()).toEqual({ val: 0 });
    });

    it('returns a deep clone, not the original reference', () => {
      history.push({ nested: { x: 1 } });
      history.undo();
      const result = history.redo();
      result.nested.x = 999;
      // Undoing back should still give the unmodified state
      history.undo();
      expect(history.redo()).toEqual({ nested: { x: 1 } });
    });
  });

  describe('redo', () => {
    it('returns null when nothing has been undone', () => {
      expect(history.redo()).toBeNull();
    });

    it('returns the state that was undone', () => {
      history.push({ val: 1 });
      history.undo();
      expect(history.redo()).toEqual({ val: 1 });
    });

    it('returns null after redoing all entries', () => {
      history.push({ val: 1 });
      history.undo();
      history.redo();
      expect(history.redo()).toBeNull();
    });

    it('alternates correctly with undo', () => {
      history.push({ val: 1 });
      history.push({ val: 2 });
      history.undo(); // → 1
      history.undo(); // → 0
      history.redo(); // → 1
      expect(history.redo()).toEqual({ val: 2 });
    });
  });

  describe('reset', () => {
    it('clears both undo and redo history', () => {
      history.push({ val: 1 });
      history.push({ val: 2 });
      history.reset({ val: 0 });
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });

    it('seeds with the given state as the new base', () => {
      history.reset({ val: 5 });
      history.push({ val: 6 });
      expect(history.undo()).toEqual({ val: 5 });
    });
  });
});
