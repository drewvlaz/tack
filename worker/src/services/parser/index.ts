import type { ParseResult } from '../../schemas/parse';
import { storeImage, type StoredImage } from '../images';
import { extractMetaWithClaude } from './claude';
import {
  extractJsonLdImages,
  extractOgImages,
  extractOgTag,
  extractPrice,
  resolveAndDedupeUrls,
  stripHtml,
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

  const title = extractOgTag(html, 'title');
  const brand = extractOgTag(html, 'site_name');
  let description = extractOgTag(html, 'description');
  let price = extractPrice(html);

  const jsonLdImages = extractJsonLdImages(html);
  let imageUrls = resolveAndDedupeUrls(
    url,
    jsonLdImages.length > 0 ? jsonLdImages : extractOgImages(html),
  );

  if (price === null || description === null || imageUrls.length === 0) {
    try {
      const meta = await extractMetaWithClaude(stripHtml(html), apiKey);
      if (price === null) price = meta.price;
      if (description === null) description = meta.description;
      if (imageUrls.length === 0) {
        imageUrls = resolveAndDedupeUrls(url, meta.imageUrls);
      }
    } catch {
      // fields stay as-is
    }
  }

  return {
    title,
    brand,
    description,
    price,
    imageUrls: imageUrls.slice(0, MAX_IMAGES),
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
    images: stored,
  };
}
