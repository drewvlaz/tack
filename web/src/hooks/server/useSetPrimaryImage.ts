import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setPrimaryImage } from '../../api/items';
import type { CanvasItem } from '../../lib/trpc';

// `id` is the placement id (board_items.id) post-fold. The frontend uses
// it to address the placement when reordering its image strip.
type Args = { id: string; imageId: string; boardId: string };

export function useSetPrimaryImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, imageId }: Args) => setPrimaryImage(id, imageId),

    onMutate: async ({ id, imageId, boardId }) => {
      const queryKey = ['boards', boardId, 'items'];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CanvasItem[]>(queryKey);

      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.map((item) => {
          if (item.kind !== 'real' || item.id !== id) {
            return item;
          }
          const idx = item.images.findIndex((img) => img.id === imageId);
          if (idx <= 0) {
            return item;
          }
          const reordered = [
            item.images[idx],
            ...item.images.slice(0, idx),
            ...item.images.slice(idx + 1),
          ];
          return { ...item, images: reordered };
        }),
      );

      return { previous, boardId };
    },

    onError: (_err, _vars, ctx) => {
      if (!ctx) {
        return;
      }
      queryClient.setQueryData(['boards', ctx.boardId, 'items'], ctx.previous);
    },
  });
}
