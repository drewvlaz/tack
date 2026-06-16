import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchTextItem, type TextItemPatch } from '../../api/boards';
import type { CanvasItem } from '../../lib/trpc';

// Patches a text item's content / style knobs. Optimistic cache update on
// mutate (so the user sees their edit immediately); rollback on error.
// Mirrors the useAddItem snapshot/rollback shape but doesn't need an
// onSuccess swap — the optimistic value IS what the server now holds.
type PatchTextArgs = {
  id: string;
  boardId: string;
  patch: TextItemPatch;
};

export function usePatchTextItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: PatchTextArgs) => patchTextItem(id, patch),

    onMutate: async ({ id, boardId, patch }) => {
      const queryKey = ['boards', boardId, 'items'];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CanvasItem[]>(queryKey);

      queryClient.setQueryData<CanvasItem[]>(queryKey, (old = []) =>
        old.map((item) => {
          if (
            item.state !== 'real' ||
            item.kind !== 'text' ||
            item.id !== id
          ) {
            return item;
          }
          return {
            ...item,
            ...(patch.content !== undefined && { textContent: patch.content }),
            ...(patch.fontSize !== undefined && {
              textFontSize: patch.fontSize,
            }),
            ...(patch.weight !== undefined && { textWeight: patch.weight }),
            ...(patch.colorToken !== undefined && {
              textColorToken: patch.colorToken,
            }),
            ...(patch.align !== undefined && { textAlign: patch.align }),
          };
        }),
      );

      return { previous, queryKey };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx) {
        queryClient.setQueryData(ctx.queryKey, ctx.previous);
      }
    },
  });
}
