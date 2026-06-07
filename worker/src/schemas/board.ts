import { z } from 'zod';
import { StoredImageSchema } from './parse';

export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
});

export const CreateBoardBody = z.object({
  name: z.string().min(1).max(80),
});

export const RenameBoardBody = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
});

export type Board = z.infer<typeof BoardSchema>;
export type CreateBoardInput = z.infer<typeof CreateBoardBody>;
export type RenameBoardInput = z.infer<typeof RenameBoardBody>;

export const BoardItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string(),
  imageUrls: z.array(z.string()),
  sourceUrl: z.string(),
  updatedAt: z.number(),
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
  description: z.string().nullable(),
  price: z.number().nullable(),
  images: z.array(StoredImageSchema),
  x: z.number(),
  y: z.number(),
});

export type BoardItem = z.infer<typeof BoardItemSchema>;
export type PatchBoardItemInput = z.infer<typeof PatchBoardItemBody>;
export type AddItemInput = z.infer<typeof AddItemBody>;
