import { log } from '../../lib/log';
import { safeFetch, UnsafeUrlError } from '../../lib/safeFetch';
import type { ParseResult, ParseWarning } from '../../schemas/parse';
import { storeImage, type StoredImage } from '../images';
import {
  extractCandidates,
  pickDefaultImages,
  type StaticExtract,
} from './candidates';
import {
  buildEvidence,
  selectProductMeta,
  type ClaudeSelection,
} from './claude';
import type { ParsedDetail, ParsedMeta } from './meta';

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

  // Stage 1 — deterministic extraction: og tags, JSON-LD/microdata price,
  // and a ranked candidate list combining every image-discovery source
  // (suspect-section and off-host candidates kept but penalized).
  const extract = await extractCandidates(html, url);

  // Stage 2 — Claude reads a structured evidence document (og fields,
  // Product JSON-LD, the numbered candidate list, stripped page text) and
  // selects candidate INDICES + arbitrates metadata. Index selection means
  // it can never introduce a URL that wasn't discovered on the page.
  let selection: ClaudeSelection | null = null;
  try {
    selection = await selectProductMeta(
      buildEvidence(url, extract, html),
      extract.candidates.length,
      apiKey,
    );
  } catch {
    warnings.push('claude_failed');
  }

  return { meta: mergeSelection(extract, selection), warnings };
}

// Pure merge of the deterministic extraction with Claude's selection (null
// when the Claude call failed — static extraction is the fallback).
export function mergeSelection(
  extract: StaticExtract,
  selection: ClaudeSelection | null,
): ParsedMeta {
  let { title, brand, description, price, currency } = extract;
  let details: ParsedDetail[] = [];
  let imageUrls: string[];

  if (selection) {
    title ??= selection.title;
    brand ??= selection.brand;
    description ??= selection.description;
    currency ??= selection.currency;
    // Price cross-validation: prefer Claude when structured data is missing,
    // OR when the values disagree significantly AND currencies agree (so
    // we're not picking a value from a different region/SKU). Claude sees
    // the structured price in its evidence, so a disagreement here is a
    // deliberate correction (sale price on page, wrong-SKU offer), not a
    // blind guess.
    if (price === null) {
      price = selection.price;
    } else if (
      selection.price !== null &&
      selection.currency !== null &&
      currency !== null &&
      selection.currency === currency
    ) {
      const delta = Math.abs(selection.price - price);
      const ratio = price > 0 ? delta / price : 0;
      if (ratio > PRICE_DISCREPANCY_RATIO) {
        log.debug(
          `parser price mismatch ${price} vs ${selection.price} (${currency}); preferring Claude`,
        );
        price = selection.price;
      }
    }
    details = selection.details;
    imageUrls =
      selection.imageIndices.length > 0
        ? selection.imageIndices.map((i) => extract.candidates[i].url)
        : pickDefaultImages(extract.candidates, MAX_IMAGES);
  } else {
    imageUrls = pickDefaultImages(extract.candidates, MAX_IMAGES);
  }

  // Last resort after og:title and Claude: the <title> tag (usually carries
  // a "| Site" suffix, hence lowest priority).
  title ??= extract.docTitle;

  return {
    title,
    brand,
    description,
    price,
    currency,
    imageUrls: imageUrls.slice(0, MAX_IMAGES),
    details,
  };
}

export async function parseProductUrl(
  url: string,
  anthropicKey: string,
  images: R2Bucket,
  userId: string,
): Promise<ParseResult> {
  const { meta, warnings } = await fetchAndParseMeta(url, anthropicKey);

  const stored = (
    await mapLimit(meta.imageUrls, IMAGE_FETCH_CONCURRENCY, (src) =>
      storeImage(images, userId, src),
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
