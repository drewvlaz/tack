// The canvas applies `translate(panX, panY) scale(zoom)` (transform-origin
// top-left) to its child group. So a canvas-space point (cx, cy) lands at
// screen-space (panX + cx * zoom, panY + cy * zoom). Inverse:
//
//   cx = (screenX - panX) / zoom
//   cy = (screenY - panY) / zoom
//
// Used when we need a card to render at a specific screen-space point — e.g.
// "drop a new card near the viewport center."

export function screenToCanvas(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number,
): { x: number; y: number } {
  return { x: (screenX - panX) / zoom, y: (screenY - panY) / zoom };
}

export type Rect = { x: number; y: number; width: number; height: number };

// The visible canvas-space rect, expanded by `marginScreenPx` of screen-space
// padding (converted to canvas units). The margin makes lazy-load look-ahead
// match the IntersectionObserver `rootMargin` we use on the same cards — so the
// initial-mount seed agrees with what IO would have decided one tick later.
export function getVisibleCanvasRect(
  panX: number,
  panY: number,
  zoom: number,
  viewportW: number,
  viewportH: number,
  marginScreenPx: number,
): Rect {
  const margin = marginScreenPx / zoom;
  return {
    x: (0 - panX) / zoom - margin,
    y: (0 - panY) / zoom - margin,
    width: viewportW / zoom + margin * 2,
    height: viewportH / zoom + margin * 2,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// True iff `inner` is fully contained within `outer`. Marquee selection uses
// containment (not intersection) so partially-overlapping cards are excluded.
// Edges touching are treated as contained (<=, not <).
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
