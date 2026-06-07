export type StoredImage = {
  r2Key: string;
  sourceUrl: string;
};

import { genId } from '../lib/id';

export async function uploadImageFromUrl(
  images: R2Bucket,
  sourceUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok || !res.body) return null;
    const key = `items/${genId()}`;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    await images.put(key, res.body, { httpMetadata: { contentType } });
    return key;
  } catch {
    return null;
  }
}

export async function storeImage(
  images: R2Bucket,
  sourceUrl: string,
): Promise<StoredImage> {
  const key = await uploadImageFromUrl(images, sourceUrl);
  return { r2Key: key ?? sourceUrl, sourceUrl };
}

export async function deleteStoredImage(
  images: R2Bucket,
  r2Key: string,
): Promise<void> {
  if (!r2Key.startsWith('items/')) return;
  try {
    await images.delete(r2Key);
  } catch {
    // best-effort
  }
}

export function imageDisplayUrl(r2Key: string): string {
  if (r2Key.startsWith('items/')) return `/api/images/${r2Key}`;
  return r2Key;
}

export async function serveImage(
  images: R2Bucket,
  key: string,
): Promise<Response | null> {
  const obj = await images.get(key);
  if (!obj) return null;
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  return new Response(obj.body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
