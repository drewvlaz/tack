import type { ParseResult } from '../../schemas/parse';
import { uploadImageFromUrl } from '../images';
import { extractMetaWithClaude } from './claude';
import { extractOgTag, extractPrice, stripHtml, type ParsedMeta } from './meta';

async function fetchAndParseMeta(
  url: string,
  apiKey: string,
): Promise<ParsedMeta> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Moodboard/1.0)' },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const html = await res.text();

  const title = extractOgTag(html, 'title');
  const primaryImageUrl = extractOgTag(html, 'image');
  const brand = extractOgTag(html, 'site_name');
  let price = extractPrice(html);

  if (price === null) {
    try {
      const meta = await extractMetaWithClaude(stripHtml(html), apiKey);
      price = meta.price;
    } catch {
      // price stays null
    }
  }

  return { title, brand, price, primaryImageUrl };
}

export async function parseProductUrl(
  url: string,
  anthropicKey: string,
  images: R2Bucket,
): Promise<ParseResult> {
  const meta = await fetchAndParseMeta(url, anthropicKey);

  let imageUrl: string | null = null;
  if (meta.primaryImageUrl) {
    imageUrl =
      (await uploadImageFromUrl(images, meta.primaryImageUrl)) ??
      meta.primaryImageUrl;
  }

  return {
    title: meta.title,
    brand: meta.brand,
    price: meta.price,
    imageUrl,
  };
}
