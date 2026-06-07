import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBoard } from '../../api/boards';
import type { Board } from '../../lib/trpc';
import { useBoardsStore } from '../../store/boards';
import { BOARDS_QUERY_KEY } from './useBoards';

export function useCreateBoard() {
  const queryClient = useQueryClient();
  const setActiveBoardId = useBoardsStore((s) => s.setActiveBoardId);

  return useMutation({
    mutationFn: (name: string) => createBoard(name),

    onMutate: async (name: string) => {
      await queryClient.cancelQueries({ queryKey: BOARDS_QUERY_KEY });
      const previous = queryClient.getQueryData<Board[]>(BOARDS_QUERY_KEY);
      const optimistic: Board = {
        id: `__pending__${Date.now()}`,
        name,
        createdAt: Math.floor(Date.now() / 1000),
      };
      queryClient.setQueryData<Board[]>(BOARDS_QUERY_KEY, (old = []) => [
        ...old,
        optimistic,
      ]);
      return { previous, optimisticId: optimistic.id };
    },

    onSuccess: (newBoard, _name, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData<Board[]>(BOARDS_QUERY_KEY, (old = []) =>
        old.map((b) => (b.id === ctx.optimisticId ? newBoard : b)),
      );
      setActiveBoardId(newBoard.id);
    },

    onError: (_err, _name, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(BOARDS_QUERY_KEY, ctx.previous);
      }
    },
  });
}
