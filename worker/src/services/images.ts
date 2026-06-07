import { genId } from '../lib/id';

export type StoredImage =
  | { kind: 'r2'; key: string; sourceUrl: string }
  | { kind: 'external'; url: string; sourceUrl: string };

const R2_KEY_PREFIX = 'items/';
const ONE_YEAR_SECONDS = 31_536_000;
const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

export function fromR2Key(r2Key: string, sourceUrl: string): StoredImage {
  return r2Key.startsWith(R2_KEY_PREFIX)
    ? { kind: 'r2', key: r2Key, sourceUrl }
    : { kind: 'external', url: r2Key, sourceUrl };
}

export function toR2Key(img: StoredImage): string {
  return img.kind === 'r2' ? img.key : img.url;
}

export async function storeImage(
  images: R2Bucket,
  sourceUrl: string,
): Promise<StoredImage> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok || !res.body) {
      return { kind: 'external', url: sourceUrl, sourceUrl };
    }
    const key = `${R2_KEY_PREFIX}${genId()}`;
    const contentType =
      res.headers.get('content-type') ?? DEFAULT_IMAGE_CONTENT_TYPE;
    await images.put(key, res.body, { httpMetadata: { contentType } });
    return { kind: 'r2', key, sourceUrl };
  } catch {
    return { kind: 'external', url: sourceUrl, sourceUrl };
  }
}

export async function deleteStoredImage(
  images: R2Bucket,
  img: StoredImage,
): Promise<void> {
  if (img.kind !== 'r2') return;
  try {
    await images.delete(img.key);
  } catch {
    // best-effort
  }
}

export function imageDisplayUrl(img: StoredImage): string {
  return img.kind === 'r2' ? `/api/images/${img.key}` : img.url;
}

export async function serveImage(
  images: R2Bucket,
  key: string,
): Promise<Response | null> {
  const obj = await images.get(key);
  if (!obj) return null;
  const contentType =
    obj.httpMetadata?.contentType ?? DEFAULT_IMAGE_CONTENT_TYPE;
  return new Response(obj.body, {
    headers: {
      'content-type': contentType,
      'cache-control': `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
    },
  });
}
