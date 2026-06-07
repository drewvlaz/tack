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
  let currentScript: string | null = null;

  const rewriter = new HTMLRewriter()
    .on('meta', {
      element(el) {
        const prop = el.getAttribute('property') ?? el.getAttribute('name');
        const content = el.getAttribute('content');
        if (!prop || !content) return;
        if (prop === 'og:title') title ??= content;
        else if (prop === 'og:site_name') brand ??= content;
        else if (prop === 'og:description') description ??= content;
        else if (OG_IMAGE_PROPS.has(prop)) ogImages.push(content);
      },
    })
    .on('script[type="application/ld+json"]', {
      element() {
        currentScript = '';
      },
      text(chunk) {
        if (currentScript === null) return;
        currentScript += chunk.text;
        if (chunk.lastInTextNode) {
          jsonLdScripts.push(currentScript);
          currentScript = null;
        }
      },
    });

  await rewriter.transform(new Response(html)).arrayBuffer();

  const jsonLdImages: string[] = [];
  for (const raw of jsonLdScripts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      continue;
    }
    walkForImages(data, jsonLdImages);
  }

  return { title, brand, description, ogImages, jsonLdImages };
}

function walkForImages(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') return;
  if (Array.isArray(node)) {
    for (const child of node) walkForImages(child, out);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const img = obj.image;
  if (typeof img === 'string') {
    out.push(img);
  } else if (Array.isArray(img)) {
    for (const entry of img) {
      if (typeof entry === 'string') out.push(entry);
      else if (entry && typeof entry === 'object') {
        const u = (entry as Record<string, unknown>).url;
        if (typeof u === 'string') out.push(u);
      }
    }
  } else if (img && typeof img === 'object') {
    const u = (img as Record<string, unknown>).url;
    if (typeof u === 'string') out.push(u);
  }
  for (const v of Object.values(obj)) walkForImages(v, out);
}

export function extractPrice(html: string): number | null {
  const sdMatch = html.match(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/);
  if (sdMatch) {
    const n = parseFloat(sdMatch[1]);
    if (!isNaN(n)) return n;
  }
  const priceMatch = html.match(/price[^$]*\$\s*(\d+(?:\.\d{1,2})?)/);
  if (priceMatch) {
    const n = parseFloat(priceMatch[1]);
    if (!isNaN(n)) return n;
  }
  return null;
}

export function resolveAndDedupeUrls(base: string, urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    let parsed: URL;
    try {
      parsed = new URL(raw, base);
    } catch {
      continue;
    }
    const key = `${parsed.origin}${parsed.pathname}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed.toString());
  }
  return out;
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
