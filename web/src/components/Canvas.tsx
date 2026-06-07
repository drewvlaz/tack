import { useState } from 'react';
import { motion, useMotionValueEvent } from 'framer-motion';
import Card from './Card';
import ZoomBar from './ZoomBar';
import UrlBar from './UrlBar';
import { canvas, card as cardConfig, zoom as zoomConfig } from '../config';
import { useCanvasGesture } from '../hooks/useCanvasGesture';
import { useBoardItems } from '../hooks/useBoardItems';
import { useSyncPosition } from '../hooks/useSyncPosition';
import { useAddItem, isSkeleton } from '../hooks/useAddItem';
import { useCanvasStore } from '../store/canvas';
import { useBoardsStore } from '../store/boards';
import { resolveImageUrl } from '../lib/api';

export default function Canvas() {
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items, isLoading } = useBoardItems(activeBoardId);
  const { zIndices, setSelectedId, bringToFront } = useCanvasStore();

  const { canvasRef, zoomMV, panX, panY, zoomTo } = useCanvasGesture();
  const syncPosition = useSyncPosition();
  const addItem = useAddItem();

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

  function handleAddUrl(url: string) {
    if (!activeBoardId) return;
    const x = (-panX.get() + window.innerWidth / 2 - cardConfig.width / 2) / zoomMV.get();
    const y = (-panY.get() + window.innerHeight / 2 - 200) / zoomMV.get();
    addItem.mutate({ url, boardId: activeBoardId, x, y });
  }

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
      <motion.div style={{ x: panX, y: panY, scale: zoomMV, transformOrigin: '0 0' }}>
        {activeBoardId && !isLoading &&
          items.map((item) => (
            <Card
              key={item.id}
              id={item.id}
              title={item.title ?? ''}
              price={item.price}
              imageUrl={resolveImageUrl(item.imageUrls[0]) ?? ''}
              initialX={item.x}
              initialY={item.y}
              width={item.width}
              height={item.height}
              zIndex={zIndices[item.id] ?? item.zIndex}
              getZoom={() => zoomMV.get()}
              isSkeleton={isSkeleton(item.id)}
              onTap={() => {
                if (!isSkeleton(item.id)) setSelectedId(item.id);
              }}
              onBringToFront={() => bringToFront(item.id)}
              onDragEnd={(x, y) => {
                if (!isSkeleton(item.id)) syncPosition.mutate({ id: item.id, x, y });
              }}
              onResizeEnd={(next) => {
                if (!isSkeleton(item.id)) syncPosition.mutate({ id: item.id, ...next });
              }}
            />
          ))}
      </motion.div>

      {!activeBoardId && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-fg-subtle">Select or create a board</p>
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
    </div>
  );
}
