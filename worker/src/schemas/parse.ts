import { z } from 'zod';
import { SafeUrl } from './primitives';

export const ParseUrlBody = z.object({
  url: SafeUrl,
});

// Bookmarklet input. The HTML comes from the user's own browser (post-render
// DOM of a page they're viewing), so we skip safeFetch entirely. URL still
// must pass SSRF policy — that's the parse base for relative URLs and the
// item's sourceUrl. HTML is capped at 4MB (same ceiling as the live fetch).
export const ParseFromHtmlBody = z.object({
  url: SafeUrl,
  html: z
    .string()
    .min(1)
    .max(4 * 1024 * 1024),
});

export const StoredImageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('r2'),
    key: z.string(),
    sourceUrl: z.string(),
  }),
  z.object({
    kind: z.literal('external'),
    url: z.string(),
    sourceUrl: z.string(),
  }),
]);

export const ItemDetailSchema = z.object({
  label: z.string(),
  value: z.string(),
});

// Soft failures from the parser pipeline. A hard fetch failure throws and the
// router returns a tRPC error; these communicate degraded-but-usable results.
//
// `parsed_from_archive`: the live site blocked us (403/429 — typically Akamai/
// DataDome on luxury retailers); we recovered by parsing the Wayback Machine's
// most recent snapshot of the same URL. Prices may be stale by days/weeks.
export const ParseWarningSchema = z.enum([
  'claude_failed',
  'image_fetch_failed',
  'no_images',
  'parsed_from_archive',
]);

export const ParseResultSchema = z.object({
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  details: z.array(ItemDetailSchema),
  images: z.array(StoredImageSchema),
  warnings: z.array(ParseWarningSchema),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;
export type ParseWarning = z.infer<typeof ParseWarningSchema>;
export type StoredImageRef = z.infer<typeof StoredImageSchema>;
export type ItemDetail = z.infer<typeof ItemDetailSchema>;
