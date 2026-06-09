import { describe, expect, it } from 'vitest';
import { screenToCanvas } from './canvasMath';

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
