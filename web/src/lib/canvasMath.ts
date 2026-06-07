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
