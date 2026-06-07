import { z } from 'zod';
import { SafeUrl } from './primitives';

export const ParseUrlBody = z.object({
  url: SafeUrl,
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
export const ParseWarningSchema = z.enum([
  'claude_failed',
  'image_fetch_failed',
  'no_images',
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
