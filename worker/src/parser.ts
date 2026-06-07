export type ParsedMeta = {
  title: string | null
  brand: string | null
  price: number | null
  primaryImageUrl: string | null
}

function extractOgTag(html: string, property: string): string | null {
  const a = html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, 'i'))
  return a?.[1] ?? b?.[1] ?? null
}

function extractPrice(html: string): number | null {
  // Structured data: "price":"99.99" or "price":99.99
  const sdMatch = html.match(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/)
  if (sdMatch) {
    const n = parseFloat(sdMatch[1])
    if (!isNaN(n)) return n
  }
  // Dollar amount near "price" keyword
  const priceMatch = html.match(/price[^$]*\$\s*(\d+(?:\.\d{1,2})?)/)
  if (priceMatch) {
    const n = parseFloat(priceMatch[1])
    if (!isNaN(n)) return n
  }
  return null
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
    .slice(0, 40000)
}

export async function fetchAndParseMeta(url: string, apiKey: string): Promise<ParsedMeta> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Moodboard/1.0)' },
  })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const html = await res.text()

  const title = extractOgTag(html, 'title')
  const primaryImageUrl = extractOgTag(html, 'image')
  const brand = extractOgTag(html, 'site_name')
  let price = extractPrice(html)

  if (price === null) {
    const { extractMetaWithClaude } = await import('./claude')
    try {
      const meta = await extractMetaWithClaude(stripHtml(html), apiKey)
      price = meta.price
    } catch {
      // price stays null
    }
  }

  return { title, brand, price, primaryImageUrl }
}
