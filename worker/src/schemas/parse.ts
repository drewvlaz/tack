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

export const ParseResultSchema = z.object({
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  details: z.array(ItemDetailSchema),
  images: z.array(StoredImageSchema),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;
export type StoredImageRef = z.infer<typeof StoredImageSchema>;
export type ItemDetail = z.infer<typeof ItemDetailSchema>;
