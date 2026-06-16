import { useQuery } from '@tanstack/react-query';
import { listBoards } from '../../api/boards';
import type { BoardRole } from '../../lib/permissions';
import type { Board } from '../../lib/trpc';

export type { Board };

export const BOARDS_QUERY_KEY = ['boards'] as const;

export function useBoards() {
  const { data, isLoading, error } = useQuery({
    queryKey: BOARDS_QUERY_KEY,
    queryFn: () => listBoards(),
    staleTime: Infinity,
  });

  return { boards: data ?? [], isLoading, error };
}

// Resolves the caller's role on a board from the cached boards list. Returns
// null while the list is loading or when the board isn't accessible — pair
// with `can(role, P.X)` from lib/permissions to gate UI.
export function useBoardRole(boardId: string | null): BoardRole | null {
  const { boards } = useBoards();
  if (!boardId) {
    return null;
  }
  return boards.find((b) => b.id === boardId)?.role ?? null;
}
