import { imageDisplayUrl } from '../../lib/imageRoute';
import type { BoardItem, BoardItemRow } from '../../schemas/board';

// Domain → wire. Resolves each StoredImage ref to a `/api/images/...` URL
// (or external URL) the frontend can fetch directly. This is the ONE place
// transport URLs are constructed from service output.
export function toBoardItemWire(row: BoardItemRow): BoardItem {
  return {
    ...row,
    images: row.images.map(({ id, image }) => ({
      id,
      url: imageDisplayUrl(image),
    })),
  };
}
