import { type MotionValue } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';
import { screenToCanvas } from '../../lib/canvasMath';
import { useAddTextItem } from '../server/useAddTextItem';
import { useHotkey } from '../useHotkey';

// Bias mirrors useAddUrlFlow so a viewport-center text drop lands above the
// URL bar / any bottom chrome.
const CENTER_Y_BIAS = 200;

// Owns the spawn affordances for empty text items:
//   - press 'T' (canvas focused, no input has focus) → drop at cursor's
//     canvas position
//   - call `spawnAtCenter()` from the TopBar button → drop at viewport
//     center
//
// Both paths fire useAddTextItem; that hook flags the new id for auto-edit
// so the spawned TextCard mounts directly into its textarea. `enabled`
// gates the entire flow — viewers (no BoardEdit) skip the hotkey and the
// imperative spawn is a no-op.
export function useAddTextFlow(
  activeBoardId: string | null,
  panX: MotionValue<number>,
  panY: MotionValue<number>,
  zoomMV: MotionValue<number>,
  enabled: boolean = true,
) {
  const addText = useAddTextItem();

  // Track the last-known mouse position so the 'T' hotkey (which has no
  // pointer coords on its event) can read where the cursor is. Passive +
  // window-scoped — cheap.
  const mouseRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const spawnAt = useCallback(
    (screenX: number, screenY: number) => {
      if (!activeBoardId || !enabled) {
        return;
      }
      const { x, y } = screenToCanvas(
        screenX,
        screenY,
        panX.get(),
        panY.get(),
        zoomMV.get(),
      );
      addText.mutate({
        boardId: activeBoardId,
        item: { content: '', x, y },
      });
    },
    [activeBoardId, enabled, panX, panY, zoomMV, addText],
  );

  const spawnAtCenter = useCallback(() => {
    spawnAt(window.innerWidth / 2, window.innerHeight / 2 - CENTER_Y_BIAS);
  }, [spawnAt]);

  useHotkey(
    't',
    () => {
      const { x, y } = mouseRef.current;
      spawnAt(x, y);
    },
    {
      scope: 'global',
      enabled: enabled && !!activeBoardId,
    },
  );

  return { spawnAtCenter, isPending: addText.isPending };
}
