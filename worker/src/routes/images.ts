import type { Context } from 'hono';
import { serveImage } from '../services/images';

export async function handleImageRequest(
  c: Context<{ Bindings: { IMAGES: R2Bucket } }>,
) {
  const key = c.req.path.replace('/api/images/', '');
  if (!key.startsWith('items/')) return c.notFound();
  const response = await serveImage(c.env.IMAGES, key);
  return response ?? c.notFound();
}
