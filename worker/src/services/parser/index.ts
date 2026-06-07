import type { ParseResult } from '../../schemas/parse';
import { storeImage, type StoredImage } from '../images';
import { extractMetaWithClaude } from './claude';
import {
  extractPrice,
  extractTemplateImageUrls,
  parseHtml,
  rebuildFromReference,
  resolveAndDedupeUrls,
  stripHtml,
  type ParsedDetail,
  type ParsedMeta,
} from './meta';

const MAX_IMAGES = 12;

// Some CDN-templated URLs in JSON-LD contain a literal placeholder the page's
// JS would substitute at runtime (e.g. SSENSE's `__IMAGE_PARAMS__`). Server-side
// fetches of these 404, so drop them rather than store broken externals.
const PLACEHOLDER_SEGMENT = /__[A-Z][A-Z0-9_]*__|\{\{[^}]+\}\}/;

function hasPlaceholderSegment(url: string): boolean {
  return PLACEHOLDER_SEGMENT.test(url);
}

function hostnameOf(raw: string | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, base).hostname;
  } catch {
    return null;
  }
}

export async function fetchAndParseMeta(
  url: string,
  apiKey: string,
): Promise<ParsedMeta> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Moodboard/1.0)' },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();

  const parsed = await parseHtml(html);
  const { title, brand, ogImages, jsonLdImages, imgTagImages } = parsed;
  let description = parsed.description;
  let price = extractPrice(html);
  let details: ParsedDetail[] = [];

  // Combine sources. Retailers vary: some put the full gallery in JSON-LD,
  // some only in og:image, and many (e.g. SSENSE) embed it in Next.js JSON
  // blobs with literal __IMAGE_PARAMS__ placeholders that we rebuild using
  // og:image as a transform reference.
  const ogHost = hostnameOf(ogImages[0], url);
  const filteredImgTagImages = ogHost
    ? imgTagImages.filter((u) => hostnameOf(u, url) === ogHost)
    : imgTagImages;
  const ogReference = ogImages[0];
  const rebuiltFromTemplates = ogReference
    ? extractTemplateImageUrls(html)
        .map((t) => rebuildFromReference(t, ogReference))
        .filter((u): u is string => u !== null)
    : [];
  let imageUrls = resolveAndDedupeUrls(url, [
    ...jsonLdImages,
    ...ogImages,
    ...filteredImgTagImages,
    ...rebuiltFromTemplates,
  ]).filter((u) => !hasPlaceholderSegment(u));

  // Details (size/care/materials) live in page body, never og tags — so we
  // always need Claude for them. Also covers price/description/images fallback.
  try {
    const meta = await extractMetaWithClaude(stripHtml(html), apiKey);
    if (price === null) price = meta.price;
    if (description === null) description = meta.description;
    if (imageUrls.length === 0) {
      imageUrls = resolveAndDedupeUrls(url, meta.imageUrls);
    }
    details = meta.details;
  } catch {
    // fields stay as-is
  }

  return {
    title,
    brand,
    description,
    price,
    imageUrls: imageUrls.slice(0, MAX_IMAGES),
    details,
  };
}

export async function parseProductUrl(
  url: string,
  anthropicKey: string,
  images: R2Bucket,
): Promise<ParseResult> {
  const meta = await fetchAndParseMeta(url, anthropicKey);

  const stored = (
    await Promise.all(meta.imageUrls.map((src) => storeImage(images, src)))
  ).filter((s): s is StoredImage => s !== null);

  return {
    title: meta.title,
    brand: meta.brand,
    description: meta.description,
    price: meta.price,
    details: meta.details,
    images: stored,
  };
}
