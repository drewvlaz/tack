import type { ParseResult } from '../../schemas/parse';
import { storeImage, type StoredImage } from '../images';
import { extractMetaWithClaude } from './claude';
import {
  extractPrice,
  parseHtml,
  resolveAndDedupeUrls,
  stripHtml,
  type ParsedDetail,
  type ParsedMeta,
} from './meta';

const MAX_IMAGES = 12;

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
  const { title, brand, ogImages, jsonLdImages } = parsed;
  let description = parsed.description;
  let price = extractPrice(html);
  let details: ParsedDetail[] = [];

  // Merge both sources — retailers vary: some put the full gallery in JSON-LD,
  // some only in og:image tags, some split (e.g. SSENSE: JSON-LD has the primary
  // shot, og has the full gallery). JSON-LD first preserves canonical ordering;
  // dedupe collapses overlap.
  let imageUrls = resolveAndDedupeUrls(url, [...jsonLdImages, ...ogImages]);

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

  const stored: StoredImage[] = await Promise.all(
    meta.imageUrls.map((src) => storeImage(images, src)),
  );

  return {
    title: meta.title,
    brand: meta.brand,
    description: meta.description,
    price: meta.price,
    details: meta.details,
    images: stored,
  };
}
