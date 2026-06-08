import { callClaude } from '../../lib/anthropic';
import type { ParsedDetail, ParsedMeta } from './meta';

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `Extract product metadata from HTML. Return only JSON, no prose, no markdown.

{
  "title": "product name or null",
  "brand": "brand name or null",
  "description": "1-2 sentence product description or null",
  "price": 99.99,
  "currency": "ISO-4217 code like USD, GBP, EUR — or null",
  "image_urls": ["highest-res product image URLs in order, hero front-view at index 0"],
  "details": [
    { "label": "Materials", "value": "100% wool" },
    { "label": "Care", "value": "Dry clean only" },
    { "label": "Sizing", "value": "Runs small, size up" }
  ]
}

Use null for any unknown field. Keep description concise — strip marketing fluff. Return an empty array if no product images found.

For "price": return the current sale price if both sale and original prices exist (struck-through original is the rack price, not what to return). If the page shows recommended/related products with their own prices, return the price of the product whose title matches the page heading — NOT the cheapest related item. Reject obvious placeholders like 0.00.

For "currency": only return a 3-letter ISO 4217 code (USD, GBP, EUR, JPY, etc). Never infer from currency symbols alone — "$" could be USD, CAD, AUD, NZD, SGD, MXN. Return null unless the page contains either (a) an explicit ISO code in markup/text, or (b) a clear country/region indicator paired with a currency symbol (e.g. "Shipping to United Kingdom" + "£" → GBP; "Prix en France" + "€" → EUR; ".co.uk" domain + "£" → GBP; ".de" domain + "€" → EUR; ".jp" domain + "¥" → JPY). When uncertain, return null.

For "image_urls": return at most 6 URLs. Index 0 must be the product hero / front view. EXCLUDE: brand logos, social-share icons, payment-method badges (Visa/Klarna/PayPal/etc), navigation chrome, related/recommended product thumbnails, customer or review photos, size-chart graphics, swatch and color-chip images, packaging shots, and "as seen in" press logos. If multiple resolutions of the same image exist, pick the largest. Only return URLs that appear in the source HTML (do not invent URLs).

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

function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function normalizeMeta(raw: Record<string, unknown>): ParsedMeta {
  return {
    title: typeof raw.title === 'string' ? raw.title : null,
    brand: typeof raw.brand === 'string' ? raw.brand : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    price:
      typeof raw.price === 'number' && !isNaN(raw.price) ? raw.price : null,
    currency: normalizeCurrency(raw.currency),
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
