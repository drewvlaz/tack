import { imageDisplayUrl } from '../../lib/imageRoute';
import type { BoardItem, BoardItemRow } from '../../schemas/board';

// Domain → wire. For product rows, resolves each StoredImage ref to a
// `/api/images/...` URL (or external URL) the frontend can fetch directly —
// the ONE place transport URLs are constructed from service output. Text
// rows pass through unchanged.
export function toBoardItemWire(row: BoardItemRow): BoardItem {
  if (row.kind === 'text') {
    return row;
  }
  return {
    ...row,
    images: row.images.map(({ id, image }) => ({
      id,
      url: imageDisplayUrl(image),
    })),
  };
}
