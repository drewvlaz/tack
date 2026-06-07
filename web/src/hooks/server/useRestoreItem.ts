import { useMutation, useQueryClient } from '@tanstack/react-query';
import { restoreItem } from '../../api/boards';
import type { BoardItem, CanvasItem } from '../../lib/trpc';

export function useRestoreItem(boardId: string) {
  const queryClient = useQueryClient();
  const trashKey = ['boards', boardId, 'trash'];
  const itemsKey = ['boards', boardId, 'items'];

  return useMutation({
    mutationFn: (id: string) => restoreItem(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: trashKey });
      const previousTrash = queryClient.getQueryData<BoardItem[]>(trashKey);
      const restored = previousTrash?.find((i) => i.id === id);

      queryClient.setQueryData<BoardItem[]>(trashKey, (old = []) =>
        old.filter((i) => i.id !== id),
      );

      if (restored) {
        queryClient.setQueryData<CanvasItem[]>(itemsKey, (old = []) => [
          ...old,
          { ...restored, kind: 'real' },
        ]);
      }

      return { previousTrash };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previousTrash) {
        queryClient.setQueryData(trashKey, ctx.previousTrash);
      }
      queryClient.invalidateQueries({ queryKey: itemsKey });
    },
  });
}
