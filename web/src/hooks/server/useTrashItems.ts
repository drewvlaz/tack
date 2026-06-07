import { useQuery } from '@tanstack/react-query';
import { listTrash } from '../../api/boards';
import type { BoardItem } from '../../lib/trpc';

export function useTrashItems(boardId: string | null, enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['boards', boardId, 'trash'],
    queryFn: (): Promise<BoardItem[]> => listTrash(boardId!),
    enabled: boardId !== null && enabled,
    staleTime: 0,
  });

  return { items: data ?? [], isLoading, error };
}
