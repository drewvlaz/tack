import { z } from 'zod';

export const BoardItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string(),
  imageUrl: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
});

export const PatchBoardItemBody = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  zIndex: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const AddItemBody = z.object({
  sourceUrl: z.string(),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  price: z.number().nullable(),
  imageUrl: z.string().nullable(),
  x: z.number(),
  y: z.number(),
});

export type BoardItem = z.infer<typeof BoardItemSchema>;
export type PatchBoardItemInput = z.infer<typeof PatchBoardItemBody>;
export type AddItemInput = z.infer<typeof AddItemBody>;
