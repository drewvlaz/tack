import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emptyTrash } from '../../api/boards';
import type { BoardItem } from '../../lib/trpc';

export function useEmptyTrash(boardId: string) {
  const queryClient = useQueryClient();
  const trashKey = ['boards', boardId, 'trash'];

  return useMutation({
    mutationFn: () => emptyTrash(boardId),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: trashKey });
      const previous = queryClient.getQueryData<BoardItem[]>(trashKey);
      queryClient.setQueryData<BoardItem[]>(trashKey, []);
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(trashKey, ctx.previous);
      }
    },
  });
}
