import { useQuery } from '@tanstack/react-query';
import { getItems } from '../api/boards';
import type { BoardItem } from '../lib/trpc';

export type { BoardItem };

export function useBoardItems(boardId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['boards', boardId, 'items'],
    queryFn: () => getItems(boardId!),
    enabled: boardId !== null,
    staleTime: Infinity,
  });

  return { items: data ?? [], isLoading, error };
}
