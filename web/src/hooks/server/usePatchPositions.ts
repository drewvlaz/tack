import { useMutation } from '@tanstack/react-query';
import { patchBoardItems, type ItemPatch } from '../../api/boards';

// Fire-and-forget like useSyncPosition: Framer Motion already shows the final
// positions, so the UI doesn't await this. One batch tRPC call per group-drag
// commit, atomic on the worker via withTransaction.
export function usePatchPositions() {
  return useMutation({
    mutationFn: (patches: Array<{ id: string; patch: ItemPatch }>) =>
      patchBoardItems(patches),
  });
}
