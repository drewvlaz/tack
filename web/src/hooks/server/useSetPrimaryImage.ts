import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setPrimaryImage } from '../../api/items';
import type { CanvasItem } from '../../lib/trpc';

type Args = { itemId: string; imageId: string; boardId: string };

export function useSetPrimaryImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, imageId }: Args) =>
      setPrimaryImage(itemId, imageId),

    onMutate: async ({ itemId, imageId, boardId }) => {
      const queryKey = ['boards', boardId, 'items'];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CanvasItem[]>(queryKey);

      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.map((item) => {
          if (item.kind !== 'real' || item.itemId !== itemId) return item;
          const idx = item.images.findIndex((img) => img.id === imageId);
          if (idx <= 0) return item;
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
      if (!ctx) return;
      queryClient.setQueryData(['boards', ctx.boardId, 'items'], ctx.previous);
    },
  });
}
