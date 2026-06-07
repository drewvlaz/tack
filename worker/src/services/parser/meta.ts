export type ParsedDetail = { label: string; value: string };

export type ParsedMeta = {
  title: string | null;
  brand: string | null;
  description: string | null;
  price: number | null;
  imageUrls: string[];
  details: ParsedDetail[];
};

export type ParsedHtml = {
  title: string | null;
  brand: string | null;
  description: string | null;
  ogImages: string[];
  jsonLdImages: string[];
  imgTagImages: string[];
};

const OG_IMAGE_PROPS = new Set([
  'og:image',
  'og:image:secure_url',
  'og:image:url',
]);

const MAX_STRIPPED_HTML_CHARS = 40_000;

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
        const picked = srcset
          ? largestFromSrcset(srcset)
          : (el.getAttribute('src') ?? null);
        if (picked) {
          imgTagImages.push(picked);
        }
      },
    });

  await rewriter.transform(new Response(html)).arrayBuffer();

  const jsonLdImages: string[] = [];
  for (const raw of jsonLdScripts) {
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
    walkForImages(data, jsonLdImages);
  }

  return { title, brand, description, ogImages, jsonLdImages, imgTagImages };
}

// Picks the URL with the largest width descriptor from a srcset string. URLs
// themselves may contain commas (e.g. Cloudinary `f_auto,c_limit,w_256`), so
// per the HTML spec we split on `, ` (comma + whitespace), which only appears
// between candidate entries.
export function largestFromSrcset(srcset: string): string | null {
  let bestUrl: string | null = null;
  let bestWidth = -1;
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
    if (bestUrl === null || width > bestWidth) {
      bestUrl = url;
      bestWidth = width;
    }
  }
  return bestUrl;
}

function walkForImages(node: unknown, out: string[]): void {
  if (node === null || node === undefined) {
    return;
  }
  if (typeof node === 'string') {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      walkForImages(child, out);
    }
    return;
  }
  if (typeof node !== 'object') {
    return;
  }
  const obj = node as Record<string, unknown>;
  const img = obj.image;
  if (typeof img === 'string') {
    out.push(img);
  } else if (Array.isArray(img)) {
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
  } else if (img && typeof img === 'object') {
    const u = (img as Record<string, unknown>).url;
    if (typeof u === 'string') {
      out.push(u);
    }
  }
  for (const v of Object.values(obj)) {
    walkForImages(v, out);
  }
}

export function extractPrice(html: string): number | null {
  const sdMatch = html.match(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/);
  if (sdMatch) {
    const n = parseFloat(sdMatch[1]);
    if (!isNaN(n)) {
      return n;
    }
  }
  const priceMatch = html.match(/price[^$]*\$\s*(\d+(?:\.\d{1,2})?)/);
  if (priceMatch) {
    const n = parseFloat(priceMatch[1]);
    if (!isNaN(n)) {
      return n;
    }
  }
  return null;
}

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
