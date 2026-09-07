import {
  animate,
  type AnimationPlaybackControls,
  type MotionValue,
} from 'framer-motion';
import { useLayoutEffect, useRef } from 'react';
import { spring } from '../../config';
import { panelAvoidanceOffset } from '../../lib/canvasMath';
import type { CanvasItem } from '../../lib/trpc';

const PANEL_EDGE_MARGIN = 24;
const MIN_DELTA = 0.5;

type Params = {
  primaryId: string | null;
  rightWidth: number;
  leftInset: number;
  items: CanvasItem[];
  panX: MotionValue<number>;
  zoom: MotionValue<number>;
};

// Pans the canvas just enough that the selected product card isn't covered
// by the right panel, and restores that shift when the panel closes.
//
// Only product selections open the panel (text items keep primaryId but no
// rail), so those are the only ones that request an offset. Other items
// changing does not retrigger — only this card's id/x/width and the rail
// sizes do.
//
// Natural pan (viewport minus our compensation) is snapshotted for the
// duration of an in-flight animation. Deriving it from panX.get() minus
// the *target* offset while the spring is mid-flight was the source of the
// inconsistent jumps: the ref had already committed, panX hadn't.
export function usePanForPanel({
  primaryId,
  rightWidth,
  leftInset,
  items,
  panX,
  zoom,
}: Params): void {
  const offsetTargetRef = useRef(0);
  const naturalPanXRef = useRef<number | null>(null);
  const panAnimRef = useRef<AnimationPlaybackControls | null>(null);
  const animGenRef = useRef(0);

  const selected = findPanelItem(items, primaryId);
  const selectedId = selected?.id ?? null;
  const selectedX = selected?.x;
  const selectedWidth = selected?.width;

  useLayoutEffect(() => {
    const naturalPanX =
      naturalPanXRef.current ?? panX.get() - offsetTargetRef.current;

    let targetOffset = 0;
    if (selectedId !== null && selectedX !== undefined && selectedWidth !== undefined) {
      targetOffset = panelAvoidanceOffset({
        itemX: selectedX,
        itemWidth: selectedWidth,
        zoom: zoom.get(),
        panX: naturalPanX,
        viewportWidth: window.innerWidth,
        panelWidth: rightWidth,
        leftInset,
        margin: PANEL_EDGE_MARGIN,
      });
    }

    const delta = targetOffset - offsetTargetRef.current;
    if (Math.abs(delta) < MIN_DELTA) {
      return;
    }

    naturalPanXRef.current = naturalPanX;
    offsetTargetRef.current = targetOffset;
    const gen = ++animGenRef.current;
    panAnimRef.current?.stop();
    const controls = animate(panX, panX.get() + delta, spring.panelPan);
    panAnimRef.current = controls;
    void controls.then(() => {
      if (animGenRef.current === gen) {
        naturalPanXRef.current = null;
        panAnimRef.current = null;
      }
    });
  }, [
    selectedId,
    selectedX,
    selectedWidth,
    rightWidth,
    leftInset,
    panX,
    zoom,
  ]);

  useLayoutEffect(() => {
    return () => {
      animGenRef.current += 1;
      panAnimRef.current?.stop();
    };
  }, []);
}

function findPanelItem(
  items: CanvasItem[],
  primaryId: string | null,
): Extract<CanvasItem, { state: 'real'; kind: 'product' }> | null {
  if (primaryId === null) {
    return null;
  }
  for (const item of items) {
    if (item.state === 'real' && item.kind === 'product' && item.id === primaryId) {
      return item;
    }
  }
  return null;
}
