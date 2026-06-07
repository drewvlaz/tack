export async function uploadImageFromUrl(
  images: R2Bucket,
  sourceUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok || !res.body) return null;
    const key = `items/${crypto.randomUUID()}`;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    await images.put(key, res.body, { httpMetadata: { contentType } });
    return `/api/images/${key}`;
  } catch {
    return null;
  }
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
