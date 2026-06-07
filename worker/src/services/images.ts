import { genId } from '../lib/id';
import { log } from '../lib/log';
import { safeFetch, UnsafeUrlError } from '../lib/safeFetch';

export type StoredImage =
  | { kind: 'r2'; key: string; sourceUrl: string }
  | { kind: 'external'; url: string; sourceUrl: string };

const R2_KEY_PREFIX = 'items/';
const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';

// Allowlist for stored image bytes. Origins can claim any content-type, and
// serving back e.g. `text/html` from `/api/images/*` would be a same-origin XSS
// path — clamp at ingest and again at serve time.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

function baseContentType(contentType: string | null): string | null {
  if (!contentType) {
    return null;
  }
  return contentType.split(';', 1)[0].trim().toLowerCase();
}

export function isAllowedImageType(contentType: string | null): boolean {
  const base = baseContentType(contentType);
  return base !== null && ALLOWED_IMAGE_TYPES.has(base);
}

export function normalizeImageType(contentType: string | null): string {
  const base = baseContentType(contentType);
  return base !== null && ALLOWED_IMAGE_TYPES.has(base)
    ? base
    : DEFAULT_IMAGE_CONTENT_TYPE;
}

// Drops icons / thumbnails / placeholder assets — well below any real product
// shot, even heavily compressed. Content-Length is advisory: we trust it when
// present and skip the byte sniff when absent.
const MIN_IMAGE_BYTES = 10_000;

// Hard ceiling. Beyond this we drop rather than risk worker memory / R2 spam
// from a rogue origin.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
): Promise<StoredImage | null> {
  try {
    const res = await safeFetch(sourceUrl);
    if (!res.ok || !res.body) {
      return { kind: 'external', url: sourceUrl, sourceUrl };
    }

    const rawType = res.headers.get('content-type');
    if (!isAllowedImageType(rawType)) {
      // Origin lied or served a non-image: don't persist, don't fall back to
      // external (frontend would still render the URL).
      return null;
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength !== null) {
      const n = Number(contentLength);
      if (n < MIN_IMAGE_BYTES) {
        return null;
      }
      if (n > MAX_IMAGE_BYTES) {
        return null;
      }
    }

    const key = `${R2_KEY_PREFIX}${genId()}`;
    const contentType = normalizeImageType(rawType);

    await images.put(key, res.body, { httpMetadata: { contentType } });

    return { kind: 'r2', key, sourceUrl };
  } catch (err) {
    // Unsafe URLs (private IPs, non-http schemes) must not be persisted —
    // even as 'external' the frontend would render them via <img src>.
    if (err instanceof UnsafeUrlError) {
      return null;
    }
    return { kind: 'external', url: sourceUrl, sourceUrl };
  }
}

export async function deleteStoredImage(
  images: R2Bucket,
  img: StoredImage,
): Promise<void> {
  if (img.kind !== 'r2') {
    return;
  }
  try {
    await images.delete(img.key);
  } catch (err) {
    // best-effort; SQL has already dropped the reference, so the blob is now
    // an orphan and GC-able. Surface in logs so operators can spot leaks.
    log.warn(`R2 delete failed for ${img.key}:`, err);
  }
}

export type LoadedImage = {
  body: ReadableStream;
  contentType: string;
};

export async function loadImage(
  images: R2Bucket,
  key: string,
): Promise<LoadedImage | null> {
  const obj = await images.get(key);
  if (!obj) {
    return null;
  }
  return {
    body: obj.body,
    contentType: normalizeImageType(obj.httpMetadata?.contentType ?? null),
  };
}
