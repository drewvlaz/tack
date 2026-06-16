import { useDrag, useWheel } from '@use-gesture/react';
import { useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { zoom as zoomConfig } from '../../config';

// One localStorage entry per board so each board remembers its own viewport.
// Switching boards reads the saved view; pan/zoom writes back to that board's
// slot only. Legacy single-global entry (`canvasView`) is ignored — it'd be
// ambiguous which board owns it.
const STORAGE_PREFIX = 'canvasView:';
const SAVE_DEBOUNCE_MS = 150;

type View = { z: number; x: number; y: number };

const DEFAULT_VIEW: View = { z: zoomConfig.initial, x: 0, y: 0 };

function storageKey(boardId: string): string {
  return `${STORAGE_PREFIX}${boardId}`;
}

function readView(boardId: string | null): View {
  if (!boardId) {
    return DEFAULT_VIEW;
  }
  try {
    const raw = localStorage.getItem(storageKey(boardId));
    if (!raw) {
      return DEFAULT_VIEW;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.z === 'number' &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number'
    ) {
      return {
        z: Math.min(zoomConfig.max, Math.max(zoomConfig.min, parsed.z)),
        x: parsed.x,
        y: parsed.y,
      };
    }
    return DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}

export function useCanvasGesture(boardId: string | null) {
  const canvasRef = useRef<HTMLDivElement>(null);
  // Motion values are created ONCE; subsequent board switches mutate them via
  // an effect. Recreating MVs on each switch would break every consumer that
  // captured a reference (drag handlers, side panel auto-pan, dot grid).
  // The lazy initializer reads localStorage exactly once on mount.
  const [initial] = useState(() => readView(boardId));
  const zoomMV = useMotionValue<number>(initial.z);
  const panX = useMotionValue(initial.x);
  const panY = useMotionValue(initial.y);

  // Space-held → pan mode. Marquee selection uses default drag; pan moves
  // behind a held modifier (Figma convention). Stored in a ref so the drag
  // handler reads the current value at gesture time, not at render time.
  const isSpaceHeldRef = useRef(false);
  useEffect(() => {
    function isEditable(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
      }
      return target.isContentEditable;
    }
    function onDown(e: KeyboardEvent) {
      if (e.code !== 'Space') {
        return;
      }
      if (e.repeat) {
        return;
      }
      if (isEditable(e.target)) {
        return;
      }
      e.preventDefault();
      isSpaceHeldRef.current = true;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = 'grab';
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code !== 'Space') {
        return;
      }
      isSpaceHeldRef.current = false;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = '';
      }
    }
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Tracks the board whose viewport we're currently driving. The snap effect
  // uses this to skip the no-op case where boardId hasn't actually changed
  // (e.g. parent re-render).
  const boardRef = useRef(boardId);

  // Snap to the saved viewport whenever the active board changes. Skip the
  // first run for the same board — the motion values are already correct.
  useEffect(() => {
    if (boardRef.current === boardId) {
      return;
    }
    boardRef.current = boardId;
    const view = readView(boardId);
    zoomMV.set(view.z);
    panX.set(view.x);
    panY.set(view.y);
  }, [boardId, zoomMV, panX, panY]);

  // Persist viewport per-board, debounced. Unsubscribe + flush whenever the
  // active board changes so in-flight changes can't land in the next board's
  // slot.
  useEffect(() => {
    if (!boardId) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    function save() {
      try {
        localStorage.setItem(
          storageKey(boardId!),
          JSON.stringify({ z: zoomMV.get(), x: panX.get(), y: panY.get() }),
        );
      } catch {
        // ignore storage failures
      }
    }
    function schedule() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    }
    const unsubs = [
      zoomMV.on('change', schedule),
      panX.on('change', schedule),
      panY.on('change', schedule),
    ];
    return () => {
      unsubs.forEach((u) => u());
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }, [boardId, zoomMV, panX, panY]);

  useWheel(
    ({ delta: [dx, dy], event }) => {
      event.preventDefault();

      // Browser convention: trackpad pinch arrives as a wheel event with
      // ctrlKey synthesized true (even without ctrl actually held). Plain
      // two-finger scroll has ctrlKey false → pan. Holding ctrl/cmd on a
      // real mouse wheel also zooms.
      const we = event as WheelEvent;
      const isZoom = we.ctrlKey || we.metaKey;

      if (!isZoom) {
        panX.set(panX.get() - dx);
        panY.set(panY.get() - dy);
        return;
      }

      const oldZoom = zoomMV.get();
      const newZoom = Math.min(
        zoomConfig.max,
        Math.max(zoomConfig.min, oldZoom * (1 - dy * zoomConfig.sensitivity)),
      );

      // zoom toward cursor: keep the world point under the cursor fixed
      const rect = canvasRef.current!.getBoundingClientRect();
      const cursorX = we.clientX - rect.left;
      const cursorY = we.clientY - rect.top;
      const ratio = newZoom / oldZoom;

      panX.set(cursorX - (cursorX - panX.get()) * ratio);
      panY.set(cursorY - (cursorY - panY.get()) * ratio);
      zoomMV.set(newZoom);
    },
    { target: canvasRef, eventOptions: { passive: false } },
  );

  const isPanningRef = useRef(false);

  useDrag(
    ({ event, delta: [dx, dy], first, last }) => {
      if (first) {
        // Activate pan when: touch (no modifier needed) OR Space held.
        // event.target === canvasRef.current ensures we don't steal a drag
        // that started on a card.
        const pointerType = (event as PointerEvent).pointerType;
        const allowedByModifier =
          pointerType === 'touch' || isSpaceHeldRef.current;
        isPanningRef.current =
          allowedByModifier && event.target === canvasRef.current;
        if (isPanningRef.current && canvasRef.current) {
          canvasRef.current.style.cursor = 'grabbing';
        }
      }
      if (!isPanningRef.current) {
        return;
      }
      panX.set(panX.get() + dx);
      panY.set(panY.get() + dy);
      if (last) {
        if (canvasRef.current) {
          canvasRef.current.style.cursor = isSpaceHeldRef.current ? 'grab' : '';
        }
        isPanningRef.current = false;
      }
    },
    { target: canvasRef },
  );

  function zoomTo(target: number) {
    const el = canvasRef.current;
    if (!el) {
      return;
    }
    const oldZoom = zoomMV.get();
    const newZoom = Math.min(zoomConfig.max, Math.max(zoomConfig.min, target));
    const ratio = newZoom / oldZoom;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    panX.set(cx - (cx - panX.get()) * ratio);
    panY.set(cy - (cy - panY.get()) * ratio);
    zoomMV.set(newZoom);
  }

  const isPanModifierHeld = useCallback(() => isSpaceHeldRef.current, []);

  return { canvasRef, zoomMV, panX, panY, zoomTo, isPanModifierHeld };
}
