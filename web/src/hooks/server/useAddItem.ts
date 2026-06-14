import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addItem } from '../../api/boards';
import { parseUrl } from '../../api/parse';
import { describeAddItemError } from '../../lib/errors';
import type { CanvasItem, SkeletonItem } from '../../lib/trpc';
import { useCanvasStore } from '../../store/canvas';
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
        currency: parsed.currency,
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

      // Drop optimistically on top: max of persisted zIndex and any local
      // bringToFront overrides the user has applied this session.
      const zIndices = useCanvasStore.getState().zIndices;
      const maxZ = (previous ?? []).reduce((acc, item) => {
        const z =
          item.kind === 'real' ? (zIndices[item.id] ?? item.zIndex) : item.zIndex;
        return z > acc ? z : acc;
      }, 0);

      const skeleton: SkeletonItem = {
        kind: 'skeleton',
        tempId: `skeleton-${Date.now()}`,
        sourceUrl: url,
        x,
        y,
        width: 220,
        height: 280,
        zIndex: maxZ + 1,
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
