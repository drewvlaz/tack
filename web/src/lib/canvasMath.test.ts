import { describe, expect, it } from 'vitest';
import {
  getVisibleCanvasRect,
  panelAvoidanceOffset,
  rectContains,
  rectsIntersect,
  screenToCanvas,
} from './canvasMath';

describe('screenToCanvas', () => {
  it('is identity when zoom=1 and pan is zero', () => {
    expect(screenToCanvas(100, 50, 0, 0, 1)).toEqual({ x: 100, y: 50 });
  });

  it('subtracts a positive pan offset from the screen point', () => {
    // A card at canvas (0, 0) with pan (40, 30) renders at screen (40, 30);
    // so screen (40, 30) must map back to canvas (0, 0).
    expect(screenToCanvas(40, 30, 40, 30, 1)).toEqual({ x: 0, y: 0 });
    expect(screenToCanvas(100, 100, 25, 10, 1)).toEqual({ x: 75, y: 90 });
  });

  it('halves the canvas-space distance at zoom=2', () => {
    expect(screenToCanvas(200, 100, 0, 0, 2)).toEqual({ x: 100, y: 50 });
  });

  it('combines pan and zoom correctly', () => {
    expect(screenToCanvas(220, 130, 20, 30, 2)).toEqual({ x: 100, y: 50 });
  });

  it('treats negative pan as the viewport scrolled past the origin', () => {
    expect(screenToCanvas(0, 0, -50, -25, 1)).toEqual({ x: 50, y: 25 });
    expect(screenToCanvas(100, 50, -50, -25, 2)).toEqual({ x: 75, y: 37.5 });
  });

  it('doubles canvas-space distance at zoom=0.5', () => {
    expect(screenToCanvas(100, 50, 0, 0, 0.5)).toEqual({ x: 200, y: 100 });
  });
});

describe('getVisibleCanvasRect', () => {
  it('returns the viewport in canvas space when pan/margin are zero and zoom=1', () => {
    expect(getVisibleCanvasRect(0, 0, 1, 1000, 800, 0)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });

  it('shifts origin by -pan/zoom', () => {
    // pan (100, 50) at zoom 1 means the user has dragged the canvas right/down;
    // canvas-space origin is at screen (100, 50), so the visible region starts
    // at canvas (-100, -50).
    expect(getVisibleCanvasRect(100, 50, 1, 1000, 800, 0)).toEqual({
      x: -100,
      y: -50,
      width: 1000,
      height: 800,
    });
  });

  it('scales viewport size inversely with zoom', () => {
    // At zoom 0.5 the user sees twice the canvas area in the same screen pixels.
    expect(getVisibleCanvasRect(0, 0, 0.5, 1000, 800, 0)).toEqual({
      x: 0,
      y: 0,
      width: 2000,
      height: 1600,
    });
  });

  it('expands by margin on all sides (margin is screen-space)', () => {
    expect(getVisibleCanvasRect(0, 0, 1, 1000, 800, 300)).toEqual({
      x: -300,
      y: -300,
      width: 1600,
      height: 1400,
    });
  });

  it('converts margin into canvas units at non-unit zoom', () => {
    // 300 screen px at zoom 0.5 = 600 canvas px of margin on each side.
    expect(getVisibleCanvasRect(0, 0, 0.5, 1000, 800, 300)).toEqual({
      x: -600,
      y: -600,
      width: 2000 + 1200,
      height: 1600 + 1200,
    });
  });
});

describe('rectsIntersect', () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  it('detects overlap', () => {
    expect(rectsIntersect(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
  });
  it('returns false for disjoint rects', () => {
    expect(rectsIntersect(a, { x: 200, y: 0, width: 50, height: 50 })).toBe(false);
    expect(rectsIntersect(a, { x: 0, y: 200, width: 50, height: 50 })).toBe(false);
  });
  it('treats touching edges as non-intersecting', () => {
    expect(rectsIntersect(a, { x: 100, y: 0, width: 50, height: 50 })).toBe(false);
  });
  it('detects containment', () => {
    expect(rectsIntersect(a, { x: 25, y: 25, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect({ x: 25, y: 25, width: 10, height: 10 }, a)).toBe(true);
  });
});

describe('panelAvoidanceOffset', () => {
  const base = {
    itemX: 0,
    itemWidth: 200,
    zoom: 1,
    panX: 0,
    viewportWidth: 1000,
    panelWidth: 380,
    leftInset: 260,
    margin: 24,
  };

  it('is 0 when the card is already left of the panel', () => {
    // item right = 200; clearRight = 1000 - 380 - 24 = 596
    expect(panelAvoidanceOffset(base)).toBe(0);
  });

  it('shifts left by the overlap plus margin when the card sits under the panel', () => {
    // item right = 900; clearRight = 596; overlap = 304
    expect(panelAvoidanceOffset({ ...base, itemX: 700 })).toBe(-304);
  });

  it('accounts for zoom and the current pan', () => {
    // item right screen = 50 + (400 + 200) * 2 = 1250; clearRight = 596
    // leftInset 0 so the large shift doesn't hit the left-rail clamp.
    expect(
      panelAvoidanceOffset({
        ...base,
        itemX: 400,
        zoom: 2,
        panX: 50,
        leftInset: 0,
      }),
    ).toBe(-(1250 - 596));
  });

  it('does not push the card under the left rail when the gutter can fit it', () => {
    // Would need a large left shift; left clamp keeps itemLeft at clearLeft (284)
    // itemLeft = 0 + 500 = 500; overlap shift = -(700 - 596) = -104
    // itemLeftAfter = 396, still right of 284 — no clamp
    expect(panelAvoidanceOffset({ ...base, itemX: 500, itemWidth: 200 })).toBe(
      -(700 - 596),
    );
    // Card already at the left inset: itemLeft = 260. Unclamped shift would
    // put it at 260 - 304 = -44. Clamp back so left edge stays at 284.
    expect(panelAvoidanceOffset({ ...base, itemX: 260, itemWidth: 700 })).toBe(
      284 - 260,
    );
  });

  it('is 0 when the panel width is 0 and the card is on-screen', () => {
    expect(panelAvoidanceOffset({ ...base, panelWidth: 0, itemX: 700 })).toBe(0);
  });
});

describe('rectContains', () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };
  it('is true when inner is fully inside outer', () => {
    expect(rectContains(outer, { x: 25, y: 25, width: 50, height: 50 })).toBe(true);
  });
  it('is false when inner is fully outside outer', () => {
    expect(rectContains(outer, { x: 200, y: 200, width: 10, height: 10 })).toBe(false);
  });
  it('is false when inner partially overlaps outer (any edge sticks out)', () => {
    expect(rectContains(outer, { x: -10, y: 25, width: 50, height: 50 })).toBe(false);
    expect(rectContains(outer, { x: 75, y: 25, width: 50, height: 50 })).toBe(false);
    expect(rectContains(outer, { x: 25, y: -10, width: 50, height: 50 })).toBe(false);
    expect(rectContains(outer, { x: 25, y: 75, width: 50, height: 50 })).toBe(false);
  });
  it('treats touching edges as contained', () => {
    expect(rectContains(outer, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });
  it('zero-area marquee contains nothing with non-zero area', () => {
    const zero = { x: 50, y: 50, width: 0, height: 0 };
    expect(rectContains(zero, { x: 25, y: 25, width: 10, height: 10 })).toBe(false);
  });
});
