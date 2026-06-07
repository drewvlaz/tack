import { useDrag, useWheel } from '@use-gesture/react';
import { useMotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { zoom as zoomConfig } from '../../config';

const STORAGE_KEY = 'canvasView';
const SAVE_DEBOUNCE_MS = 150;

type View = { z: number; x: number; y: number };

function readInitialView(): View {
  const fallback: View = { z: zoomConfig.initial, x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
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
    return fallback;
  } catch {
    return fallback;
  }
}

export function useCanvasGesture() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(readInitialView);
  const zoomMV = useMotionValue<number>(initial.z);
  const panX = useMotionValue(initial.x);
  const panY = useMotionValue(initial.y);

  // Persist zoom + pan to localStorage, debounced — avoids hammering during gestures.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function save() {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ z: zoomMV.get(), x: panX.get(), y: panY.get() }),
        );
      } catch {
        // ignore storage failures
      }
    }
    function schedule() {
      if (timer) clearTimeout(timer);
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
  }, [zoomMV, panX, panY]);

  useWheel(
    ({ delta: [, dy], event }) => {
      event.preventDefault();

      const oldZoom = zoomMV.get();
      const newZoom = Math.min(
        zoomConfig.max,
        Math.max(zoomConfig.min, oldZoom * (1 - dy * zoomConfig.sensitivity)),
      );

      // zoom toward cursor: keep the world point under the cursor fixed
      const rect = canvasRef.current!.getBoundingClientRect();
      const cursorX = (event as WheelEvent).clientX - rect.left;
      const cursorY = (event as WheelEvent).clientY - rect.top;
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
        isPanningRef.current = event.target === canvasRef.current;
        if (isPanningRef.current && canvasRef.current) {
          canvasRef.current.style.cursor = 'grabbing';
        }
      }
      if (!isPanningRef.current) return;
      panX.set(panX.get() + dx);
      panY.set(panY.get() + dy);
      if (last) {
        if (canvasRef.current) canvasRef.current.style.cursor = '';
        isPanningRef.current = false;
      }
    },
    { target: canvasRef },
  );

  function zoomTo(target: number) {
    const el = canvasRef.current;
    if (!el) return;
    const oldZoom = zoomMV.get();
    const newZoom = Math.min(zoomConfig.max, Math.max(zoomConfig.min, target));
    const ratio = newZoom / oldZoom;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    panX.set(cx - (cx - panX.get()) * ratio);
    panY.set(cy - (cy - panY.get()) * ratio);
    zoomMV.set(newZoom);
  }

  return { canvasRef, zoomMV, panX, panY, zoomTo };
}
