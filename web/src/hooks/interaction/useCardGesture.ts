import { useDrag } from '@use-gesture/react';
import { useMotionValue, useSpring } from 'framer-motion';
import { useRef } from 'react';
import { spring } from '../../config';

type Options = {
  initialX?: number;
  initialY?: number;
  getZoom?: () => number;
  onTap?: () => void;
  onDragEnd?: (x: number, y: number) => void;
  // Group-drag hooks. When `getSelectionSize()` returns > 1 and this card is
  // in the selection (caller's job to enforce — typically by only wiring these
  // callbacks on selected cards), the gesture forwards the canvas-space delta
  // to `onGroupDelta` and skips its own move. `onGroupCommit` fires on release
  // so the coordinator can persist all selected positions in one batch.
  isInMultiSelect?: () => boolean;
  onGroupDelta?: (dx: number, dy: number) => void;
  onGroupCommit?: () => void;
  // Called on `first` if the card isn't already in the selection — typically
  // replaces selection with this card, so a subsequent drag moves only it.
  onDragStartIfUnselected?: () => void;
  isSelected?: () => boolean;
};

export function useCardGesture({
  initialX = 0,
  initialY = 0,
  getZoom = () => 1,
  onTap,
  onDragEnd,
  isInMultiSelect,
  onGroupDelta,
  onGroupCommit,
  onDragStartIfUnselected,
  isSelected,
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

      if (first) {
        if (isSelected && !isSelected()) {
          onDragStartIfUnselected?.();
        }
      }

      const z = getZoom();
      const cdx = dx / z;
      const cdy = dy / z;

      const groupMode = isInMultiSelect?.() ?? false;

      if (groupMode) {
        // Move self (so the dragged card stays under the cursor) and
        // dispatch the same delta to all other selected cards via the
        // coordinator.
        const nx = x.get() + cdx;
        const ny = y.get() + cdy;
        x.set(nx);
        y.set(ny);
        springX.jump(nx);
        springY.jump(ny);
        onGroupDelta?.(cdx, cdy);
        if (last) {
          springX.set(nx);
          springY.set(ny);
          onGroupCommit?.();
        }
        return;
      }

      const nx = x.get() + cdx;
      const ny = y.get() + cdy;

      if (last) {
        springX.set(nx);
        springY.set(ny);
        onDragEnd?.(nx, ny);
      } else {
        x.set(nx);
        y.set(ny);
        springX.jump(nx);
        springY.jump(ny);
      }
    },
    { target: ref },
  );

  return { ref, x, y, springX, springY };
}
