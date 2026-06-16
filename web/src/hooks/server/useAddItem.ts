import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addItem, patchBoardItems } from '../../api/boards';
import { parseFromHtml, parseUrl } from '../../api/parse';
import { describeAddItemError } from '../../lib/errors';
import { log } from '../../lib/log';
import type { CanvasItem, SkeletonItem } from '../../lib/trpc';
import { useCanvasStore } from '../../store/canvas';
import { useToastsStore } from '../../store/toasts';

type AddItemArgs = {
  url: string;
  boardId: string;
  x: number;
  y: number;
  // Bookmarklet input. When set, the worker skips the live fetch and runs
  // the parse pipeline against this pre-rendered DOM — the rescue path for
  // sites that bot-block the worker (Akamai, DataDome).
  html?: string;
};

export function useAddItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ url, boardId, x, y, html }: AddItemArgs) => {
      const parsed = html
        ? await parseFromHtml(url, html)
        : await parseUrl(url);
      if (parsed.warnings.length > 0) {
        log.warn('parse warnings', { warnings: parsed.warnings, url });
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
      // The skeleton may have been dragged while parseUrl was in flight; its
      // current cached position is what the user actually wants. The server
      // only knows the original drop position (mutationFn ran with the
      // pre-drag args), so fire a follow-up PATCH when the two diverge.
      const cached = queryClient.getQueryData<CanvasItem[]>(queryKey) ?? [];
      const skeleton = cached.find(
        (i): i is SkeletonItem =>
          i.kind === 'skeleton' && i.tempId === ctx.tempId,
      );
      const x = skeleton?.x ?? newItem.x;
      const y = skeleton?.y ?? newItem.y;

      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.map((item) =>
          item.kind === 'skeleton' && item.tempId === ctx.tempId
            ? { ...newItem, kind: 'real', x, y }
            : item,
        ),
      );

      if (x !== newItem.x || y !== newItem.y) {
        patchBoardItems([{ id: newItem.id, patch: { x, y } }]).catch(() => {});
      }
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
