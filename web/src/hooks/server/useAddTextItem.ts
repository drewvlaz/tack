import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addTextItem, type AddTextItemBody } from '../../api/boards';
import type { CanvasItem, RealItem } from '../../lib/trpc';
import { useTextEditStore } from '../../store/textEdit';

type AddTextArgs = {
  boardId: string;
  item: AddTextItemBody;
};

// Server-only add — no optimistic skeleton needed because the round-trip
// is single-statement and the placement has no images. After the server
// returns, the new id is flagged for auto-edit so the spawn affordances
// open the textarea immediately.
export function useAddTextItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ boardId, item }: AddTextArgs) => addTextItem(boardId, item),

    onSuccess: (newItem, { boardId }) => {
      const queryKey = ['boards', boardId, 'items'];
      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) => [
        ...old,
        { ...newItem, state: 'real' } as RealItem,
      ]);
      // Flag the new item so its TextCard mounts in edit mode.
      useTextEditStore.getState().request(newItem.id);
    },
  });
}
