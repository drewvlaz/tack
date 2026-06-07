import { z } from 'zod';

export const ParseUrlBody = z.object({
  url: z.string().url(),
});

export const StoredImageSchema = z.object({
  r2Key: z.string(),
  sourceUrl: z.string(),
});

export const ParseResultSchema = z.object({
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  images: z.array(StoredImageSchema),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;
export type StoredImageRef = z.infer<typeof StoredImageSchema>;
