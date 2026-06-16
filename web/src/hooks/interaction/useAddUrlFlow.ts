import { type MotionValue } from 'framer-motion';
import { useCallback, useState } from 'react';
import { card as cardConfig } from '../../config';
import { screenToCanvas } from '../../lib/canvasMath';
import { useAddItem } from '../server/useAddItem';
import { useHotkey } from '../useHotkey';

const ADD_CARD_Y_BIAS = 200;

// Owns the affordances for getting a new URL onto the active board: the
// AddUrlModal open/close state, the "a" hotkey that opens it, and the
// Cmd/Ctrl+V shortcut that turns a clipboard URL into an immediate add.
// New cards drop at the visual center of the viewport, biased up so they
// sit above the URL bar.
//
// `enabled` gates the entire flow — when false (viewer role), the hotkeys
// don't bind and `handleAddUrl` is a no-op. The caller is also expected to
// suppress the URL bar from the UI.
export function useAddUrlFlow(
  activeBoardId: string | null,
  panX: MotionValue<number>,
  panY: MotionValue<number>,
  zoomMV: MotionValue<number>,
  enabled: boolean = true,
) {
  const addItem = useAddItem();
  const [addOpen, setAddOpen] = useState(false);

  const handleAddUrl = useCallback(
    (url: string) => {
      if (!activeBoardId || !enabled) {
        return;
      }
      const { x, y } = screenToCanvas(
        window.innerWidth / 2 - cardConfig.width / 2,
        window.innerHeight / 2 - ADD_CARD_Y_BIAS,
        panX.get(),
        panY.get(),
        zoomMV.get(),
      );
      addItem.mutate({ url, boardId: activeBoardId, x, y });
    },
    [activeBoardId, enabled, panX, panY, zoomMV, addItem],
  );

  useHotkey('a', () => setAddOpen(true), {
    scope: 'global',
    enabled: enabled && !!activeBoardId,
  });

  useHotkey(
    'mod+v',
    async () => {
      if (!activeBoardId || !enabled) {
        return;
      }
      const text = await navigator.clipboard.readText().catch(() => '');
      const url = text.trim();
      if (!url) {
        return;
      }
      try {
        new URL(url);
      } catch {
        return;
      }
      handleAddUrl(url);
    },
    {
      scope: 'global',
      enabled: enabled && !!activeBoardId,
      preventDefault: false,
    },
  );

  return {
    handleAddUrl,
    addOpen,
    setAddOpen,
    isPending: addItem.isPending,
  };
}
