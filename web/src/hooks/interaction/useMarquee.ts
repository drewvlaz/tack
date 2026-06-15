import { useDrag } from '@use-gesture/react';
import { type MotionValue } from 'framer-motion';
import { useRef, useState } from 'react';
import { rectContains, screenToCanvas, type Rect } from '../../lib/canvasMath';
import { useSelectionStore } from '../../store/selection';

export type Selectable = { id: string; rect: Rect };

type Args = {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  panX: MotionValue<number>;
  panY: MotionValue<number>;
  zoomMV: MotionValue<number>;
  // Closure over the current items list. Caller filters out anything that
  // shouldn't be selectable (skeletons, etc.).
  getSelectables: () => Selectable[];
  // Returns true while space is held — pan owns that case, marquee bails.
  isPanModifierHeld: () => boolean;
};

type ScreenRect = { x: number; y: number; width: number; height: number };

type GestureCtx = {
  anchorScreen: { x: number; y: number };
  initialIds: ReadonlySet<string>;
  mode: 'replace' | 'add' | 'subtract';
};

// Drag on empty canvas (mouse/pen) draws a marquee. Modifiers chosen at
// gesture start lock in the mode for that drag:
//   shift+alt → ignored (treated as 'add' — least surprising)
//   shift    → add to existing selection
//   alt      → subtract from existing selection
//   neither  → replace
//
// Touch is excluded — one-finger drag must keep panning the canvas (no space
// modifier on mobile). Pinch-to-zoom is unaffected.
//
// Per-frame selection writes are coalesced through requestAnimationFrame to
// avoid pinning the main thread when the pointer fires faster than the
// monitor refresh.
export function useMarquee({
  canvasRef,
  panX,
  panY,
  zoomMV,
  getSelectables,
  isPanModifierHeld,
}: Args): { rect: ScreenRect | null; active: boolean } {
  const [rect, setRect] = useState<ScreenRect | null>(null);
  const ctxRef = useRef<GestureCtx | null>(null);
  const pendingRectRef = useRef<ScreenRect | null>(null);
  const rafRef = useRef<number | null>(null);

  function scheduleCommit() {
    if (rafRef.current !== null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRectRef.current;
      if (!pending) {
        return;
      }
      setRect(pending);
      applySelection(pending);
    });
  }

  function applySelection(screenRect: ScreenRect) {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    if (screenRect.width * screenRect.height === 0) {
      return;
    }
    const z = zoomMV.get();
    const px = panX.get();
    const py = panY.get();
    const topLeft = screenToCanvas(screenRect.x, screenRect.y, px, py, z);
    const bottomRight = screenToCanvas(
      screenRect.x + screenRect.width,
      screenRect.y + screenRect.height,
      px,
      py,
      z,
    );
    const marqueeCanvas: Rect = {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
    const items = getSelectables();
    const matched = new Set<string>();
    for (const { id, rect: itemRect } of items) {
      if (rectContains(marqueeCanvas, itemRect)) {
        matched.add(id);
      }
    }
    const store = useSelectionStore.getState();
    if (ctx.mode === 'add') {
      const next = new Set(ctx.initialIds);
      for (const id of matched) {
        next.add(id);
      }
      store.set(next);
    } else if (ctx.mode === 'subtract') {
      const next = new Set<string>();
      for (const id of ctx.initialIds) {
        if (!matched.has(id)) {
          next.add(id);
        }
      }
      store.set(next);
    } else {
      store.set(matched);
    }
  }

  useDrag(
    ({ event, first, last, tap, xy, initial }) => {
      const el = canvasRef.current;
      if (!el) {
        return;
      }
      // A click without real movement on empty canvas clears selection.
      // @use-gesture's tap detection is stricter than the browser's native
      // click event (which can still fire after a marquee drag on small
      // movements). Owning this here means Canvas.tsx doesn't need an
      // onClick handler that would race the drag-end commit.
      if (tap) {
        if (event.target === el) {
          useSelectionStore.getState().clear();
        }
        return;
      }
      if (first) {
        if (event.target !== el) {
          ctxRef.current = null;
          return;
        }
        // Touch falls through to the pan handler — no marquee on a phone.
        const pointerType = (event as PointerEvent).pointerType;
        if (pointerType !== 'mouse' && pointerType !== 'pen') {
          ctxRef.current = null;
          return;
        }
        if (isPanModifierHeld()) {
          ctxRef.current = null;
          return;
        }
        const shift = (event as PointerEvent).shiftKey === true;
        const alt = (event as PointerEvent).altKey === true;
        const mode: GestureCtx['mode'] = shift
          ? 'add'
          : alt
            ? 'subtract'
            : 'replace';
        const bounds = el.getBoundingClientRect();
        ctxRef.current = {
          anchorScreen: {
            x: initial[0] - bounds.left,
            y: initial[1] - bounds.top,
          },
          initialIds: useSelectionStore.getState().ids,
          mode,
        };
        el.style.cursor = 'crosshair';
        return;
      }
      const ctx = ctxRef.current;
      if (!ctx) {
        return;
      }
      const bounds = el.getBoundingClientRect();
      const cx = xy[0] - bounds.left;
      const cy = xy[1] - bounds.top;
      const next: ScreenRect = {
        x: Math.min(ctx.anchorScreen.x, cx),
        y: Math.min(ctx.anchorScreen.y, cy),
        width: Math.abs(cx - ctx.anchorScreen.x),
        height: Math.abs(cy - ctx.anchorScreen.y),
      };
      pendingRectRef.current = next;
      scheduleCommit();
      if (last) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setRect(null);
        pendingRectRef.current = null;
        // Apply one last time synchronously so the final commit reflects the
        // exact release position even if the last rAF was coalesced.
        applySelection(next);
        ctxRef.current = null;
        el.style.cursor = '';
      }
    },
    { target: canvasRef },
  );

  return { rect, active: ctxRef.current !== null };
}
