import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchBoardItems, type ItemPatch } from '../../api/boards';
import type { CanvasItem } from '../../lib/trpc';
import { useBoardsStore } from '../../store/boards';

// Patches for any subset of x/y/width/height/zIndex. Handles both single-card
// commits (single-element array) and group-drag commits (multi-element
// array). One mutation, one batch tRPC call per release; the worker wraps
// each batch in withTransaction for atomicity.
//
// Callers don't await the server — Framer Motion is already showing the final
// positions/sizes. The cache write in onMutate still matters: anything that
// reads geometry from the query cache (marquee hit-testing, pan-for-panel,
// lazy-load visibility) would otherwise see pre-drag rects. No rollback on
// error: the cards' motion values stay put, so the cache should too.
export function usePatchItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patches: Array<{ id: string; patch: ItemPatch }>) =>
      patchBoardItems(patches),

    onMutate: (patches) => {
      const queryKey = [
        'boards',
        useBoardsStore.getState().activeBoardId,
        'items',
      ];
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      queryClient.setQueryData<CanvasItem[]>(queryKey, (old) =>
        old?.map((item) => {
          if (item.state !== 'real') {
            return item;
          }
          const patch = byId.get(item.id);
          return patch ? { ...item, ...patch } : item;
        }),
      );
    },
  });
}
