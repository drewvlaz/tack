import {
  animate,
  motion,
  useMotionValueEvent,
  type AnimationPlaybackControls,
} from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canvas,
  card as cardConfig,
  spring,
  zoom as zoomConfig,
} from '../../config';
import { useCanvasGesture } from '../../hooks/interaction/useCanvasGesture';
import { useAddItem } from '../../hooks/server/useAddItem';
import { useBoardItems } from '../../hooks/server/useBoardItems';
import { useSyncPosition } from '../../hooks/server/useSyncPosition';
import { useHotkey } from '../../hooks/useHotkey';
import { resolveImageUrl } from '../../lib/api';
import { useBoardsStore } from '../../store/boards';
import { useCanvasStore } from '../../store/canvas';
import { useRailsStore } from '../../store/rails';
import AddUrlModal from './AddUrlModal';
import Card from './Card';
import UrlBar from './UrlBar';
import ZoomBar from './ZoomBar';

const PANEL_EDGE_MARGIN = 24;

export default function Canvas() {
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items, isLoading } = useBoardItems(activeBoardId);
  const { selectedId, zIndices, setSelectedId, bringToFront } =
    useCanvasStore();
  const rightWidth = useRailsStore((s) => s.rightWidth);

  const { canvasRef, zoomMV, panX, panY, zoomTo } = useCanvasGesture();
  const syncPosition = useSyncPosition();
  const addItem = useAddItem();

  const panelOffsetRef = useRef(0);
  const panAnimRef = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    const wasOpen = panelOffsetRef.current !== 0;
    const isOpen = selectedId !== null;
    if (isOpen && !wasOpen) {
      const selected = items.find(
        (i) => i.kind === 'real' && i.id === selectedId,
      );
      if (!selected) return;

      const z = zoomMV.get();
      const itemRightScreen = panX.get() + (selected.x + selected.width) * z;
      const panelLeftScreen = window.innerWidth - rightWidth;
      const overlap = itemRightScreen - (panelLeftScreen - PANEL_EDGE_MARGIN);
      if (overlap <= 0) return;

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
  }, [selectedId, rightWidth, panX, zoomMV, items]);

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
      if (!activeBoardId) return;
      const x =
        (-panX.get() + window.innerWidth / 2 - cardConfig.width / 2) /
        zoomMV.get();
      const y = (-panY.get() + window.innerHeight / 2 - 200) / zoomMV.get();
      addItem.mutate({ url, boardId: activeBoardId, x, y });
    },
    [activeBoardId, panX, panY, zoomMV, addItem],
  );

  const [addOpen, setAddOpen] = useState(false);
  useHotkey('a', () => setAddOpen(true), {
    scope: 'global',
    enabled: !!activeBoardId,
  });

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 z-0 cursor-grab overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelectedId(null);
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
                  isSkeleton
                />
              );
            }
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
                getZoom={() => zoomMV.get()}
                onTap={() => setSelectedId(item.id)}
                onBringToFront={() => {
                  const realItems = items.filter(
                    (i): i is typeof item => i.kind === 'real',
                  );
                  const newZ = bringToFront(item.id, realItems);
                  if (newZ !== null)
                    syncPosition.mutate({ id: item.id, zIndex: newZ });
                }}
                onDragEnd={(x, y) => syncPosition.mutate({ id: item.id, x, y })}
                onResizeEnd={(next) =>
                  syncPosition.mutate({ id: item.id, ...next })
                }
              />
            );
          })}
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
