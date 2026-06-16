import { useQuery } from '@tanstack/react-query';
import { getItems } from '../../api/boards';
import type { BoardItem, CanvasItem, RealItem } from '../../lib/trpc';

export type { BoardItem };

export function useBoardItems(boardId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['boards', boardId, 'items'],
    queryFn: async (): Promise<CanvasItem[]> => {
      const items = await getItems(boardId!);
      return items.map((item): RealItem => ({ ...item, state: 'real' }));
    },
    enabled: boardId !== null,
    staleTime: Infinity,
  });

  return { items: data ?? [], isLoading, error };
}
