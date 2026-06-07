import type { ParsedMeta } from './meta';

export async function extractMetaWithClaude(
  html: string,
  apiKey: string,
): Promise<ParsedMeta> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Extract product metadata from this HTML. Return only JSON, no prose, no markdown.

{
  "title": "product name or null",
  "brand": "brand name or null",
  "description": "1-2 sentence product description or null",
  "price": 99.99,
  "image_urls": ["highest-res product image URLs in order, omit thumbnails/swatches/related products"]
}

Return the sale price if both sale and original prices exist. Use null for any unknown field. Keep description concise — strip marketing fluff. Return an empty array if no product images found.

HTML:
${html}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);

  const data = await res.json<{ content: Array<{ text: string }> }>();
  const text = data.content[0]?.text ?? '';

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON');
  }

  const price =
    typeof parsed.price === 'number' && !isNaN(parsed.price)
      ? parsed.price
      : null;

  const imageUrls = Array.isArray(parsed.image_urls)
    ? parsed.image_urls.filter((u): u is string => typeof u === 'string')
    : [];

  return {
    title: typeof parsed.title === 'string' ? parsed.title : null,
    brand: typeof parsed.brand === 'string' ? parsed.brand : null,
    description:
      typeof parsed.description === 'string' ? parsed.description : null,
    price,
    imageUrls,
  };
}
