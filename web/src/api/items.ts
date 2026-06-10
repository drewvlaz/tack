import { trpc } from '../lib/trpc';

// After fold 0009 these are placement-keyed (board_items.id). The file
// name stays for now as the call-site label — the conceptual "item edit
// ops" haven't moved, just their underlying identifier.
export function reparseItem(id: string) {
  return trpc.boards.reparseItem.mutate({ id });
}

export function setPrimaryImage(id: string, imageId: string | null) {
  return trpc.boards.setPrimaryImage.mutate({ id, imageId });
}
