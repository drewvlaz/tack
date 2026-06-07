import { callClaude } from '../../lib/anthropic';
import type { ParsedDetail, ParsedMeta } from './meta';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `Extract product metadata from HTML. Return only JSON, no prose, no markdown.

{
  "title": "product name or null",
  "brand": "brand name or null",
  "description": "1-2 sentence product description or null",
  "price": 99.99,
  "image_urls": ["highest-res product image URLs in order, omit thumbnails/swatches/related products"],
  "details": [
    { "label": "Materials", "value": "100% wool" },
    { "label": "Care", "value": "Dry clean only" },
    { "label": "Sizing", "value": "Runs small, size up" }
  ]
}

Return the sale price if both sale and original prices exist. Use null for any unknown field. Keep description concise — strip marketing fluff. Return an empty array if no product images found.

For "details": extract supplemental product facts that don't fit in description — materials/composition, care instructions, sizing/fit notes, country of origin, dimensions, fabric weight, color name, model height/wearing size. Each entry is one short label and one short value (no marketing copy, no full sentences when a phrase will do). Return an empty array if nothing fits. Skip facts already in title/brand/price.`;

function parseJsonResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON');
  }
}

function normalizeDetails(raw: unknown): ParsedDetail[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ParsedDetail[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { label, value } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || typeof value !== 'string') {
      continue;
    }
    const l = label.trim();
    const v = value.trim();
    if (!l || !v) {
      continue;
    }
    out.push({ label: l, value: v });
  }
  return out;
}

function normalizeMeta(raw: Record<string, unknown>): ParsedMeta {
  return {
    title: typeof raw.title === 'string' ? raw.title : null,
    brand: typeof raw.brand === 'string' ? raw.brand : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    price:
      typeof raw.price === 'number' && !isNaN(raw.price) ? raw.price : null,
    imageUrls: Array.isArray(raw.image_urls)
      ? raw.image_urls.filter((u): u is string => typeof u === 'string')
      : [],
    details: normalizeDetails(raw.details),
  };
}

export async function extractMetaWithClaude(
  html: string,
  apiKey: string,
): Promise<ParsedMeta> {
  const text = await callClaude(apiKey, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    user: html,
  });
  return normalizeMeta(parseJsonResponse(text));
}
