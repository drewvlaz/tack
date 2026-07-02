import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addItemTags,
  listBoardTags,
  removeItemTags,
  type BoardTag,
} from '../../api/boards';
import type { CanvasItem } from '../../lib/trpc';

// Normalize the same way the server does so optimistic and authoritative
// states agree. Trim → collapse whitespace → lowercase.
function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function patchTags(
  items: CanvasItem[],
  ids: Set<string>,
  fn: (current: string[]) => string[],
): CanvasItem[] {
  return items.map((it) => {
    if (it.state !== 'real' || !ids.has(it.id)) {
      return it;
    }
    return { ...it, tags: fn(it.tags) };
  });
}

export function useBoardTags(boardId: string | null) {
  return useQuery<BoardTag[]>({
    queryKey: ['boards', boardId, 'tags'],
    queryFn: () => listBoardTags(boardId!),
    enabled: !!boardId,
  });
}

// Single-call mutation that adds or removes one tag against N placements.
// `op: 'add' | 'remove'` is part of the mutation input so the same hook
// handles both flows without two near-identical copies.
type Variables = {
  op: 'add' | 'remove';
  boardItemIds: string[];
  name: string;
};

export function useEditItemTag(boardId: string) {
  const qc = useQueryClient();
  const itemsKey = ['boards', boardId, 'items'];
  const tagsKey = ['boards', boardId, 'tags'];

  return useMutation({
    mutationFn: ({ op, boardItemIds, name }: Variables) => {
      const n = normalize(name);
      return op === 'add'
        ? addItemTags(boardItemIds, [n])
        : removeItemTags(boardItemIds, [n]);
    },

    onMutate: async ({ op, boardItemIds, name }) => {
      const n = normalize(name);
      await qc.cancelQueries({ queryKey: itemsKey });
      const previous = qc.getQueryData<CanvasItem[]>(itemsKey);
      const ids = new Set(boardItemIds);
      qc.setQueryData<CanvasItem[]>(itemsKey, (old = []) =>
        patchTags(old, ids, (curr) =>
          op === 'add'
            ? curr.includes(n)
              ? curr
              : [...curr, n].sort()
            : curr.filter((t) => t !== n),
        ),
      );
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(itemsKey, ctx.previous);
      }
    },

    onSettled: () => {
      // Reconcile both: the tag-count query for the sidebar and the items
      // cache in case server normalization or a concurrent edit disagreed
      // with the optimistic patch.
      qc.invalidateQueries({ queryKey: tagsKey });
      qc.invalidateQueries({ queryKey: itemsKey });
    },
  });
}
