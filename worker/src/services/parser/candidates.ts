import {
  extractFromJsonLd,
  extractFromMicrodata,
  extractPriceSignals,
  extractRawImageUrls,
  extractTemplateImageUrls,
  parseHtml,
  rebuildFromReference,
  scoreAndRankImages,
  type ImageSource,
  type RankedImage,
  type VariantHint,
} from './meta';

export type ImageCandidate = RankedImage;

export type StaticExtract = {
  title: string | null;
  // <title> tag fallback — used only when og:title and Claude both miss.
  docTitle: string | null;
  brand: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  productNode: Record<string, unknown> | null;
  candidates: ImageCandidate[];
  // Price-shaped fields harvested from embedded script JSON, with context.
  // Evidence for the Claude stage only — never trusted directly.
  priceSignals: string[];
  // Variant requested via the page URL query (e.g. ?color=cream). Null when
  // the URL carries no recognized variant param.
  requestedVariant: VariantHint | null;
};

// How many ranked candidates to keep. Larger than the final image cap so the
// Claude selection stage has real choices, small enough to bound prompt size.
export const MAX_CANDIDATES = 20;

// When at least this many positively-scored candidates exist, the no-Claude
// fallback drops zero/negative-score ones (off-host imgs, suspect-section
// imgs) entirely.
const MIN_CONFIDENT_CANDIDATES = 3;

// Source weights. JSON-LD Product images are retailer-declared product
// photography (strongest); template-rebuilt gallery URLs next; og:image is a
// reliable hero shot; same-host <img> tags are weak; off-host <img> tags are
// kept but contribute nothing (third-party widgets, ads); <img> tags found
// inside related/recommendation containers are actively penalized — they are
// usually OTHER products.
const SCORE_JSONLD = 4;
const SCORE_REBUILT = 3;
// `<img>` inside a container whose variant attribute matches the URL's
// requested variant. Scored above plain JSON-LD/og because those signals
// usually reflect the page's DEFAULT variant, not the one being viewed.
const SCORE_IMG_VARIANT_MATCH = 5;
const SCORE_OG = 2;
// Raw-scanned script-JSON URLs sharing og:image's directory are almost
// always the rest of the product gallery on SPA retailers.
const SCORE_SCRIPT_SAMEDIR = 2;
const SCORE_IMG = 1;
const SCORE_IMG_OFFHOST = 0;
const SCORE_SCRIPT = 0;
const SCORE_IMG_SUSPECT = -3;
// Variant mismatch is a stronger negative than the related-products suspect
// tag — when the user asked for ?color=cream, blue/white-stripe images are
// definitively NOT what they want, even if every other signal liked them.
const SCORE_IMG_VARIANT_MISMATCH = -6;

// Some CDN-templated URLs in JSON-LD contain a literal placeholder the page's
// JS would substitute at runtime (e.g. SSENSE's `__IMAGE_PARAMS__`). Server-side
// fetches of these 404, so drop them rather than store broken externals.
const PLACEHOLDER_SEGMENT = /__[A-Z][A-Z0-9_]*__|\{\{[^}]+\}\}/;

export function hasPlaceholderSegment(url: string): boolean {
  return PLACEHOLDER_SEGMENT.test(url);
}

// URL query keys that hint at a product variant the retailer expresses as a
// `data-<key>` attribute on its gallery containers. `variant` (Shopify's
// numeric id) is deliberately omitted — IDs rarely appear as raw text on the
// page; surface those to Claude only.
const VARIANT_QUERY_KEYS: Record<string, string> = {
  color: 'data-color',
  colour: 'data-colour',
};

export function extractVariantHint(pageUrl: string): VariantHint | null {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return null;
  }
  for (const [key, attr] of Object.entries(VARIANT_QUERY_KEYS)) {
    const raw = parsed.searchParams.get(key);
    if (raw) {
      const value = raw.trim().toLowerCase();
      if (value) {
        return { attr, value };
      }
    }
  }
  return null;
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

function dirnameOf(raw: string, base: string): string | null {
  try {
    const path = new URL(raw, base).pathname;
    return path.slice(0, path.lastIndexOf('/'));
  } catch {
    return null;
  }
}

export async function extractCandidates(
  html: string,
  pageUrl: string,
): Promise<StaticExtract> {
  const requestedVariant = extractVariantHint(pageUrl);
  const parsed = await parseHtml(html, requestedVariant ?? undefined);
  const {
    title,
    docTitle,
    brand,
    description,
    ogImages,
    jsonLdScripts,
    imgTagImages,
  } = parsed;

  // Structured-data first (anchored to schema.org/Product; price+currency
  // come from the same Offer node so they always agree). Microdata is the
  // fallback for sites that don't ship JSON-LD.
  const jsonLd = extractFromJsonLd(jsonLdScripts, pageUrl);
  let price = jsonLd.price;
  let currency = jsonLd.currency;
  if (price === null) {
    const micro = extractFromMicrodata(html);
    price = micro.price;
    if (currency === null) {
      currency = micro.currency;
    }
  }

  // Some retailers (e.g. SSENSE) embed the gallery in script JSON with
  // literal __IMAGE_PARAMS__ placeholders we rebuild using og:image as a
  // transform reference.
  const ogReference = ogImages[0];
  const rebuiltFromTemplates = ogReference
    ? extractTemplateImageUrls(html)
        .map((t) => rebuildFromReference(t, ogReference))
        .filter((u): u is string => u !== null)
    : [];

  // <img> tags are bucketed by:
  //   - variantMatch ('match' | 'mismatch' | 'none') — when the URL carries
  //     ?color=X and the page exposes per-variant `data-color` containers,
  //     match/mismatch are strong, overriding suspect/host scoring
  //   - suspect — inside related/recommendation/menu containers
  //   - host — shares og:image's host OR the page's own host (galleries are
  //     commonly served from the page domain while og:image points at a
  //     CDN alias, e.g. cdn.shopify.com vs the storefront domain). Truly
  //     off-host tags are usually widgets/ads.
  const ogHost = hostnameOf(ogReference, pageUrl);
  const pageHost = hostnameOf(pageUrl, pageUrl);
  const imgVariantMatch: string[] = [];
  const imgVariantMismatch: string[] = [];
  const imgSameHost: string[] = [];
  const imgOffHost: string[] = [];
  const imgSuspect: string[] = [];
  for (const img of imgTagImages) {
    if (img.variantMatch === 'match') {
      imgVariantMatch.push(img.url);
      continue;
    }
    if (img.variantMatch === 'mismatch') {
      imgVariantMismatch.push(img.url);
      continue;
    }
    const host = hostnameOf(img.url, pageUrl);
    if (img.suspect) {
      imgSuspect.push(img.url);
    } else if (ogHost === null || host === ogHost || host === pageHost) {
      imgSameHost.push(img.url);
    } else {
      imgOffHost.push(img.url);
    }
  }

  // Raw script-JSON scan, anchored to a known product-image host (og:image
  // or the first JSON-LD image) — SPA retailers keep the real gallery in
  // Next/analytics blobs. Unanchored raw scanning is too noisy to use.
  const anchor = ogReference ?? jsonLd.productImages[0];
  const anchorHost = hostnameOf(anchor, pageUrl);
  const anchorDir = anchor ? dirnameOf(anchor, pageUrl) : null;
  const scriptSameDir: string[] = [];
  const scriptSameHost: string[] = [];
  if (anchorHost) {
    for (const u of extractRawImageUrls(html)) {
      if (hostnameOf(u, pageUrl) !== anchorHost) {
        continue;
      }
      if (anchorDir !== null && dirnameOf(u, pageUrl) === anchorDir) {
        scriptSameDir.push(u);
      } else {
        scriptSameHost.push(u);
      }
    }
  }

  const sources: ImageSource[] = [
    {
      tag: 'img-variant-match',
      score: SCORE_IMG_VARIANT_MATCH,
      urls: imgVariantMatch,
    },
    { tag: 'jsonld', score: SCORE_JSONLD, urls: jsonLd.productImages },
    { tag: 'rebuilt', score: SCORE_REBUILT, urls: rebuiltFromTemplates },
    { tag: 'og', score: SCORE_OG, urls: ogImages },
    { tag: 'script-samedir', score: SCORE_SCRIPT_SAMEDIR, urls: scriptSameDir },
    { tag: 'img', score: SCORE_IMG, urls: imgSameHost },
    { tag: 'img-offhost', score: SCORE_IMG_OFFHOST, urls: imgOffHost },
    { tag: 'script', score: SCORE_SCRIPT, urls: scriptSameHost },
    { tag: 'img-suspect', score: SCORE_IMG_SUSPECT, urls: imgSuspect },
    {
      tag: 'img-variant-mismatch',
      score: SCORE_IMG_VARIANT_MISMATCH,
      urls: imgVariantMismatch,
    },
  ];

  let candidates = scoreAndRankImages(
    pageUrl,
    sources,
    jsonLd.ambientImages,
    MAX_CANDIDATES,
  ).filter((c) => !hasPlaceholderSegment(c.url));

  // Hard variant filter: when the URL explicitly requested a colorway AND
  // the page exposed match candidates, the user's intent is unambiguous —
  // drop every URL we proved is for a different colorway, even if it
  // out-scored on other signals (og:image and JSON-LD typically point at
  // the default variant, which would otherwise drag the picker back to it).
  const hasVariantMatch = candidates.some((c) =>
    c.tags.includes('img-variant-match'),
  );
  if (requestedVariant && hasVariantMatch) {
    candidates = candidates.filter(
      (c) => !c.tags.includes('img-variant-mismatch'),
    );
  }

  return {
    title,
    docTitle,
    brand,
    description,
    price,
    currency,
    productNode: jsonLd.productNode,
    candidates,
    priceSignals: extractPriceSignals(html),
    requestedVariant,
  };
}

// Deterministic image pick used when the Claude selection stage fails or
// returns nothing usable: prefer positively-scored candidates, widen to
// zero-score ones when too few, and only as a last resort fall back to the
// penalized (suspect) tail.
export function pickDefaultImages(
  candidates: ImageCandidate[],
  maxImages: number,
): string[] {
  const positive = candidates.filter((c) => c.score > 0);
  if (positive.length >= MIN_CONFIDENT_CANDIDATES) {
    return positive.slice(0, maxImages).map((c) => c.url);
  }
  const nonNegative = candidates.filter((c) => c.score >= 0);
  const pool = nonNegative.length > 0 ? nonNegative : candidates;
  return pool.slice(0, maxImages).map((c) => c.url);
}
