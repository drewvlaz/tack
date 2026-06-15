import { useMutation } from '@tanstack/react-query';
import { patchBoardItems, type ItemPatch } from '../../api/boards';

// Fire-and-forget patches for any subset of x/y/width/height/zIndex. Handles
// both single-card commits (single-element array) and group-drag commits
// (multi-element array). One mutation, one batch tRPC call per release; the
// worker wraps each batch in withTransaction for atomicity.
//
// We don't await the server because Framer Motion is already showing the
// final positions/sizes — there's no UI state to roll back to.
export function usePatchItems() {
  return useMutation({
    mutationFn: (patches: Array<{ id: string; patch: ItemPatch }>) =>
      patchBoardItems(patches),
  });
}
