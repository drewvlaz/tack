import { useQueryClient } from '@tanstack/react-query';
import { motion, useMotionValueEvent } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { canvas, card as cardConfig, zoom as zoomConfig } from '../../config';
import { useCanvasGesture } from '../../hooks/interaction/useCanvasGesture';
import { useMarquee, type Selectable } from '../../hooks/interaction/useMarquee';
import { usePanForPanel } from '../../hooks/interaction/usePanForPanel';
import { SelectionDragProvider } from '../../hooks/interaction/useSelectionDrag';
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
import { useSelectionStore } from '../../store/selection';
import AddUrlModal from './AddUrlModal';
import Card from './Card';
import MarqueeOverlay from './MarqueeOverlay';
import UrlBar from './UrlBar';
import ZoomBar from './ZoomBar';

const ADD_CARD_Y_BIAS = 200;
const LAZY_LOAD_MARGIN_PX = 300;

export default function Canvas() {
  return (
    <SelectionDragProvider>
      <CanvasInner />
    </SelectionDragProvider>
  );
}

function CanvasInner() {
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items, isLoading } = useBoardItems(activeBoardId);
  const { zIndices, bringToFront } = useCanvasStore();
  const rightWidth = useRailsStore((s) => s.rightWidth);
  const selectionIds = useSelectionStore((s) => s.ids);
  const primaryId = useSelectionStore((s) => s.primaryId);

  const { canvasRef, zoomMV, panX, panY, zoomTo, isPanModifierHeld } =
    useCanvasGesture(activeBoardId);
  const syncPosition = useSyncPosition();
  const addItem = useAddItem();
  const queryClient = useQueryClient();

  // Clear selection when the active board changes — selections don't cross
  // board boundaries.
  useEffect(() => {
    useSelectionStore.getState().clear();
  }, [activeBoardId]);

  // Provide the marquee hook a closure over the current real items as
  // selectables. Skeletons are filtered out — they're not yet persisted and
  // shouldn't participate in selection.
  const getSelectables = useCallback((): Selectable[] => {
    const result: Selectable[] = [];
    for (const item of items) {
      if (item.kind !== 'real') {
        continue;
      }
      result.push({
        id: item.id,
        rect: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        },
      });
    }
    return result;
  }, [items]);

  const { rect: marqueeRect } = useMarquee({
    canvasRef,
    panX,
    panY,
    zoomMV,
    getSelectables,
    isPanModifierHeld,
  });

  usePanForPanel({
    primaryId,
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

  const inMultiSelect = selectionIds.size > 1;

  const visibleRect = useMemo(
    () =>
      getVisibleCanvasRect(
        panX.get(),
        panY.get(),
        zoomMV.get(),
        window.innerWidth,
        window.innerHeight,
        LAZY_LOAD_MARGIN_PX,
      ),
    // We intentionally only compute this once on first paint per board —
    // pan/zoom MVs don't trigger re-renders. Recomputing on items mount is
    // also fine because it's cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBoardId, items.length],
  );

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 z-0 cursor-grab overflow-hidden select-none"
      onDragStart={(e) => e.preventDefault()}
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
          items.map((item) => {
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
            const isSelected = selectionIds.has(item.id);
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
                isSelected={isSelected}
                inMultiSelect={inMultiSelect && isSelected}
                getZoom={() => zoomMV.get()}
                onTap={(mods) => {
                  const selection = useSelectionStore.getState();
                  if (mods.metaKey || mods.ctrlKey) {
                    selection.toggle(item.id);
                  } else if (mods.shiftKey) {
                    selection.add(item.id);
                  } else {
                    selection.replace(item.id);
                  }
                }}
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
                onDragStartIfUnselected={() =>
                  useSelectionStore.getState().replace(item.id)
                }
                onResizeEnd={(next) =>
                  syncPosition.mutate({ id: item.id, ...next })
                }
              />
            );
          })}
      </motion.div>

      <MarqueeOverlay rect={marqueeRect} />

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
