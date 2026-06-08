import { log } from '../../lib/log';
import { safeFetch, UnsafeUrlError } from '../../lib/safeFetch';
import type { ParseResult, ParseWarning } from '../../schemas/parse';
import { storeImage, type StoredImage } from '../images';
import { extractMetaWithClaude } from './claude';
import {
  extractFromJsonLd,
  extractFromMicrodata,
  extractTemplateImageUrls,
  intersectWithClaude,
  parseHtml,
  rebuildFromReference,
  resolveAndDedupeUrls,
  scoreAndRankImages,
  stripHtml,
  type ImageSource,
  type ParsedDetail,
  type ParsedMeta,
} from './meta';

// Thrown when the upstream HTTP fetch fails — either the connection errored
// (DNS/TLS/blocked subrequest, surfaced as a runtime Error) or the response
// status is non-2xx (bot challenge, 404, 5xx). Routers catch this and map to
// a user-friendly TRPCError; callers downstream of fetch don't see raw runtime
// strings like "internal error; reference = …".
export class ParseFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ParseFetchError';
  }
}

const MAX_IMAGES = 12;

// When structured-data and Claude disagree on price, prefer Claude only when
// the gap is large enough to suggest the structured-data hit was a wrong-SKU
// or rack-vs-sale mix-up. Sub-5% deltas are usually tax/shipping noise.
const PRICE_DISCREPANCY_RATIO = 0.05;

// Cap on the raw HTML we'll buffer. Real product pages are well under this;
// anything larger is either a tarpit or not a product page.
const MAX_HTML_BYTES = 4 * 1024 * 1024;

// Concurrency cap on storeImage. With MAX_IMAGES=12 and 10s per fetch, an
// unbounded Promise.all can monopolize subrequest budget and worker wall-clock.
// 4 hits a reasonable wall-clock without amplifying upstream load.
const IMAGE_FETCH_CONCURRENCY = 4;

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) {
        return;
      }
      out[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return out;
}

async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<string> {
  const declared = res.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    throw new Error(`HTML body too large: ${declared} bytes`);
  }
  if (!res.body) {
    return '';
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`HTML body too large: >${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

// Some CDN-templated URLs in JSON-LD contain a literal placeholder the page's
// JS would substitute at runtime (e.g. SSENSE's `__IMAGE_PARAMS__`). Server-side
// fetches of these 404, so drop them rather than store broken externals.
const PLACEHOLDER_SEGMENT = /__[A-Z][A-Z0-9_]*__|\{\{[^}]+\}\}/;

function hasPlaceholderSegment(url: string): boolean {
  return PLACEHOLDER_SEGMENT.test(url);
}

function hostnameOf(raw: string | undefined, base: string): string | null {
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw, base).hostname;
  } catch {
    return null;
  }
}

export async function fetchAndParseMeta(
  url: string,
  apiKey: string,
): Promise<{ meta: ParsedMeta; warnings: ParseWarning[] }> {
  const warnings: ParseWarning[] = [];
  // Mimic a real browser. Beats casual UA-string checks (most plain Shopify
  // stores, mid-tier retailers). Won't beat real anti-bot (Cloudflare bot mode,
  // DataDome, PerimeterX) — those need a headless browser or proxy.
  let res: Response;
  try {
    res = await safeFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (err) {
    // UnsafeUrlError bubbles up so the router can label it distinctly;
    // anything else (Workers runtime "internal error; reference = …",
    // AbortError, DNS/TLS failure) becomes a ParseFetchError so the router
    // can return a friendly 400 instead of a 500.
    if (err instanceof UnsafeUrlError) {
      throw err;
    }
    throw new ParseFetchError(
      `Couldn't reach ${new URL(url).hostname}. The site may be blocking automated requests.`,
      url,
    );
  }
  if (!res.ok) {
    throw new ParseFetchError(
      `${new URL(url).hostname} responded with HTTP ${res.status}. The site may be blocking automated requests.`,
      url,
      res.status,
    );
  }

  const html = await readBodyCapped(res, MAX_HTML_BYTES);

  const parsed = await parseHtml(html);
  const { title, brand, ogImages, jsonLdScripts, imgTagImages } = parsed;
  let description = parsed.description;

  // Structured-data first (anchored to schema.org/Product; price+currency
  // come from the same Offer node so they always agree). Microdata is the
  // fallback for sites that don't ship JSON-LD.
  const jsonLd = extractFromJsonLd(jsonLdScripts, url);
  let price = jsonLd.price;
  let currency = jsonLd.currency;
  if (price === null) {
    const micro = extractFromMicrodata(html);
    price = micro.price;
    if (currency === null) {
      currency = micro.currency;
    }
  }
  let details: ParsedDetail[] = [];

  // Combine image sources. Retailers vary: some put the full gallery in
  // JSON-LD, some only in og:image, many (e.g. SSENSE) embed it in Next.js
  // JSON blobs with literal __IMAGE_PARAMS__ placeholders we rebuild using
  // og:image as a transform reference. IMG tags are filtered to the og:image
  // host so we don't pull in third-party widgets/ads.
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

  // Score-and-rank: JSON-LD Product images carry the highest weight (the
  // retailer themselves marked these as product photography), og:image is
  // the next-strongest signal, and <img> tags are the weakest (susceptible
  // to navigation chrome, recommendation widgets, etc.).
  const sources: ImageSource[] = [
    { tag: 'jsonld', score: 4, urls: jsonLd.productImages },
    { tag: 'og', score: 2, urls: ogImages },
    { tag: 'rebuilt', score: 3, urls: rebuiltFromTemplates },
    { tag: 'img', score: 1, urls: filteredImgTagImages },
  ];
  let imageUrls = scoreAndRankImages(
    url,
    sources,
    jsonLd.ambientImages,
    MAX_IMAGES,
  ).filter((u) => !hasPlaceholderSegment(u));

  // Details (size/care/materials) live in page body, never og tags — so we
  // always need Claude for them. Claude also serves as a cross-validator
  // for price and a curator for images.
  let claudeMeta: ParsedMeta | null = null;
  try {
    claudeMeta = await extractMetaWithClaude(stripHtml(html), apiKey);
  } catch {
    warnings.push('claude_failed');
  }

  if (claudeMeta) {
    if (description === null) {
      description = claudeMeta.description;
    }
    if (currency === null) {
      currency = claudeMeta.currency;
    }
    // Price cross-validation: prefer Claude when structured data is missing,
    // OR when the values disagree significantly AND currencies agree (so
    // we're not picking a value from a different region/SKU).
    if (price === null) {
      price = claudeMeta.price;
    } else if (
      claudeMeta.price !== null &&
      claudeMeta.currency !== null &&
      currency !== null &&
      claudeMeta.currency === currency
    ) {
      const delta = Math.abs(claudeMeta.price - price);
      const ratio = price > 0 ? delta / price : 0;
      if (ratio > PRICE_DISCREPANCY_RATIO) {
        log.debug(
          `parser price mismatch ${price} vs ${claudeMeta.price} (${currency}); preferring Claude`,
        );
        price = claudeMeta.price;
      }
    }
    if (imageUrls.length === 0) {
      // No discovered candidates survived — fall back to Claude's list
      // directly (last resort).
      imageUrls = resolveAndDedupeUrls(url, claudeMeta.imageUrls).filter(
        (u) => !hasPlaceholderSegment(u),
      );
    } else if (claudeMeta.imageUrls.length > 0) {
      // Use Claude's list as a curator: drop discovered URLs Claude
      // didn't flag as product images. `intersectWithClaude` is
      // conservative — keeps the original pool when overlap is too small
      // (Claude likely saw URLs in a form we can't reconcile).
      imageUrls = intersectWithClaude(url, imageUrls, claudeMeta.imageUrls);
    }
    details = claudeMeta.details;
  }

  return {
    meta: {
      title,
      brand,
      description,
      price,
      currency,
      imageUrls: imageUrls.slice(0, MAX_IMAGES),
      details,
    },
    warnings,
  };
}

export async function parseProductUrl(
  url: string,
  anthropicKey: string,
  images: R2Bucket,
): Promise<ParseResult> {
  const { meta, warnings } = await fetchAndParseMeta(url, anthropicKey);

  const stored = (
    await mapLimit(meta.imageUrls, IMAGE_FETCH_CONCURRENCY, (src) =>
      storeImage(images, src),
    )
  ).filter((s): s is StoredImage => s !== null);
  if (stored.length < meta.imageUrls.length) {
    warnings.push('image_fetch_failed');
  }
  if (stored.length === 0) {
    warnings.push('no_images');
  }

  return {
    title: meta.title,
    brand: meta.brand,
    description: meta.description,
    price: meta.price,
    currency: meta.currency,
    details: meta.details,
    images: stored,
    warnings,
  };
}
