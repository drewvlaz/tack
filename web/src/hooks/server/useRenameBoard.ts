import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renameBoard } from '../../api/boards';
import type { Board } from '../../lib/trpc';
import { BOARDS_QUERY_KEY } from './useBoards';

type Args = { id: string; name: string };

export function useRenameBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: Args) => renameBoard(id, name),

    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: BOARDS_QUERY_KEY });
      const previous = queryClient.getQueryData<Board[]>(BOARDS_QUERY_KEY);
      queryClient.setQueryData<Board[]>(BOARDS_QUERY_KEY, (old = []) =>
        old.map((b) => (b.id === id ? { ...b, name } : b)),
      );
      return { previous };
    },

    onSuccess: (updated) => {
      queryClient.setQueryData<Board[]>(BOARDS_QUERY_KEY, (old = []) =>
        old.map((b) => (b.id === updated.id ? updated : b)),
      );
    },

    onError: (_err, _args, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(BOARDS_QUERY_KEY, ctx.previous);
      }
    },
  });
}
