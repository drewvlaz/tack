import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteItems } from '../../api/boards';
import type { CanvasItem } from '../../lib/trpc';

// Batch soft-delete with optimistic removal. Atomic on the worker —
// all-or-nothing matches the user contract ("N items will be removed").
export function useDeleteItems(boardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['boards', boardId, 'items'];
  const trashKey = ['boards', boardId, 'trash'];

  return useMutation({
    mutationFn: (ids: string[]) => deleteItems(ids),

    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CanvasItem[]>(queryKey);
      const toRemove = new Set(ids);
      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.filter((i) => i.state !== 'real' || !toRemove.has(i.id)),
      );
      return { previous };
    },

    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKey, ctx.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trashKey });
    },
  });
}
