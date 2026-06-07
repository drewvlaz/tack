import type { StoredImage } from '../services/images';

// Transport contract for serving stored images. Owned here so services stay
// ignorant of the worker's HTTP routes. Two consumers must agree on it:
// `routes/images.ts` (which matches on the prefix) and the wire serializer
// in `routers/boards.ts` (which builds URLs into BoardItem.images[].url).
export const IMAGE_ROUTE_PREFIX = '/api/images/';

export function imageDisplayUrl(img: StoredImage): string {
  return img.kind === 'r2' ? `${IMAGE_ROUTE_PREFIX}${img.key}` : img.url;
}
