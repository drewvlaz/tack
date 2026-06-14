import { useQueryClient } from '@tanstack/react-query';
import { motion, useMotionValueEvent } from 'framer-motion';
import { useCallback, useState } from 'react';
import { canvas, card as cardConfig, zoom as zoomConfig } from '../../config';
import { useCanvasGesture } from '../../hooks/interaction/useCanvasGesture';
import { usePanForPanel } from '../../hooks/interaction/usePanForPanel';
import { useAddItem } from '../../hooks/server/useAddItem';
import { useBoardItems } from '../../hooks/server/useBoardItems';
import { useSyncPosition } from '../../hooks/server/useSyncPosition';
import { useHotkey } from '../../hooks/useHotkey';
import { resolveImageUrl } from '../../lib/api';
import {
  getVisibleCanvasRect,
  rectsIntersect,
  screenToCanvas,
} from '../../lib/canvasMath';
import type { CanvasItem } from '../../lib/trpc';
import { useBoardsStore } from '../../store/boards';
import { useCanvasStore } from '../../store/canvas';
import { useRailsStore } from '../../store/rails';
import AddUrlModal from './AddUrlModal';
import Card from './Card';
import UrlBar from './UrlBar';
import ZoomBar from './ZoomBar';

// Drop new cards slightly above viewport center so the title is readable below
// the user's gaze rather than directly under the cursor.
const ADD_CARD_Y_BIAS = 200;

// Matches the IntersectionObserver `rootMargin` Card uses for its lazy gate —
// keeps the initial-mount seed in agreement with what IO would have decided one
// tick later, avoiding a placeholder flash for cards near the viewport edge.
const LAZY_LOAD_MARGIN_PX = 300;

export default function Canvas() {
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items, isLoading } = useBoardItems(activeBoardId);
  const { selectedId, zIndices, setSelectedId, bringToFront } =
    useCanvasStore();
  const rightWidth = useRailsStore((s) => s.rightWidth);

  const { canvasRef, zoomMV, panX, panY, zoomTo } =
    useCanvasGesture(activeBoardId);
  const syncPosition = useSyncPosition();
  const addItem = useAddItem();
  const queryClient = useQueryClient();

  usePanForPanel({
    selectedId,
    rightWidth,
    items,
    panX,
    zoom: zoomMV,
  });

  const [bgStyle, setBgStyle] = useState(() => ({
    backgroundSize: `${canvas.dotSpacing}px ${canvas.dotSpacing}px`,
    backgroundPosition: '0px 0px',
  }));

  function syncDots() {
    const z = zoomMV.get();
    const spacing = canvas.dotSpacing * z;
    setBgStyle({
      backgroundSize: `${spacing}px ${spacing}px`,
      backgroundPosition: `${panX.get() % spacing}px ${panY.get() % spacing}px`,
    });
  }

  useMotionValueEvent(zoomMV, 'change', syncDots);
  useMotionValueEvent(panX, 'change', syncDots);
  useMotionValueEvent(panY, 'change', syncDots);

  const handleAddUrl = useCallback(
    (url: string) => {
      if (!activeBoardId) {
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
    [activeBoardId, panX, panY, zoomMV, addItem],
  );

  const [addOpen, setAddOpen] = useState(false);
  useHotkey('a', () => setAddOpen(true), {
    scope: 'global',
    enabled: !!activeBoardId,
  });

  // Cmd/Ctrl+V outside any input pastes the clipboard URL straight into a new
  // card. `allowInInputs: false` (default) keeps native paste working in the
  // URL bar, modal, and any other field — the hotkey only fires when focus is
  // on the body/canvas. Clipboard read is gated by browser permissions and a
  // secure context; a denied read is silently ignored.
  useHotkey(
    'mod+v',
    async () => {
      if (!activeBoardId) {
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
    { scope: 'global', enabled: !!activeBoardId, preventDefault: false },
  );

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 z-0 cursor-grab overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedId(null);
        }
      }}
      style={{
        background: canvas.background,
        backgroundImage: `radial-gradient(circle, ${canvas.dotColor} ${canvas.dotSize}px, transparent ${canvas.dotSize}px)`,
        ...bgStyle,
      }}
    >
      <motion.div
        style={{ x: panX, y: panY, scale: zoomMV, transformOrigin: '0 0' }}
      >
        {activeBoardId &&
          !isLoading &&
          (() => {
            // One visible-canvas-rect for the whole items map; used to seed
            // `initiallyVisible` on each Card so cards on screen at mount
            // request their image immediately (and at fetchpriority=high)
            // instead of waiting a frame for IntersectionObserver to tick.
            // pan/zoom MVs don't trigger re-renders, so this snapshot reflects
            // the moment Cards first mount.
            const visibleRect = getVisibleCanvasRect(
              panX.get(),
              panY.get(),
              zoomMV.get(),
              window.innerWidth,
              window.innerHeight,
              LAZY_LOAD_MARGIN_PX,
            );
            return items.map((item) => {
              if (item.kind === 'skeleton') {
                return (
                  <Card
                    key={item.tempId}
                    id={item.tempId}
                    title=""
                    imageUrl=""
                    initialX={item.x}
                    initialY={item.y}
                    width={item.width}
                    height={item.height}
                    zIndex={item.zIndex}
                    isSkeleton
                    getZoom={() => zoomMV.get()}
                    onDragEnd={(x, y) => {
                      // Persist the dragged position onto the cached skeleton
                      // so `useAddItem.onSuccess` carries it through to the
                      // real item on swap (and PATCHes the server). Without
                      // this, the card snaps back to the original drop point
                      // when the real item arrives.
                      const key = ['boards', activeBoardId, 'items'];
                      queryClient.setQueryData<CanvasItem[]>(key, (old = []) =>
                        old.map((i) =>
                          i.kind === 'skeleton' && i.tempId === item.tempId
                            ? { ...i, x, y }
                            : i,
                        ),
                      );
                    }}
                  />
                );
              }
              const initiallyVisible = rectsIntersect(visibleRect, {
                x: item.x,
                y: item.y,
                width: item.width,
                height: item.height,
              });
              return (
                <Card
                  key={item.id}
                  id={item.id}
                  title={item.title ?? ''}
                  imageUrl={resolveImageUrl(item.images[0]?.url) ?? ''}
                  initialX={item.x}
                  initialY={item.y}
                  width={item.width}
                  height={item.height}
                  zIndex={zIndices[item.id] ?? item.zIndex}
                  initiallyVisible={initiallyVisible}
                  getZoom={() => zoomMV.get()}
                  onTap={() => setSelectedId(item.id)}
                  onBringToFront={() => {
                    const realItems = items.filter(
                      (i): i is typeof item => i.kind === 'real',
                    );
                    const newZ = bringToFront(item.id, realItems);
                    if (newZ !== null) {
                      syncPosition.mutate({ id: item.id, zIndex: newZ });
                    }
                  }}
                  onDragEnd={(x, y) =>
                    syncPosition.mutate({ id: item.id, x, y })
                  }
                  onResizeEnd={(next) =>
                    syncPosition.mutate({ id: item.id, ...next })
                  }
                />
              );
            });
          })()}
      </motion.div>

      {!activeBoardId && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-fg-subtle text-sm">Select or create a board</p>
        </div>
      )}

      <ZoomBar
        zoomMV={zoomMV}
        onZoomIn={() => zoomTo(zoomMV.get() + zoomConfig.step)}
        onZoomOut={() => zoomTo(zoomMV.get() - zoomConfig.step)}
        onReset={() => zoomTo(zoomConfig.initial)}
      />

      {activeBoardId && (
        <UrlBar onAdd={handleAddUrl} isPending={addItem.isPending} />
      )}

      <AddUrlModal
        open={addOpen}
        isPending={addItem.isPending}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddUrl}
      />
    </div>
  );
}
