export type ParsedDetail = { label: string; value: string };

export type ParsedMeta = {
  title: string | null;
  brand: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  imageUrls: string[];
  details: ParsedDetail[];
};

export type ParsedHtml = {
  title: string | null;
  brand: string | null;
  description: string | null;
  ogImages: string[];
  jsonLdScripts: string[];
  imgTagImages: string[];
};

export type JsonLdExtract = {
  productImages: string[];
  ambientImages: string[];
  price: number | null;
  currency: string | null;
  inStock: boolean | null;
};

const OG_IMAGE_PROPS = new Set([
  'og:image',
  'og:image:secure_url',
  'og:image:url',
]);

const MAX_STRIPPED_HTML_CHARS = 40_000;

// Width descriptor below which an <img srcset> candidate is treated as a
// thumbnail/icon, not a product shot. Real product galleries publish at least
// one mid-resolution variant.
const MIN_SRCSET_WIDTH = 400;

export async function parseHtml(html: string): Promise<ParsedHtml> {
  let title: string | null = null;
  let brand: string | null = null;
  let description: string | null = null;
  const ogImages: string[] = [];
  const jsonLdScripts: string[] = [];
  const imgTagImages: string[] = [];
  let currentScript: string | null = null;

  const rewriter = new HTMLRewriter()
    .on('meta', {
      element(el) {
        const prop = el.getAttribute('property') ?? el.getAttribute('name');
        const content = el.getAttribute('content');
        if (!prop || !content) {
          return;
        }
        if (prop === 'og:title') {
          title ??= content;
        } else if (prop === 'og:site_name') {
          brand ??= content;
        } else if (prop === 'og:description') {
          description ??= content;
        } else if (OG_IMAGE_PROPS.has(prop)) {
          ogImages.push(content);
        }
      },
    })
    .on('script[type="application/ld+json"]', {
      element() {
        currentScript = '';
      },
      text(chunk) {
        if (currentScript === null) {
          return;
        }
        currentScript += chunk.text;
        if (chunk.lastInTextNode) {
          jsonLdScripts.push(currentScript);
          currentScript = null;
        }
      },
    })
    .on('img', {
      element(el) {
        const srcset = el.getAttribute('srcset');
        if (srcset) {
          const picked = largestFromSrcset(srcset);
          // Drop the candidate when its biggest descriptor is sub-thumbnail —
          // it's a UI sprite, badge, or social icon, never a hero shot.
          if (
            picked &&
            (picked.width === null || picked.width >= MIN_SRCSET_WIDTH)
          ) {
            imgTagImages.push(picked.url);
          }
          return;
        }
        const src = el.getAttribute('src');
        if (src) {
          imgTagImages.push(src);
        }
      },
    });

  await rewriter.transform(new Response(html)).arrayBuffer();

  return { title, brand, description, ogImages, jsonLdScripts, imgTagImages };
}

export type SrcsetPick = { url: string; width: number | null };

// Picks the URL with the largest width descriptor from a srcset string. URLs
// themselves may contain commas (e.g. Cloudinary `f_auto,c_limit,w_256`), so
// per the HTML spec we split on `, ` (comma + whitespace), which only appears
// between candidate entries. Returns the max width seen, or null when no
// candidate carries a width descriptor (rare, but valid HTML).
export function largestFromSrcset(srcset: string): SrcsetPick | null {
  let bestUrl: string | null = null;
  let bestWidth = -1;
  let sawAnyWidth = false;
  for (const candidate of srcset.split(/,\s+/)) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    const [url, descriptor] = trimmed.split(/\s+/, 2);
    if (!url) {
      continue;
    }
    const m = descriptor?.match(/^(\d+)w$/);
    const width = m ? parseInt(m[1], 10) : 0;
    if (m) {
      sawAnyWidth = true;
    }
    if (bestUrl === null || width > bestWidth) {
      bestUrl = url;
      bestWidth = width;
    }
  }
  if (bestUrl === null) {
    return null;
  }
  return { url: bestUrl, width: sawAnyWidth ? bestWidth : null };
}

// JSON-LD parsing
// ---------------

type JsonLdNode = Record<string, unknown>;

function nodeTypes(node: JsonLdNode): string[] {
  const raw = node['@type'];
  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === 'string');
  }
  return [];
}

function isProduct(node: JsonLdNode): boolean {
  return nodeTypes(node).some((t) => t === 'Product' || t.endsWith('/Product'));
}

function isOfferType(node: JsonLdNode): boolean {
  return nodeTypes(node).some(
    (t) => t === 'Offer' || t === 'AggregateOffer' || t.endsWith('/Offer'),
  );
}

// Walk top-level structure into a flat list of nodes. Handles single object,
// array, `@graph`, and one-level-deep `mainEntity` / `about` wrappers (WebPage
// pointing at a Product). Does NOT recurse arbitrarily — we don't want to
// pick up Product nodes from a "related items" carousel embedded inside a
// review or itemListElement.
function collectTopLevelNodes(data: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(data)) {
    for (const child of data) {
      collectTopLevelNodes(child, out);
    }
    return;
  }
  if (!data || typeof data !== 'object') {
    return;
  }
  const obj = data as JsonLdNode;
  if (Array.isArray(obj['@graph'])) {
    for (const child of obj['@graph']) {
      collectTopLevelNodes(child, out);
    }
    return;
  }
  out.push(obj);
  // WebPage → Product wrapper. mainEntity is the canonical pattern; some
  // CMS templates use `about` instead.
  for (const key of ['mainEntity', 'about'] as const) {
    const inner = obj[key];
    if (inner && typeof inner === 'object') {
      collectTopLevelNodes(inner, out);
    }
  }
}

function readImages(node: JsonLdNode): string[] {
  const img = node.image;
  if (!img) {
    return [];
  }
  if (typeof img === 'string') {
    return [img];
  }
  if (Array.isArray(img)) {
    const out: string[] = [];
    for (const entry of img) {
      if (typeof entry === 'string') {
        out.push(entry);
      } else if (entry && typeof entry === 'object') {
        const u = (entry as Record<string, unknown>).url;
        if (typeof u === 'string') {
          out.push(u);
        }
      }
    }
    return out;
  }
  if (typeof img === 'object') {
    const u = (img as Record<string, unknown>).url;
    if (typeof u === 'string') {
      return [u];
    }
  }
  return [];
}

function readNumber(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v) && isFinite(v)) {
    return v;
  }
  if (typeof v === 'string') {
    // schema.org/price often serialized as string. Tolerate `"199.00"`,
    // `"1,199.00"` (thousands separators), but never accept ranges/dashes.
    const cleaned = v.replace(/,/g, '').trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
      return null;
    }
    const n = parseFloat(cleaned);
    if (isNaN(n) || !isFinite(n)) {
      return null;
    }
    return n;
  }
  return null;
}

function readCurrency(v: unknown): string | null {
  if (typeof v !== 'string') {
    return null;
  }
  const code = v.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function isInStock(availability: unknown): boolean | null {
  if (typeof availability !== 'string') {
    return null;
  }
  const tail = availability.split('/').pop() ?? availability;
  const lc = tail.toLowerCase();
  if (lc.includes('outofstock') || lc.includes('discontinued')) {
    return false;
  }
  if (
    lc.includes('instock') ||
    lc.includes('preorder') ||
    lc.includes('limitedavailability')
  ) {
    return true;
  }
  return null;
}

// Plausible upper bound on a fashion item price. Values above are almost
// always misreads (script bundle hashes, image dimensions misinterpreted as
// price, etc).
const MAX_PLAUSIBLE_PRICE = 1_000_000;

function isPlausiblePrice(n: number | null): boolean {
  return n !== null && n > 0 && n < MAX_PLAUSIBLE_PRICE;
}

type PricePair = {
  price: number;
  currency: string | null;
  inStock: boolean | null;
};

function pickFromOffer(node: JsonLdNode): PricePair | null {
  const types = nodeTypes(node);
  const isAggregate = types.some(
    (t) => t === 'AggregateOffer' || t.endsWith('/AggregateOffer'),
  );
  const inStock = isInStock(node.availability);
  if (inStock === false) {
    return null;
  }
  // Aggregate: prefer sale (low) over rack (high). Some sites duplicate
  // `price` == `highPrice`; we want the discounted one.
  const priceCandidate = isAggregate
    ? (readNumber(node.lowPrice) ??
      readNumber(node.price) ??
      readNumber(node.highPrice))
    : readNumber(node.price);
  if (!isPlausiblePrice(priceCandidate)) {
    return null;
  }
  return {
    price: priceCandidate!,
    currency: readCurrency(node.priceCurrency),
    inStock,
  };
}

function pickPriceFromOffers(offers: unknown): PricePair | null {
  if (!offers) {
    return null;
  }
  if (Array.isArray(offers)) {
    for (const o of offers) {
      if (o && typeof o === 'object') {
        const pair = pickPriceFromOffers(o);
        if (pair) {
          return pair;
        }
      }
    }
    return null;
  }
  if (typeof offers !== 'object') {
    return null;
  }
  const node = offers as JsonLdNode;
  if (isOfferType(node)) {
    return pickFromOffer(node);
  }
  // Nested `.offers` (some schemas wrap the Offer one level deeper).
  if ('offers' in node) {
    return pickPriceFromOffers(node.offers);
  }
  // Fall through: try to read price fields directly even if @type is missing.
  return pickFromOffer(node);
}

function urlsMatch(a: string | null | undefined, b: string): boolean {
  if (!a) {
    return false;
  }
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    if (pa.hostname.toLowerCase() !== pb.hostname.toLowerCase()) {
      return false;
    }
    const stripTrailingSlash = (p: string) =>
      p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
    return stripTrailingSlash(pa.pathname) === stripTrailingSlash(pb.pathname);
  } catch {
    return false;
  }
}

// Parses every JSON-LD script body and extracts a single Product node's
// images + price + currency. When multiple Product nodes exist (Google
// recommends one, but retailers don't always comply), prefer the one whose
// `url` matches the page URL, else the first one. Non-Product nodes
// contribute to `ambientImages` (Organization logo, Review thumbnails, etc.)
// as a final fallback when a page has no real Product schema.
export function extractFromJsonLd(
  scripts: string[],
  pageUrl: string,
): JsonLdExtract {
  const nodes: JsonLdNode[] = [];
  for (const raw of scripts) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      continue;
    }
    collectTopLevelNodes(data, nodes);
  }

  const productNodes = nodes.filter(isProduct);
  let product: JsonLdNode | null = null;
  if (productNodes.length === 1) {
    product = productNodes[0];
  } else if (productNodes.length > 1) {
    product =
      productNodes.find((p) =>
        urlsMatch(typeof p.url === 'string' ? p.url : null, pageUrl),
      ) ?? productNodes[0];
  }

  const productImages = product ? readImages(product) : [];
  const ambientImages: string[] = [];
  for (const node of nodes) {
    if (node === product) {
      continue;
    }
    if (isProduct(node)) {
      // Other Product nodes (e.g. related items) — don't contribute.
      continue;
    }
    ambientImages.push(...readImages(node));
  }

  let pricePair: PricePair | null = null;
  if (product) {
    pricePair = pickPriceFromOffers(product.offers);
  }
  // Some retailers split a top-level Offer/AggregateOffer outside the
  // Product node — fall back to scanning for one.
  if (!pricePair) {
    for (const node of nodes) {
      if (isOfferType(node)) {
        pricePair = pickFromOffer(node);
        if (pricePair) {
          break;
        }
      }
    }
  }

  return {
    productImages,
    ambientImages,
    price: pricePair?.price ?? null,
    currency: pricePair?.currency ?? null,
    inStock: pricePair?.inStock ?? null,
  };
}

// Microdata fallback for sites that don't ship JSON-LD (older Magento, hand-
// rolled CMSes). Pairs `itemprop="price"` with the *adjacent* `priceCurrency`
// so the two don't cross-contaminate from different offers on the page.
export function extractFromMicrodata(html: string): {
  price: number | null;
  currency: string | null;
} {
  // Look for the first `itemprop="price"` and search a 1KB window after it
  // for a `priceCurrency`. This binds the pair without parsing the full DOM.
  const priceMatch = html.match(
    /<[^>]+itemprop=["']price["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  );
  if (!priceMatch) {
    return { price: null, currency: null };
  }
  const price = readNumber(priceMatch[1]);
  if (!isPlausiblePrice(price)) {
    return { price: null, currency: null };
  }
  const tail = html.slice(
    priceMatch.index ?? 0,
    (priceMatch.index ?? 0) + 1024,
  );
  const currencyMatch = tail.match(
    /itemprop=["']priceCurrency["'][^>]*content=["']([A-Za-z]{3})["']/i,
  );
  const currency = currencyMatch ? readCurrency(currencyMatch[1]) : null;
  return { price, currency };
}

// Image scoring & ranking
// -----------------------

// Path tokens that overwhelmingly indicate non-product UI assets. Matched
// case-insensitive as bounded words to avoid catching e.g. "icondaria.jpg".
const BAD_PATH_PATTERN =
  /(?:^|[/_-])(logo|logos|favicon|sprite|sprites|placeholder|swatch|swatches|chip|chips|spinner|loading|loader|loaders|payment|payments|paypal|stripe-?logo|visa|mastercard|amex|discover|klarna|afterpay|apple-?pay|google-?pay|facebook|twitter|instagram|pinterest|tiktok|youtube|share|social)(?:[/_.-]|$)/i;

const ICON_TOKEN_PATTERN = /(?:^|[/_-])(icon|icons|ico)(?:[/_.-]|$)/i;

// Low-quality (small / preview) tokens — present but doesn't immediately
// disqualify (a hero filename could contain "thumb" in its parent dir on
// some CMSes); applied as a score penalty instead.
const LOW_QUALITY_PATTERN =
  /(?:^|[/_-])(thumb|thumbnail|thumbnails|mini|small|tiny|cart|tile|preview|cropped)(?:[/_.-]|$)/i;

const HI_RES_HINTS: RegExp[] = [
  /[_/-](\d{4,})w(?:[._/-]|$)/i, // generic _1500w
  /w_(\d{4,})/i, // Cloudinary w_2048
  /[_/-](\d{4,})x\d*(?:@\d+x)?(?:\.|$)/i, // Shopify _2048x.jpg or _2048x2048.jpg
  /[_/-](\d{4,})x(\d{3,})[._/-]/i, // generic 2048x2048
];

function hasHighResHint(path: string): boolean {
  for (const re of HI_RES_HINTS) {
    const m = path.match(re);
    if (!m) {
      continue;
    }
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 1000) {
      return true;
    }
  }
  return false;
}

function isPlausibleProductImage(parsed: URL): boolean {
  const path = parsed.pathname;
  const lcPath = path.toLowerCase();
  // SVGs are essentially always UI chrome — product photography is raster.
  if (lcPath.endsWith('.svg') || lcPath.endsWith('.svgz')) {
    return false;
  }
  if (parsed.protocol === 'data:') {
    return false;
  }
  if (BAD_PATH_PATTERN.test(lcPath)) {
    return false;
  }
  if (ICON_TOKEN_PATTERN.test(lcPath)) {
    return false;
  }
  return true;
}

export type ImageSource = {
  urls: string[];
  // Score added when a URL first appears from this source. Tagged so we
  // don't double-count when the same URL is in multiple sources.
  score: number;
  tag: string;
};

type RankEntry = {
  url: string;
  parsed: URL;
  score: number;
  tags: Set<string>;
  firstSeen: number;
};

// Combines multiple discovery sources into one ranked, deduped list.
// Score = sum of source weights (per unique source) + high-res bonus -
// low-quality penalty. Stable tie-breaker: order of first appearance.
//
// Falls back to `ambientImages` only when no scored candidate survives the
// product-image plausibility filter — handles pages whose only `image`
// signal lives on an Organization or BreadcrumbList node.
export function scoreAndRankImages(
  pageUrl: string,
  sources: ImageSource[],
  ambientImages: string[],
  maxImages: number,
): string[] {
  const byKey = new Map<string, RankEntry>();
  let counter = 0;

  const ingest = (raw: string, sourceScore: number, sourceTag: string) => {
    if (!raw) {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(normalizeImageUrl(raw), pageUrl);
    } catch {
      return;
    }
    if (!parsed.hostname.includes('.')) {
      return;
    }
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    if (!isPlausibleProductImage(parsed)) {
      return;
    }
    const key = dedupeKey(parsed);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        url: parsed.toString(),
        parsed,
        score: 0,
        tags: new Set(),
        firstSeen: counter++,
      };
      byKey.set(key, entry);
    }
    if (!entry.tags.has(sourceTag)) {
      entry.tags.add(sourceTag);
      entry.score += sourceScore;
    }
  };

  for (const src of sources) {
    for (const u of src.urls) {
      ingest(u, src.score, src.tag);
    }
  }

  // One-time bonuses/penalties per URL.
  for (const entry of byKey.values()) {
    const lcPath = entry.parsed.pathname.toLowerCase();
    if (hasHighResHint(lcPath)) {
      entry.score += 1;
    }
    if (LOW_QUALITY_PATTERN.test(lcPath)) {
      entry.score -= 2;
    }
  }

  if (byKey.size === 0) {
    return resolveAndDedupeUrls(pageUrl, ambientImages)
      .filter((u) => {
        try {
          return isPlausibleProductImage(new URL(u));
        } catch {
          return false;
        }
      })
      .slice(0, maxImages);
  }

  return [...byKey.values()]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.firstSeen - b.firstSeen;
    })
    .slice(0, maxImages)
    .map((e) => e.url);
}

// Restricts a candidate pool to URLs that Claude also returned as product
// images. Returns the intersection (in the pool's original order) when ≥ 2
// URLs overlap; otherwise returns the pool unchanged (Claude probably
// hallucinated or saw different URL forms than the static HTML did).
export function intersectWithClaude(
  pageUrl: string,
  pool: string[],
  claudeUrls: string[],
): string[] {
  if (claudeUrls.length === 0) {
    return pool;
  }
  const claudeKeys = new Set<string>();
  for (const raw of claudeUrls) {
    try {
      const parsed = new URL(normalizeImageUrl(raw), pageUrl);
      if (parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
      }
      claudeKeys.add(dedupeKey(parsed));
    } catch {
      // ignore malformed
    }
  }
  const filtered = pool.filter((u) => {
    try {
      return claudeKeys.has(dedupeKey(new URL(u)));
    } catch {
      return false;
    }
  });
  return filtered.length >= 2 ? filtered : pool;
}

// URL normalization (existing helpers)
// ------------------------------------

// Cloudinary/Imgix-style size-transform path segments, e.g. "w_640",
// "f_auto,c_limit,w_1920", "q_80", "dpr_2". Stripping these from the dedupe
// key collapses size variants of the same underlying image.
const TRANSFORM_SEGMENT = /^(?:[a-z]{1,4}_[\w.-]+)(?:,[a-z]{1,4}_[\w.-]+)*$/;

// Shopify-style image variants encode size as a filename suffix before the
// extension: `_300x300.jpg`, `_1024x.jpg`, `_800x@2x.jpg`. The `x` is
// mandatory; `_1.jpg` (a plain SKU index) must not match. Capture group 1 is
// the file extension we preserve.
const SHOPIFY_SIZE_SUFFIX = /_\d+x\d*(?:@\d+x)?(\.(?:jpg|jpeg|png|webp))$/i;

// Single-brace placeholders used by templating layers (Shopify Liquid renders
// `_{width}x.jpg` and substitutes client-side from a srcset of widths).
const DIMENSION_PLACEHOLDER = /\{(?:width|height|size)\}/gi;

const CANONICAL_SIZE = '_2048x';
const SUBSTITUTED_DIMENSION = '2048';

// Returns a hero-quality variant URL. Two normalizations:
//  1. Filename size suffix → `_2048x` (e.g. `_300x300.jpg` → `_2048x.jpg`)
//  2. `{width}` / `{height}` / `{size}` placeholders → `2048`
// On URLs with neither pattern this is a no-op, so it's safe to apply blindly.
// Works on raw strings (protocol-relative and relative URLs both pass through).
export function normalizeImageUrl(rawUrl: string): string {
  const substituted = rawUrl.replace(
    DIMENSION_PLACEHOLDER,
    SUBSTITUTED_DIMENSION,
  );
  const queryIdx = substituted.search(/[?#]/);
  const pathPart =
    queryIdx === -1 ? substituted : substituted.slice(0, queryIdx);
  const rest = queryIdx === -1 ? '' : substituted.slice(queryIdx);
  return pathPart.replace(SHOPIFY_SIZE_SUFFIX, `${CANONICAL_SIZE}$1`) + rest;
}

function dedupeKey(parsed: URL): string {
  const segments = parsed.pathname
    .split('/')
    .filter((s) => s && !TRANSFORM_SEGMENT.test(s));
  return `${parsed.origin}/${segments.join('/')}`;
}

export function resolveAndDedupeUrls(base: string, urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(normalizeImageUrl(raw), base);
    } catch {
      continue;
    }
    // Reject malformed URLs whose hostname has no dot (e.g. `https:files/...`
    // mis-typed by a merchant — resolves to hostname=`files`).
    if (!parsed.hostname.includes('.')) {
      continue;
    }
    // Upgrade http→https opportunistically; the original http origin almost
    // always also serves https, and forcing https collapses scheme-only dupes.
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    const key = dedupeKey(parsed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(parsed.toString());
  }
  return out;
}

// Some retailers (SSENSE, others on Cloudinary) embed their product gallery
// in a Next-style data blob inside <script>. The URLs there carry a literal
// __IMAGE_PARAMS__ placeholder the page's JS substitutes client-side. We
// extract those template URLs so the orchestrator can rebuild working URLs
// using og:image's transform segments as a reference.
export function extractTemplateImageUrls(html: string): string[] {
  // Decode JSON-escaped slashes (/ or \/) so URLs embedded in JSON blobs
  // are matched by the same regex as plain text URLs.
  const decoded = html.replace(/\\u002[Ff]/g, '/').replace(/\\\//g, '/');
  const re =
    /https?:\/\/[^\s"'<>\\]+__[A-Z][A-Z0-9_]*__[^\s"'<>\\]+\.(?:jpg|jpeg|png|webp)/gi;
  return decoded.match(re) ?? [];
}

// Given a template URL with a literal placeholder segment and a reference URL
// (typically og:image) on the same host, build a working URL by swapping the
// reference's filename for the template's. This propagates the reference's
// transform segments (e.g. Cloudinary `c_scale,h_480/v550`) onto the
// template's filename, which is the only product-distinguishing part.
export function rebuildFromReference(
  templateUrl: string,
  referenceUrl: string,
): string | null {
  let tmpl: URL;
  let ref: URL;
  try {
    tmpl = new URL(templateUrl);
    ref = new URL(referenceUrl);
  } catch {
    return null;
  }
  if (tmpl.hostname !== ref.hostname) {
    return null;
  }
  const tSegs = tmpl.pathname.split('/');
  const tFilename = tSegs[tSegs.length - 1];
  const rSegs = ref.pathname.split('/');
  const rFilename = rSegs[rSegs.length - 1];
  if (!tFilename || !rFilename) {
    return null;
  }
  if (tFilename === rFilename) {
    return null;
  }
  const built = new URL(ref.toString());
  built.pathname = [...rSegs.slice(0, -1), tFilename].join('/');
  built.search = '';
  return built.toString();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_STRIPPED_HTML_CHARS);
}
