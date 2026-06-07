import { trpc } from '../lib/trpc';

export function reparseItem(id: string) {
  return trpc.items.reparse.mutate({ id });
}

export function setPrimaryImage(itemId: string, imageId: string | null) {
  return trpc.items.setPrimaryImage.mutate({ itemId, imageId });
}
