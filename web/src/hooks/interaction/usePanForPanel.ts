import {
  animate,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'framer-motion';
import { useEffect, useRef } from 'react';
import { spring } from '../../config';
import type { CanvasItem } from '../../lib/trpc';

// Gap to leave between the selected card's right edge and the right panel's
// left edge when the panel opens.
const PANEL_EDGE_MARGIN = 24;

type Params = {
  primaryId: string | null;
  rightWidth: number;
  items: CanvasItem[];
  panX: MotionValue<number>;
  zoom: MotionValue<number>;
};

// Pans the canvas left when the right panel opens over the selected card, and
// restores the pan when it closes. Tracks the applied offset in a ref so the
// restore exactly undoes the open animation even if the user pans in between.
// Recomputes the target offset on every selection change so switching to a
// card that doesn't need a pan releases any pan applied by the previous one.
export function usePanForPanel({
  primaryId,
  rightWidth,
  items,
  panX,
  zoom,
}: Params): void {
  const panelOffsetRef = useRef(0);
  const panAnimRef = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const selected =
      primaryId === null
        ? null
        : (items.find((i) => i.kind === 'real' && i.id === primaryId) ?? null);

    let targetOffset = 0;
    if (selected) {
      const z = zoom.get();
      const naturalPanX = panX.get() - panelOffsetRef.current;
      const itemRightScreen = naturalPanX + (selected.x + selected.width) * z;
      const panelLeftScreen = window.innerWidth - rightWidth;
      const overlap = itemRightScreen - (panelLeftScreen - PANEL_EDGE_MARGIN);
      if (overlap > 0) {
        targetOffset = -overlap;
      }
    }

    const delta = targetOffset - panelOffsetRef.current;
    if (delta === 0) {
      return;
    }

    panelOffsetRef.current = targetOffset;
    panAnimRef.current?.stop();
    panAnimRef.current = animate(panX, panX.get() + delta, spring.panel);
  }, [primaryId, rightWidth, panX, zoom, items]);
}
