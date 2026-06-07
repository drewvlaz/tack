import type { Context } from 'hono';
import { serveImage } from '../services/images';

export async function handleImageRequest(
  c: Context<{ Bindings: { IMAGES: R2Bucket } }>,
) {
  const key = c.req.path.replace('/api/images/', '');
  const response = await serveImage(c.env.IMAGES, key);
  return response ?? c.notFound();
}
