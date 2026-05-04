import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vitest 4 uses oxc with the automatic React JSX runtime.
// Intercept it here to produce a plain vnode object instead.
vi.mock('react/jsx-dev-runtime', () => ({
  jsxDEV: (tag, { children, ...attrs } = {}, key) => ({
    tag,
    attrs,
    children: (children === undefined ? []
      : Array.isArray(children) ? children
      : [children]
    ).flat(Infinity).filter(c => c != null),
  }),
}));

const mockPiece = vi.hoisted(() => ({
  editingTile: null,
  selectMode: false,
  setEditingTile: vi.fn(),
  toggleSoundSelection: vi.fn(),
  expandGroup: vi.fn(),
  removeSound: vi.fn(),
}));

vi.mock('../src/data/piece.js', () => ({ piece: mockPiece }));

import { GroupTile } from '../src/components/GroupTile.jsx';

function render(attrs) {
  return GroupTile().view({ attrs });
}

function makeGroup(sounds) {
  return {
    id: 'g1',
    type: 'group',
    name: 'Test Pattern',
    duration: sounds.reduce((sum, s) => sum + s.duration, 0),
    sounds,
  };
}

const TWO_SOUNDS = [
  { id: 's1', name: 'Don', hand: 'R', duration: 1 },
  { id: 's2', name: 'Ko', hand: 'L', duration: 1 },
];

beforeEach(() => {
  mockPiece.editingTile = null;
  mockPiece.selectMode = false;
  vi.clearAllMocks();
});

describe('GroupTile', () => {
  const lineId = 'line1';

  describe('border class', () => {
    it('uses indigo when selected', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: true });
      expect(vnode.attrs.class).toContain('border-indigo-500');
      expect(vnode.attrs.class).toContain('bg-indigo-50');
    });

    it('uses purple when not selected', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      expect(vnode.attrs.class).toContain('border-purple-400');
      expect(vnode.attrs.class).toContain('bg-purple-50');
    });
  });

  describe('sub-sound rendering', () => {
    it('renders a child div for each sub-sound', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const soundDivs = vnode.children.filter(c => c?.tag === 'div');
      expect(soundDivs).toHaveLength(2);
    });

    it('shows name and hand for each sound', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const firstDiv = vnode.children[0];
      const spans = firstDiv.children.filter(c => c?.tag === 'span');
      expect(spans.some(s => s.children.includes('Don'))).toBe(true);
      expect(spans.some(s => s.children.includes('R'))).toBe(true);
    });
  });

  describe('beat dot', () => {
    it('renders a dot when startPos is an integer', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const firstDiv = vnode.children[0];
      const dot = firstDiv.children.find(c => c?.attrs?.class?.includes('rounded-full'));
      expect(dot).toBeDefined();
    });

    it('omits the dot when startPos is not an integer', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0.5, isSelected: false });
      const firstDiv = vnode.children[0];
      const dot = firstDiv.children.find(c => c?.attrs?.class?.includes('rounded-full'));
      expect(dot).toBeUndefined();
    });

    it('tracks cumulative position across sub-sounds', () => {
      const sounds = [
        { id: 's1', name: 'Don', hand: 'R', duration: 0.5 },
        { id: 's2', name: 'Ko', hand: 'L', duration: 0.5 },
        { id: 's3', name: 'Ka', hand: 'L', duration: 0.5 },
      ];
      // s1 at pos 0 (beat), s2 at 0.5 (not), s3 at 1.0 (beat)
      const vnode = render({ sound: makeGroup(sounds), lineId, startPos: 0, isSelected: false });
      const divs = vnode.children.filter(c => c?.tag === 'div');
      const hasDot = div => div.children.some(c => c?.attrs?.class?.includes('rounded-full'));
      expect(hasDot(divs[0])).toBe(true);
      expect(hasDot(divs[1])).toBe(false);
      expect(hasDot(divs[2])).toBe(true);
    });
  });

  describe('GroupEditor visibility', () => {
    it('hides editor when editingTile is null', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const editor = vnode.children.find(c => typeof c?.tag === 'function');
      expect(editor).toBeUndefined();
    });

    it('hides editor when editingTile is for a different sound', () => {
      mockPiece.editingTile = { lineId, soundId: 'other-id' };
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const editor = vnode.children.find(c => typeof c?.tag === 'function');
      expect(editor).toBeUndefined();
    });

    it('shows editor when editingTile matches', () => {
      mockPiece.editingTile = { lineId, soundId: 'g1' };
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const editor = vnode.children.find(c => typeof c?.tag === 'function');
      expect(editor).toBeDefined();
    });

    it('hides editor in selectMode even when editingTile matches', () => {
      mockPiece.editingTile = { lineId, soundId: 'g1' };
      mockPiece.selectMode = true;
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const editor = vnode.children.find(c => typeof c?.tag === 'function');
      expect(editor).toBeUndefined();
    });
  });

  describe('event handlers', () => {
    it('onpointerup calls toggleSoundSelection in selectMode', () => {
      mockPiece.selectMode = true;
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const e = { stopPropagation: vi.fn() };
      vnode.attrs.onpointerup(e);
      expect(e.stopPropagation).toHaveBeenCalled();
      expect(mockPiece.toggleSoundSelection).toHaveBeenCalledWith(lineId, 'g1');
    });

    it('onpointerup does nothing outside selectMode', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      vnode.attrs.onpointerup({ stopPropagation: vi.fn() });
      expect(mockPiece.toggleSoundSelection).not.toHaveBeenCalled();
    });

    it('onclick opens editor when not already editing', () => {
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const e = { stopPropagation: vi.fn() };
      vnode.attrs.onclick(e);
      expect(mockPiece.setEditingTile).toHaveBeenCalledWith({ lineId, soundId: 'g1' });
    });

    it('onclick closes editor when already editing this tile', () => {
      mockPiece.editingTile = { lineId, soundId: 'g1' };
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      const e = { stopPropagation: vi.fn() };
      vnode.attrs.onclick(e);
      expect(mockPiece.setEditingTile).toHaveBeenCalledWith(null);
    });

    it('onclick does nothing in selectMode', () => {
      mockPiece.selectMode = true;
      const vnode = render({ sound: makeGroup(TWO_SOUNDS), lineId, startPos: 0, isSelected: false });
      vnode.attrs.onclick({ stopPropagation: vi.fn() });
      expect(mockPiece.setEditingTile).not.toHaveBeenCalled();
    });
  });
});