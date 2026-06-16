import { useDrag } from '@use-gesture/react';
import { useMotionValue, useSpring } from 'framer-motion';
import { useRef } from 'react';
import { spring } from '../../config';

// Generic draggable-with-springs gesture. Owns the position motion values and
// runs the spring chain, but knows nothing about selection, grouping, or
// what the caller does with the deltas. Compose with higher-level adapters
// (e.g. CanvasCard) to add selection-aware behavior on top.
type Options = {
  initialX?: number;
  initialY?: number;
  getZoom?: () => number;
  onTap?: () => void;
  // Fires on the first pointer-move of a drag (after use-gesture's tap
  // threshold has been exceeded). Use this to mutate state that should latch
  // for the duration of the drag.
  onDragStart?: () => void;
  // Fires on every drag frame including `last`, with the canvas-space delta
  // for that frame. The hook has already applied the delta to its own MVs;
  // this callback lets the caller mirror the move elsewhere (e.g. drive
  // other registered drag targets in lockstep).
  onDragMove?: (canvasDx: number, canvasDy: number) => void;
  onDragEnd?: (x: number, y: number) => void;
  // Drag gesture toggle. Tap still works (use-gesture's tap detection runs
  // independently of drag). When false, drags do not move the card and do
  // not commit to the server — for read-only viewers.
  dragEnabled?: boolean;
};

export function useCardGesture({
  initialX = 0,
  initialY = 0,
  getZoom = () => 1,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  dragEnabled = true,
}: Options) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(initialX);
  const y = useMotionValue(initialY);
  const springX = useSpring(x, spring.card);
  const springY = useSpring(y, spring.card);

  useDrag(
    ({ delta: [dx, dy], tap, first, last }) => {
      if (tap) {
        onTap?.();
        return;
      }
      if (!dragEnabled) {
        // Tap above still fires (so viewers can open the SidePanel) — drag
        // is the part we suppress for read-only.
        return;
      }
      if (first) {
        onDragStart?.();
      }

      const z = getZoom();
      const cdx = dx / z;
      const cdy = dy / z;
      const nx = x.get() + cdx;
      const ny = y.get() + cdy;

      x.set(nx);
      y.set(ny);
      springX.jump(nx);
      springY.jump(ny);
      onDragMove?.(cdx, cdy);

      if (last) {
        // Hand the spring back to its normal physics (it was being jumped
        // every frame). Visually a no-op — springX is already at nx.
        springX.set(nx);
        springY.set(ny);
        onDragEnd?.(nx, ny);
      }
    },
    { target: ref },
  );

  return { ref, x, y, springX, springY };
}
