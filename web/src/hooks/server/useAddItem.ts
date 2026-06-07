import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addItem } from '../../api/boards';
import { parseUrl } from '../../api/parse';
import { describeAddItemError } from '../../lib/errors';
import type { CanvasItem, SkeletonItem } from '../../lib/trpc';
import { useToastsStore } from '../../store/toasts';

type AddItemArgs = {
  url: string;
  boardId: string;
  x: number;
  y: number;
};

export function useAddItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ url, boardId, x, y }: AddItemArgs) => {
      const parsed = await parseUrl(url);
      if (parsed.warnings.length > 0) {
        console.warn('parseUrl warnings:', parsed.warnings, 'for', url);
      }

      return addItem(boardId, {
        sourceUrl: url,
        title: parsed.title,
        brand: parsed.brand,
        description: parsed.description,
        price: parsed.price,
        details: parsed.details,
        images: parsed.images,
        x,
        y,
      });
    },

    onMutate: async ({ url, boardId, x, y }: AddItemArgs) => {
      const queryKey = ['boards', boardId, 'items'];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CanvasItem[]>(queryKey);

      const skeleton: SkeletonItem = {
        kind: 'skeleton',
        tempId: `skeleton-${Date.now()}`,
        sourceUrl: url,
        x,
        y,
        width: 220,
        height: 280,
      };

      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) => [
        ...old,
        skeleton,
      ]);

      return { previous, tempId: skeleton.tempId, boardId };
    },

    onSuccess: (newItem, _vars, ctx) => {
      if (!ctx) {
        return;
      }

      const queryKey = ['boards', ctx.boardId, 'items'];
      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.map((item) =>
          item.kind === 'skeleton' && item.tempId === ctx.tempId
            ? { ...newItem, kind: 'real' }
            : item,
        ),
      );
    },

    onError: (err, _vars, ctx) => {
      if (ctx) {
        queryClient.setQueryData(
          ['boards', ctx.boardId, 'items'],
          ctx.previous,
        );
      }

      useToastsStore.getState().show({
        kind: 'error',
        message: describeAddItemError(err),
      });
    },
  });
}
