import { z } from 'zod';

export const ParseUrlBody = z.object({
  url: z.string().url(),
});

export const ParseResultSchema = z.object({
  title: z.string().nullable(),
  brand: z.string().nullable(),
  price: z.number().nullable(),
  imageUrl: z.string().nullable(),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;
