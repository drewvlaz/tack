import type { Context } from 'hono';
import { IMAGE_ROUTE_PREFIX } from '../lib/imageRoute';
import { loadImage } from '../services/images';

const ONE_YEAR_SECONDS = 31_536_000;

export async function handleImageRequest(
  c: Context<{ Bindings: { IMAGES: R2Bucket } }>,
) {
  const key = c.req.path.replace(IMAGE_ROUTE_PREFIX, '');
  if (!key.startsWith('items/')) {
    return c.notFound();
  }

  const img = await loadImage(c.env.IMAGES, key);
  if (!img) {
    return c.notFound();
  }

  return new Response(img.body, {
    headers: {
      'content-type': img.contentType,
      'cache-control': `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    },
  });
}
