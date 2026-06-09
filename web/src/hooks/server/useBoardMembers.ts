import { useQuery } from '@tanstack/react-query';
import { listMembers, type BoardMember } from '../../api/boards';

export type { BoardMember };

export function boardMembersQueryKey(boardId: string) {
  return ['boards', boardId, 'members'] as const;
}

// Owner-only on the server; for editors / non-members the underlying call
// throws FORBIDDEN/NOT_FOUND. Components gate on `board.role === 'owner'`
// before mounting this hook.
export function useBoardMembers(boardId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: boardId ? boardMembersQueryKey(boardId) : ['boards', null, 'members'],
    queryFn: () => listMembers(boardId!),
    enabled: !!boardId,
    staleTime: Infinity,
  });
  return { members: data ?? [], isLoading, error };
}
