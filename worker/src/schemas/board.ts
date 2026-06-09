import { z } from 'zod';
import { ItemDetailSchema, StoredImageSchema } from './parse';
import { Coord, SafeUrl, Size, ZIndex } from './primitives';

export const BoardRoleSchema = z.enum(['owner', 'editor']);

export const BoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  role: BoardRoleSchema,
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

// Fields shared between the domain row (what services emit) and the wire shape
// (what the router returns over tRPC). The two diverge only in how images are
// represented: rows carry a `StoredImage` (R2 key or external URL); the wire
// carries a resolved display URL that the frontend can hit directly.
const BoardItemBaseSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string(),
  details: z.array(ItemDetailSchema),
  sourceUrl: z.string(),
  addedAt: z.number(),
  updatedAt: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
});

// Domain — services emit this. No transport knowledge.
export const BoardItemRowImageSchema = z.object({
  id: z.string(),
  image: StoredImageSchema,
});

export const BoardItemRowSchema = BoardItemBaseSchema.extend({
  images: z.array(BoardItemRowImageSchema),
});

// Wire — what the router returns. The `url` is constructed at the router
// boundary via `lib/imageRoute.ts:imageDisplayUrl`.
export const BoardImageSchema = z.object({
  id: z.string(),
  url: z.string(),
});

export const BoardItemSchema = BoardItemBaseSchema.extend({
  images: z.array(BoardImageSchema),
});

export const PatchBoardItemBody = z.object({
  x: Coord.optional(),
  y: Coord.optional(),
  zIndex: ZIndex.optional(),
  width: Size.optional(),
  height: Size.optional(),
});

export const AddItemBody = z.object({
  sourceUrl: SafeUrl,
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().nullable(),
  details: z.array(ItemDetailSchema),
  images: z.array(StoredImageSchema),
  x: Coord,
  y: Coord,
});

export type BoardItem = z.infer<typeof BoardItemSchema>;
export type BoardImage = z.infer<typeof BoardImageSchema>;
export type BoardItemRow = z.infer<typeof BoardItemRowSchema>;
export type BoardItemRowImage = z.infer<typeof BoardItemRowImageSchema>;
export type PatchBoardItemInput = z.infer<typeof PatchBoardItemBody>;
export type AddItemInput = z.infer<typeof AddItemBody>;
