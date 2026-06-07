import { useMutation, useQueryClient } from '@tanstack/react-query';
import { purgeItem } from '../../api/boards';
import type { BoardItem } from '../../lib/trpc';

export function usePurgeItem(boardId: string) {
  const queryClient = useQueryClient();
  const trashKey = ['boards', boardId, 'trash'];

  return useMutation({
    mutationFn: (id: string) => purgeItem(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: trashKey });
      const previous = queryClient.getQueryData<BoardItem[]>(trashKey);
      queryClient.setQueryData<BoardItem[]>(trashKey, (old = []) =>
        old.filter((i) => i.id !== id),
      );
      return { previous };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(trashKey, ctx.previous);
      }
    },
  });
}
