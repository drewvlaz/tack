export type ParsedMeta = {
  title: string | null;
  brand: string | null;
  price: number | null;
  primaryImageUrl: string | null;
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
