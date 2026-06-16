import { useQuery } from '@tanstack/react-query';
import { listMembers, type BoardMember } from '../../api/boards';

export type { BoardMember };

export function boardMembersQueryKey(boardId: string) {
  return ['boards', boardId, 'members'] as const;
}

// P.BoardView on the server — every member (owner/editor/viewer) sees the
// list. Non-members throw NOT_FOUND.
export function useBoardMembers(boardId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: boardId ? boardMembersQueryKey(boardId) : ['boards', null, 'members'],
    queryFn: () => listMembers(boardId!),
    enabled: !!boardId,
    staleTime: Infinity,
  });
  return { members: data ?? [], isLoading, error };
}
