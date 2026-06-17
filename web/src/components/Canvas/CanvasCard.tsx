import { useQueryClient } from '@tanstack/react-query';
import { type MotionValue } from 'framer-motion';
import { useCallback, useEffect } from 'react';
import { useSelectionDrag } from '../../hooks/interaction/useSelectionDrag';
import { useBoardRole } from '../../hooks/server/useBoards';
import { usePatchItems } from '../../hooks/server/usePatchItems';
import { usePatchTextItem } from '../../hooks/server/usePatchTextItem';
import { resolveImageUrl } from '../../lib/api';
import { can, P } from '../../lib/permissions';
import type { CanvasItem, RealItem, SkeletonItem } from '../../lib/trpc';
import { useTextEditStore } from '../../store/textEdit';
import { useCanvasStore } from '../../store/canvas';
import { useSelectionStore } from '../../store/selection';
import Card from './Card';
import TextCard from './TextCard';

// Thin adapter between the canvas item shape and the Card view. Canvas.tsx
// stays a composer: it maps items → <CanvasCard />, and the adapter wires
// every per-card concern (selection bits, query cache writes, bringToFront,
// position persistence). Card itself remains agnostic of stores and queries.

type Props = {
  item: CanvasItem;
  activeBoardId: string;
  initiallyVisible: boolean;
  zoomMV: MotionValue<number>;
};

export default function CanvasCard(props: Props) {
  if (props.item.state === 'skeleton') {
    return (
      <SkeletonCanvasCard
        item={props.item}
        activeBoardId={props.activeBoardId}
        zoomMV={props.zoomMV}
      />
    );
  }
  if (props.item.kind === 'text') {
    return (
      <TextCanvasCard
        item={props.item}
        activeBoardId={props.activeBoardId}
      />
    );
  }
  return (
    <RealCanvasCard
      item={props.item}
      activeBoardId={props.activeBoardId}
      initiallyVisible={props.initiallyVisible}
      zoomMV={props.zoomMV}
    />
  );
}

function SkeletonCanvasCard({
  item,
  activeBoardId,
  zoomMV,
}: {
  item: SkeletonItem;
  activeBoardId: string;
  zoomMV: MotionValue<number>;
}) {
  const queryClient = useQueryClient();
  const getZoom = useCallback(() => zoomMV.get(), [zoomMV]);

  return (
    <Card
      id={item.tempId}
      title=""
      imageUrl=""
      initialX={item.x}
      initialY={item.y}
      width={item.width}
      height={item.height}
      zIndex={item.zIndex}
      isSkeleton
      getZoom={getZoom}
      onDragEnd={(x, y) => {
        const key = ['boards', activeBoardId, 'items'];
        queryClient.setQueryData<CanvasItem[]>(key, (old = []) =>
          old.map((i) =>
            i.state === 'skeleton' && i.tempId === item.tempId
              ? { ...i, x, y }
              : i,
          ),
        );
      }}
    />
  );
}

type TextRealItem = Extract<RealItem, { kind: 'text' }>;

function TextCanvasCard({
  item,
  activeBoardId,
}: {
  item: TextRealItem;
  activeBoardId: string;
}) {
  const role = useBoardRole(activeBoardId);
  const canEdit = can(role, P.BoardEdit);
  const patchText = usePatchTextItem();
  // Read the flag for THIS render's pass to TextCard (its useState initializer
  // captures it), then consume after mount so the flag doesn't sit around for
  // a later remount.
  const id = item.id;
  const autoEdit = useTextEditStore((s) => s.pendingEditId === id);
  useEffect(() => {
    if (autoEdit) {
      useTextEditStore.getState().consume(id);
    }
    // Mount-only: consuming a stale flag is what we want; subsequent flag
    // changes are for other cards, not this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextCard
      id={item.id}
      content={item.textContent}
      fontSize={item.textFontSize}
      fontWeight={item.textWeight}
      colorToken={item.textColorToken}
      align={item.textAlign}
      x={item.x}
      y={item.y}
      zIndex={item.zIndex}
      canEdit={canEdit}
      autoEditOnMount={autoEdit}
      onCommit={(content) =>
        patchText.mutate({
          id: item.id,
          boardId: activeBoardId,
          patch: { content },
        })
      }
    />
  );
}

// Narrowed prop type — Canvas + the parent CanvasCard guard guarantee a
// product-kind real item by the time this renders.
type ProductRealItem = Extract<RealItem, { kind: 'product' }>;

function RealCanvasCard({
  item,
  activeBoardId,
  initiallyVisible,
  zoomMV,
}: {
  item: ProductRealItem;
  activeBoardId: string;
  initiallyVisible: boolean;
  zoomMV: MotionValue<number>;
}) {
  const queryClient = useQueryClient();
  const patchItems = usePatchItems();
  const selectionDrag = useSelectionDrag();
  const bringToFront = useCanvasStore((s) => s.bringToFront);
  const zOverride = useCanvasStore((s) => s.zIndices[item.id]);
  const role = useBoardRole(activeBoardId);
  const canEdit = can(role, P.BoardEdit);

  const id = item.id;
  // Two stable single-key subscriptions — each Card only re-renders when its
  // own selection bit or its own group bit flips, not on every selection
  // change anywhere on the board.
  const isSelected = useSelectionStore(
    useCallback((s) => s.ids.has(id), [id]),
  );
  const inGroup = useSelectionStore(
    useCallback((s) => s.ids.has(id) && s.ids.size > 1, [id]),
  );

  const getZoom = useCallback(() => zoomMV.get(), [zoomMV]);

  const handleTap = useCallback(
    (mods: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      const selection = useSelectionStore.getState();
      if (mods.metaKey || mods.ctrlKey) {
        selection.toggle(id);
      } else if (mods.shiftKey) {
        selection.add(id);
      } else {
        selection.replace(id);
      }
    },
    [id],
  );

  const handleBringToFront = useCallback(() => {
    // Reads items via getQueryData rather than useBoardItems — subscribing
    // every CanvasCard to the full items list would multiply re-renders by N.
    const all =
      queryClient.getQueryData<CanvasItem[]>([
        'boards',
        activeBoardId,
        'items',
      ]) ?? [];
    const realItems = all.filter((i): i is RealItem => i.state === 'real');
    const newZ = bringToFront(id, realItems);
    if (newZ !== null) {
      patchItems.mutate([{ id, patch: { zIndex: newZ } }]);
    }
  }, [queryClient, activeBoardId, bringToFront, patchItems, id]);

  // Selection-aware drag decisions live here, not in the gesture. For
  // modifier-held gestures (Shift / Cmd / Ctrl), do nothing on drag-start —
  // selection logic is fully owned by handleTap, which fires on the final
  // tap-classified emit. use-gesture can fire BOTH first (drag threshold
  // crossed) and tap (net distance ≤ threshold at release) for the same
  // trackpad twitch; routing modifier semantics through the tap emit only
  // keeps the toggle correct without depending on which path use-gesture
  // takes. For plain (no-modifier) drags, replace the selection if the
  // dragged card isn't already in it — drag-move and drag-end then operate
  // on that selection.
  const handleDragStart = useCallback(
    (mods: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      if (mods.metaKey || mods.ctrlKey || mods.shiftKey) {
        return;
      }
      const sel = useSelectionStore.getState();
      if (!sel.ids.has(id)) {
        sel.replace(id);
      }
    },
    [id],
  );

  const handleDragMove = useCallback(
    (dx: number, dy: number) => {
      const ids = useSelectionStore.getState().ids;
      if (ids.size > 1 && ids.has(id)) {
        selectionDrag.driveDelta(id, dx, dy);
      }
    },
    [id, selectionDrag],
  );

  const handleDragEnd = useCallback(
    (x: number, y: number) => {
      const ids = useSelectionStore.getState().ids;
      if (ids.size > 1 && ids.has(id)) {
        selectionDrag.commit();
      } else {
        patchItems.mutate([{ id, patch: { x, y } }]);
      }
    },
    [id, selectionDrag, patchItems],
  );

  return (
    <Card
      id={id}
      title={item.title ?? ''}
      imageUrl={resolveImageUrl(item.images[0]?.url) ?? ''}
      initialX={item.x}
      initialY={item.y}
      width={item.width}
      height={item.height}
      zIndex={zOverride ?? item.zIndex}
      initiallyVisible={initiallyVisible}
      isSelected={isSelected}
      getZoom={getZoom}
      onTap={handleTap}
      // Omitted when in-group so pointerdown doesn't pop the dragged card
      // out of the group's z-order.
      onBringToFront={inGroup ? undefined : handleBringToFront}
      onDragStart={canEdit ? handleDragStart : undefined}
      onDragMove={canEdit ? handleDragMove : undefined}
      onDragEnd={canEdit ? handleDragEnd : undefined}
      onResizeEnd={
        canEdit ? (next) => patchItems.mutate([{ id, patch: next }]) : undefined
      }
      interactionsEnabled={canEdit}
    />
  );
}
