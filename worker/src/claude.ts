import type { ParsedMeta } from './parser'

export async function extractMetaWithClaude(html: string, apiKey: string): Promise<ParsedMeta> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Extract product metadata from this HTML. Return only JSON, no prose, no markdown.

{
  "title": "product name or null",
  "brand": "brand name or null",
  "price": 99.99,
  "primary_image_url": "highest res image URL found or null"
}

Return the sale price if both sale and original prices exist. Use null for any field you cannot determine.

HTML:
${html}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)

  const data = await res.json<{ content: Array<{ text: string }> }>()
  const text = data.content[0]?.text ?? ''

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Claude returned invalid JSON')
  }

  const price = typeof parsed.price === 'number' && !isNaN(parsed.price) ? parsed.price : null

  return {
    title: typeof parsed.title === 'string' ? parsed.title : null,
    brand: typeof parsed.brand === 'string' ? parsed.brand : null,
    price,
    primaryImageUrl: typeof parsed.primary_image_url === 'string' ? parsed.primary_image_url : null,
  }
}
