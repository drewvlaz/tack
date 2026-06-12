import { callClaude } from '../../lib/anthropic';
import type { StaticExtract } from './candidates';
import { stripHtml, type ParsedDetail } from './meta';

const MODEL = 'claude-haiku-4-5-20251001';

export type ClaudeSelection = {
  title: string | null;
  brand: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  imageIndices: number[];
  details: ParsedDetail[];
};

const SYSTEM_PROMPT = `You are given evidence extracted from a retail product page: the page URL, OpenGraph fields, the page's schema.org Product JSON-LD (when present), a numbered list of candidate product-image URLs discovered in the page, and the page's visible text. Identify the MAIN product the page is selling and return only JSON, no prose, no markdown:

{
  "title": "product name or null",
  "brand": "brand name or null",
  "description": "1-2 sentence product description or null",
  "price": 99.99,
  "currency": "ISO-4217 code like USD, GBP, EUR — or null",
  "image_indices": [0, 3, 1],
  "details": [
    { "label": "Materials", "value": "100% wool" },
    { "label": "Care", "value": "Dry clean only" },
    { "label": "Sizing", "value": "Runs small, size up" }
  ]
}

Use null for any unknown field. Keep description concise — strip marketing fluff; describe the MAIN product only, never related/recommended items.

For "price": STRUCTURED_PRICE (when present) comes from the page's own schema.org markup and is usually correct — confirm it against PAGE_TEXT and return it unless the visible page clearly shows a different current price for the main product (e.g. the markup carries the original price but the page shows a sale price). When STRUCTURED_PRICE is "none", derive the price from PAGE_TEXT and PRICE_SIGNALS (snippets of the page's embedded JSON; judge each by its surrounding context — field names, the product name nearby — and ignore signals belonging to other products, shipping, or installment plans; values like 29800 with no decimal point next to a "298.00" elsewhere are minor units, return 298). Return the current sale price when both sale and struck-through original exist. Related/recommended products have their own prices — never return those. Reject obvious placeholders like 0.00.

For "currency": only return a 3-letter ISO 4217 code (USD, GBP, EUR, JPY, etc). Never infer from currency symbols alone — "$" could be USD, CAD, AUD, NZD, SGD, MXN. Return null unless the evidence contains either (a) an explicit ISO code in markup/text (STRUCTURED_PRICE and JSON_LD_PRODUCT count), or (b) a clear country/region indicator paired with a currency symbol (e.g. "Shipping to United Kingdom" + "£" → GBP; ".co.uk" domain + "£" → GBP; ".de" domain + "€" → EUR; ".jp" domain + "¥" → JPY). When uncertain, return null.

For "image_indices": select up to 6 indices from IMAGE_CANDIDATES that are photographs of the MAIN product, ordered best-first — the product hero / front view at position 0. Use each candidate's URL (filenames, SKU codes, path segments) plus its source annotation to judge. Candidates marked "suspect: related-products section" are images found inside recommendation/related-items containers — exclude them unless the URL clearly shows the main product's SKU. EXCLUDE: other products, related/recommended thumbnails, brand logos, social icons, payment badges, size charts, swatches/color chips, customer/review photos, packaging shots. Candidates sourced from "jsonld" are the retailer's own declared product gallery — prefer them. If several candidates are variants of the same shot (size variants, or the same filename served from different hosts/CDNs), include only one — prefer the higher-resolution / cleaner URL.

If REQUESTED_VARIANT is present, the user picked a specific colorway via the URL query (e.g. ?color=cream). Candidates tagged "variant: match" are images of THAT colorway; "variant: mismatch" are images of a different colorway on the same product. Select only matching ones — even when og:image / jsonld / script sources point at a different colorway (the page's default), prefer the matching candidates. If no "match" candidates exist, fall back to your usual selection but bias toward URLs whose filenames look like they could be the requested colorway. Return [] if no candidate shows the main product.

For "details": extract supplemental product facts from PAGE_TEXT that don't fit in description — materials/composition, care instructions, sizing/fit notes, country of origin, dimensions, fabric weight, color name, model height/wearing size. Each entry is one short label and one short value (no marketing copy). Return an empty array if nothing fits. Skip facts already in title/brand/price.`;

const MAX_EVIDENCE_CHARS = 40_000;
const MAX_JSONLD_CHARS = 8_000;
const MIN_PAGE_TEXT_CHARS = 8_000;

// Assembles the structured evidence document the model reasons over. The
// candidate list is numbered so the model selects by index — selection can
// never hallucinate a URL, and we never have to fuzzy-match URLs back.
export function buildEvidence(
  pageUrl: string,
  extract: StaticExtract,
  html: string,
): string {
  const lines: string[] = [`PAGE_URL: ${pageUrl}`, ''];

  lines.push(`OG_TITLE: ${extract.title ?? 'none'}`);
  lines.push(`OG_SITE_NAME: ${extract.brand ?? 'none'}`);
  lines.push(`OG_DESCRIPTION: ${extract.description ?? 'none'}`);
  if (extract.requestedVariant) {
    const { attr, value } = extract.requestedVariant;
    lines.push(
      `REQUESTED_VARIANT: ${attr.replace(/^data-/, '')}=${value} (from URL query)`,
    );
  }
  lines.push('');

  lines.push(
    extract.price !== null
      ? `STRUCTURED_PRICE: ${extract.price}${extract.currency ? ` ${extract.currency}` : ''} (from schema.org markup)`
      : 'STRUCTURED_PRICE: none',
  );
  lines.push('');

  if (extract.priceSignals.length > 0) {
    lines.push('PRICE_SIGNALS (from embedded page JSON, may include noise):');
    for (const s of extract.priceSignals) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  if (extract.productNode) {
    let json: string;
    try {
      json = JSON.stringify(extract.productNode);
    } catch {
      json = '';
    }
    if (json) {
      lines.push('JSON_LD_PRODUCT:');
      lines.push(json.slice(0, MAX_JSONLD_CHARS));
      lines.push('');
    }
  }

  lines.push('IMAGE_CANDIDATES:');
  if (extract.candidates.length === 0) {
    lines.push('(none discovered)');
  }
  extract.candidates.forEach((c, i) => {
    const annotations: string[] = [];
    if (c.tags.includes('img-suspect')) {
      annotations.push('suspect: related-products section');
    }
    if (c.tags.includes('img-variant-match')) {
      annotations.push('variant: match');
    }
    if (c.tags.includes('img-variant-mismatch')) {
      annotations.push('variant: mismatch');
    }
    const suffix = annotations.length ? '; ' + annotations.join('; ') : '';
    lines.push(`[${i}] ${c.url} (sources: ${c.tags.join('+')}${suffix})`);
  });
  lines.push('');

  const used = lines.join('\n').length;
  const textBudget = Math.max(MIN_PAGE_TEXT_CHARS, MAX_EVIDENCE_CHARS - used);
  lines.push('PAGE_TEXT:');
  lines.push(stripHtml(html, textBudget));

  return lines.join('\n');
}

function parseJsonResponse(text: string): Record<string, unknown> {
  // The prompt says "no prose, no markdown" but models occasionally add a
  // ```json fence or a "Here you go:" preamble. Strip those and parse the
  // first {…} block we find.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  try {
    return JSON.parse(body.trim());
  } catch {
    // Fall back to the largest {…} slice — handles trailing prose.
    const first = body.indexOf('{');
    const last = body.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(body.slice(first, last + 1));
      } catch {
        // fall through
      }
    }
    throw new Error(
      `Claude returned invalid JSON: ${text.slice(0, 200).replace(/\s+/g, ' ')}`,
    );
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

export function normalizeIndices(
  raw: unknown,
  candidateCount: number,
): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of raw) {
    if (
      typeof v !== 'number' ||
      !Number.isInteger(v) ||
      v < 0 ||
      v >= candidateCount ||
      seen.has(v)
    ) {
      continue;
    }
    seen.add(v);
    out.push(v);
  }
  return out;
}

function normalizeSelection(
  raw: Record<string, unknown>,
  candidateCount: number,
): ClaudeSelection {
  return {
    title: typeof raw.title === 'string' ? raw.title : null,
    brand: typeof raw.brand === 'string' ? raw.brand : null,
    description: typeof raw.description === 'string' ? raw.description : null,
    price:
      typeof raw.price === 'number' && !isNaN(raw.price) ? raw.price : null,
    currency: normalizeCurrency(raw.currency),
    imageIndices: normalizeIndices(raw.image_indices, candidateCount),
    details: normalizeDetails(raw.details),
  };
}

export async function selectProductMeta(
  evidence: string,
  candidateCount: number,
  apiKey: string,
): Promise<ClaudeSelection> {
  const text = await callClaude(apiKey, {
    model: MODEL,
    system: SYSTEM_PROMPT,
    user: evidence,
  });
  return normalizeSelection(parseJsonResponse(text), candidateCount);
}
