export type ParsedMeta = {
  title: string | null;
  brand: string | null;
  description: string | null;
  price: number | null;
  imageUrls: string[];
};

export function extractOgTag(html: string, property: string): string | null {
  const a = html.match(
    new RegExp(
      `<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
  );
  const b = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`,
      'i',
    ),
  );
  return a?.[1] ?? b?.[1] ?? null;
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

export function extractOgImages(html: string): string[] {
  const urls: string[] = [];
  const forward =
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = forward.exec(html)) !== null) urls.push(m[1]);
  const reverse =
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url|:url)?["']/gi;
  while ((m = reverse.exec(html)) !== null) urls.push(m[1]);
  return urls;
}

export function extractJsonLdImages(html: string): string[] {
  const urls: string[] = [];
  const ldRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = ldRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    walkForImages(data, urls);
  }
  return urls;
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
    .slice(0, 40000);
}
