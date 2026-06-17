import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo } from 'react';
import { canvas, zoom as zoomConfig } from '../../config';
import { useAddTextFlow } from '../../hooks/interaction/useAddTextFlow';
import { useAddUrlFlow } from '../../hooks/interaction/useAddUrlFlow';
import { useCanvasGesture } from '../../hooks/interaction/useCanvasGesture';
import { useDotGridSync } from '../../hooks/interaction/useDotGridSync';
import { useMarquee, type Selectable } from '../../hooks/interaction/useMarquee';
import { usePanForPanel } from '../../hooks/interaction/usePanForPanel';
import { SelectionDragProvider } from '../../hooks/interaction/useSelectionDrag';
import { useBoardRole } from '../../hooks/server/useBoards';
import { useBoardItems } from '../../hooks/server/useBoardItems';
import { can, P } from '../../lib/permissions';
import {
  getVisibleCanvasRect,
  rectsIntersect,
} from '../../lib/canvasMath';
import { useBoardsStore } from '../../store/boards';
import { useCanvasActionsStore } from '../../store/canvasActions';
import { useRailsStore } from '../../store/rails';
import { useSelectionStore } from '../../store/selection';
import AddUrlModal from './AddUrlModal';
import CanvasCard from './CanvasCard';
import MarqueeOverlay from './MarqueeOverlay';
import ZoomBar from './ZoomBar';

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
  const rightWidth = useRailsStore((s) => s.rightWidth);
  const primaryId = useSelectionStore((s) => s.primaryId);

  const { canvasRef, zoomMV, panX, panY, zoomTo, isPanModifierHeld } =
    useCanvasGesture(activeBoardId);

  // Clear selection when the active board changes — selections don't cross
  // board boundaries.
  useEffect(() => {
    useSelectionStore.getState().clear();
  }, [activeBoardId]);

  const getSelectables = useCallback((): Selectable[] => {
    const result: Selectable[] = [];
    for (const item of items) {
      if (item.state !== 'real') {
        continue;
      }
      result.push({
        id: item.id,
        rect: { x: item.x, y: item.y, width: item.width, height: item.height },
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

  usePanForPanel({ primaryId, rightWidth, items, panX, zoom: zoomMV });

  const bgStyle = useDotGridSync(zoomMV, panX, panY);

  const canEdit = can(useBoardRole(activeBoardId), P.BoardEdit);
  const { handleAddUrl, addOpen, setAddOpen, isPending } = useAddUrlFlow(
    activeBoardId,
    panX,
    panY,
    zoomMV,
    canEdit,
  );
  const { spawnAtCenter: spawnText } = useAddTextFlow(
    activeBoardId,
    panX,
    panY,
    zoomMV,
    canEdit,
  );

  // Expose the imperative center-spawn to screen-space chrome (AppUI's
  // TopBar button) — it lives outside the canvas tree and can't grab the
  // pan/zoom MVs directly.
  useEffect(() => {
    const store = useCanvasActionsStore.getState();
    store.setSpawnText(canEdit && activeBoardId ? spawnText : null);
    return () => useCanvasActionsStore.getState().setSpawnText(null);
  }, [spawnText, canEdit, activeBoardId]);

  // Computed once per board (and re-evaluated when items.length changes) so
  // the per-item initiallyVisible flag picks up newly-mounted items. The
  // motion-value snapshot intentionally trails — pan/zoom don't trigger
  // re-renders.
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
            const key = item.state === 'real' ? item.id : item.tempId;
            const initiallyVisible =
              item.state === 'real'
                ? rectsIntersect(visibleRect, {
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                  })
                : false;
            return (
              <CanvasCard
                key={key}
                item={item}
                activeBoardId={activeBoardId}
                initiallyVisible={initiallyVisible}
                zoomMV={zoomMV}
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

      {canEdit && (
        <AddUrlModal
          open={addOpen}
          isPending={isPending}
          onClose={() => setAddOpen(false)}
          onSubmit={handleAddUrl}
        />
      )}
    </div>
  );
}
