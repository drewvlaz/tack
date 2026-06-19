import { log } from '../../lib/log';
import { mapLimit } from '../../lib/mapLimit';
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

// HTTP status codes from the live site that warrant a Wayback fallback:
// 403 is the canonical Akamai/DataDome bot block; 429 is a rate-limit page;
// 451 is region-blocked but parseable from the archive. 5xx, 404, and other
// origin errors are NOT retried via Wayback — those reflect real problems
// the archive won't fix (or worse, an archived 5xx page).
const ARCHIVE_FALLBACK_STATUSES = new Set([403, 429, 451]);

// Tighter than the page fetch — if the archive is slow we'd rather show the
// user the original 403 quickly than make them wait twice.
const ARCHIVE_AVAILABILITY_TIMEOUT_MS = 5_000;
const ARCHIVE_SNAPSHOT_TIMEOUT_MS = 15_000;

// Browser-shaped headers. Beats casual UA-string checks (plain Shopify, mid-
// tier retailers). Won't beat real anti-bot (Akamai Bot Manager, DataDome,
// PerimeterX) — those fingerprint TLS/H2 and Workers' fetch stack can't pass.
// For those, the archive fallback below handles the rescue.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

type LiveFetchResult =
  | { kind: 'ok'; html: string }
  | { kind: 'status'; status: number; message: string }
  | { kind: 'network'; message: string };

async function tryLiveFetch(url: string): Promise<LiveFetchResult> {
  try {
    const res = await safeFetch(url, { headers: { ...BROWSER_HEADERS } });
    if (res.ok) {
      return { kind: 'ok', html: await readBodyCapped(res, MAX_HTML_BYTES) };
    }
    return {
      kind: 'status',
      status: res.status,
      message: `${new URL(url).hostname} responded with HTTP ${res.status}. The site may be blocking automated requests.`,
    };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw err;
    }
    return {
      kind: 'network',
      message: `Couldn't reach ${new URL(url).hostname}. The site may be blocking automated requests.`,
    };
  }
}

// Wayback Machine rescue path. When the live site is fingerprint-blocked, we
// ask Archive for the most recent snapshot of the same URL and feed THAT HTML
// into the rest of the pipeline. The `id_` flag on the snapshot URL returns
// the raw archived bytes — no banner injection, no rewriting of embedded URLs
// — so the JSON-LD, og tags, and image URLs all still point at the original
// CDN. Image fetches then either succeed against the CDN or, if those are
// also gated, fall through to `kind: 'external'` (the user's browser fetches
// them with its real fingerprint).
type Snapshot = { url: string; timestamp: string };

async function findArchiveSnapshot(url: string): Promise<Snapshot | null> {
  const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  const res = await safeFetch(availUrl, {
    timeoutMs: ARCHIVE_AVAILABILITY_TIMEOUT_MS,
  });
  if (!res.ok) {
    return null;
  }
  const meta = (await res.json().catch(() => null)) as {
    archived_snapshots?: {
      closest?: { available?: boolean; timestamp?: string; status?: string };
    };
  } | null;
  const closest = meta?.archived_snapshots?.closest;
  if (
    !closest?.available ||
    !closest.timestamp ||
    !/^\d{14}$/.test(closest.timestamp) ||
    closest.status !== '200'
  ) {
    return null;
  }
  return {
    url: `https://web.archive.org/web/${closest.timestamp}id_/${url}`,
    timestamp: closest.timestamp,
  };
}

async function tryWaybackFetch(url: string): Promise<string | null> {
  try {
    const snap = await findArchiveSnapshot(url);
    if (!snap) {
      return null;
    }
    const snapRes = await safeFetch(snap.url, {
      timeoutMs: ARCHIVE_SNAPSHOT_TIMEOUT_MS,
    });
    if (!snapRes.ok) {
      return null;
    }
    log.info('parser archive rescue', { url, snapshot: snap.timestamp });
    return await readBodyCapped(snapRes, MAX_HTML_BYTES);
  } catch (err) {
    // Wayback unreachable / rate-limited / its own UnsafeUrl — none of these
    // should bubble; we want the original ParseFetchError surfaced instead.
    if (err instanceof UnsafeUrlError) {
      return null;
    }
    log.debug(`parser: archive fallback failed for ${url}:`, err);
    return null;
  }
}

export async function fetchHtmlWithArchiveFallback(
  url: string,
): Promise<{ html: string; warnings: ParseWarning[] }> {
  const live = await tryLiveFetch(url);
  if (live.kind === 'ok') {
    return { html: live.html, warnings: [] };
  }
  const eligible =
    live.kind === 'network' || ARCHIVE_FALLBACK_STATUSES.has(live.status);
  if (eligible) {
    const archived = await tryWaybackFetch(url);
    if (archived !== null) {
      return { html: archived, warnings: ['parsed_from_archive'] };
    }
  }
  log.info('parser fetch failed', {
    url,
    kind: live.kind,
    status: live.kind === 'status' ? live.status : undefined,
  });
  throw new ParseFetchError(
    live.message,
    url,
    live.kind === 'status' ? live.status : undefined,
  );
}

export async function fetchAndParseMeta(
  url: string,
  apiKey: string,
): Promise<{ meta: ParsedMeta; warnings: ParseWarning[] }> {
  const { html, warnings } = await fetchHtmlWithArchiveFallback(url);
  return parseHtmlMeta(html, url, apiKey, warnings);
}

// Same pipeline as `fetchAndParseMeta`, minus the network fetch. Reused by
// the bookmarklet path (`parseFromHtmlBytes`): when the user's browser hands
// us the rendered DOM, we skip the SSRF-protected fetch entirely and run
// straight through extract → Claude → merge.
//
// The page URL is still used as the parse base so relative image paths and
// JSON-LD url matching resolve against the original origin (the bookmarklet
// captures from a real browser tab, so the URL is authentic).
export async function parseHtmlMeta(
  html: string,
  url: string,
  apiKey: string,
  initialWarnings: ParseWarning[] = [],
): Promise<{ meta: ParsedMeta; warnings: ParseWarning[] }> {
  const warnings = [...initialWarnings];

  // Stage 1 — deterministic extraction: og tags, JSON-LD/microdata price,
  // and a ranked candidate list combining every image-discovery source
  // (suspect-section and off-host candidates kept but penalized).
  const extract = await extractCandidates(html, url);

  // Stage 2 — Claude reads a structured evidence document (og fields,
  // Product JSON-LD, the numbered candidate list, stripped page text) and
  // selects candidate INDICES + arbitrates metadata. Index selection means
  // it can never introduce a URL that wasn't discovered on the page.
  const selection = await selectProductMeta(
    buildEvidence(url, extract, html),
    extract.candidates.length,
    apiKey,
  ).catch((err) => {
    log.warn('parser claude fallback', { url, err: String(err) });
    warnings.push('claude_failed');
    return null as ClaudeSelection | null;
  });

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
  return finishParseAndStore(
    await fetchAndParseMeta(url, anthropicKey),
    images,
    userId,
  );
}

// Bookmarklet entry point. The user's browser has already passed whatever
// bot challenge the site mounts, so the HTML is the post-render DOM (every
// JSON-LD blob + every src/srcset the page would show). We skip the fetch
// stage and run the same extract → Claude → store pipeline.
//
// Image fetches may still 403 if the CDN sits behind the same WAF — that's
// fine, `storeImage` falls back to `{ kind: 'external', url }`, and the
// user's browser will fetch the bytes with its own fingerprint at render
// time. The result is a card with a working image even when the worker
// can't see the bytes.
export async function parseProductFromHtml(
  url: string,
  html: string,
  anthropicKey: string,
  images: R2Bucket,
  userId: string,
): Promise<ParseResult> {
  return finishParseAndStore(
    await parseHtmlMeta(html, url, anthropicKey),
    images,
    userId,
  );
}

async function finishParseAndStore(
  parsed: { meta: ParsedMeta; warnings: ParseWarning[] },
  images: R2Bucket,
  userId: string,
): Promise<ParseResult> {
  const { meta } = parsed;
  const warnings = [...parsed.warnings];

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
