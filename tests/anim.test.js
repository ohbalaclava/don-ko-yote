import { describe, it, expect, beforeEach } from 'vitest';
import { anim } from '../src/anim.js';

/** A sound line holding the given sound ids. */
function line(id, soundIds = []) {
  return { id, sounds: soundIds.map((sid) => ({ id: sid })) };
}

beforeEach(() => {
  // Reset the baseline so each test starts from a known empty state. The first
  // animate:true sync would otherwise treat the whole baseline as "added".
  anim.sync([], { animate: false });
});

describe('anim.sync diff', () => {
  it('queues newly added line and sound ids', () => {
    anim.sync([line('L1', ['s1'])], { animate: false }); // baseline
    anim.sync([line('L1', ['s1', 's2']), line('L2')], { animate: true });

    expect(anim.consumeAdded('s2')).toBe(true);
    expect(anim.consumeAdded('L2')).toBe(true);
    expect(anim.consumeAdded('s1')).toBe(false); // already present
    expect(anim.consumeAdded('L1')).toBe(false);
  });

  it('queues removed line and sound ids', () => {
    anim.sync([line('L1', ['s1', 's2']), line('L2')], { animate: false });
    anim.sync([line('L1', ['s1'])], { animate: true });

    expect(anim.consumeRemoved('s2')).toBe(true);
    expect(anim.consumeRemoved('L2')).toBe(true);
    expect(anim.consumeRemoved('s1')).toBe(false);
  });

  it('treats a move (same id, different line) as neither add nor remove', () => {
    anim.sync([line('L1', ['s1']), line('L2', [])], { animate: false });
    anim.sync([line('L1', []), line('L2', ['s1'])], { animate: true });

    expect(anim.consumeAdded('s1')).toBe(false);
    expect(anim.consumeRemoved('s1')).toBe(false);
  });

  it('animate:false rebaselines without queuing anything', () => {
    anim.sync([line('L1', ['s1'])], { animate: false });
    anim.sync([line('L1', ['s1']), line('L2', ['s2'])], { animate: false });

    expect(anim.consumeAdded('L2')).toBe(false);
    expect(anim.consumeAdded('s2')).toBe(false);
  });

  it('consume is one-shot', () => {
    anim.sync([], { animate: false });
    anim.sync([line('L1')], { animate: true });

    expect(anim.consumeAdded('L1')).toBe(true);
    expect(anim.consumeAdded('L1')).toBe(false);
  });

  it('accumulates queued ids across two syncs before consumption', () => {
    anim.sync([], { animate: false });
    anim.sync([line('L1')], { animate: true });
    anim.sync([line('L1'), line('L2')], { animate: true });

    // Both adds survive: a redraw may not have consumed L1 before L2 committed.
    expect(anim.consumeAdded('L1')).toBe(true);
    expect(anim.consumeAdded('L2')).toBe(true);
  });
});
