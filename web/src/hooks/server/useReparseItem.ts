import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reparseItem } from '../../api/items';

export function useReparseItem(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => reparseItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'items'] });
    },
  });
}
