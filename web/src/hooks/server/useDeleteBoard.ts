import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteBoard } from '../../api/boards';
import type { Board } from '../../lib/trpc';
import { useBoardsStore } from '../../store/boards';
import { BOARDS_QUERY_KEY } from './useBoards';

export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBoard(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: BOARDS_QUERY_KEY });
      const previous = queryClient.getQueryData<Board[]>(BOARDS_QUERY_KEY);
      queryClient.setQueryData<Board[]>(BOARDS_QUERY_KEY, (old = []) =>
        old.filter((b) => b.id !== id),
      );
      return { previous };
    },

    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ['boards', id, 'items'] });
      const { activeBoardId, setActiveBoardId } = useBoardsStore.getState();
      if (activeBoardId === id) {
        const remaining =
          queryClient.getQueryData<Board[]>(BOARDS_QUERY_KEY) ?? [];
        setActiveBoardId(remaining[0]?.id ?? null);
      }
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(BOARDS_QUERY_KEY, ctx.previous);
      }
    },
  });
}
