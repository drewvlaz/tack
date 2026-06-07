import { useQuery } from '@tanstack/react-query';
import { getItems } from '../api/boards';
import type { BoardItem } from '../api/types';

export type { BoardItem };

export function useBoardItems(boardId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['boards', boardId, 'items'],
    queryFn: () => getItems(boardId),
    staleTime: Infinity,
  });

  return { items: data ?? [], isLoading, error };
}
