import { describe, expect, it } from 'vitest';
import { getVisibleCanvasRect, rectsIntersect, screenToCanvas } from './canvasMath';

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
