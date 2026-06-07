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
  selectedId: string | null;
  rightWidth: number;
  items: CanvasItem[];
  panX: MotionValue<number>;
  zoom: MotionValue<number>;
};

// Pans the canvas left when the right panel opens over the selected card, and
// restores the pan when it closes. Tracks the applied offset in a ref so the
// restore exactly undoes the open animation even if the user pans in between.
export function usePanForPanel({
  selectedId,
  rightWidth,
  items,
  panX,
  zoom,
}: Params): void {
  const panelOffsetRef = useRef(0);
  const panAnimRef = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const wasOpen = panelOffsetRef.current !== 0;
    const isOpen = selectedId !== null;

    if (isOpen && !wasOpen) {
      const selected = items.find(
        (i) => i.kind === 'real' && i.id === selectedId,
      );
      if (!selected) {
        return;
      }

      const z = zoom.get();
      const itemRightScreen = panX.get() + (selected.x + selected.width) * z;
      const panelLeftScreen = window.innerWidth - rightWidth;
      const overlap = itemRightScreen - (panelLeftScreen - PANEL_EDGE_MARGIN);
      if (overlap <= 0) {
        return;
      }

      const delta = -overlap;
      panelOffsetRef.current = delta;
      panAnimRef.current?.stop();
      panAnimRef.current = animate(panX, panX.get() + delta, spring.panel);
    } else if (!isOpen && wasOpen) {
      const delta = -panelOffsetRef.current;
      panelOffsetRef.current = 0;
      panAnimRef.current?.stop();
      panAnimRef.current = animate(panX, panX.get() + delta, spring.panel);
    }
  }, [selectedId, rightWidth, panX, zoom, items]);
}
