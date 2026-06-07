import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteItem } from '../../api/boards';
import type { CanvasItem } from '../../lib/trpc';

export function useDeleteItem(boardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['boards', boardId, 'items'];
  const trashKey = ['boards', boardId, 'trash'];

  return useMutation({
    mutationFn: (id: string) => deleteItem(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CanvasItem[]>(queryKey);
      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.filter((i) => i.kind !== 'real' || i.id !== id),
      );
      return { previous };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKey, ctx.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trashKey });
    },
  });
}
