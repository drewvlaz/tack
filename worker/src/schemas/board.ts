import { z } from 'zod';
import { ItemDetailSchema, StoredImageSchema } from './parse';
import { Coord, SafeUrl, Size, ZIndex } from './primitives';

export const BoardRoleSchema = z.enum(['owner', 'editor', 'viewer']);

// Roles assignable via invite or updateMemberRole. Owner is implicit via
// boards.ownerId and cannot be granted through these flows.
export const InviteRoleSchema = z.enum(['editor', 'viewer']);
export type InviteRole = z.infer<typeof InviteRoleSchema>;

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

export const TextAlignSchema = z.enum(['left', 'center', 'right']);
export type TextAlign = z.infer<typeof TextAlignSchema>;

// Placement-level fields — shared by every `kind`. After fold 0009 the
// placement IS the item; `id` is the only identity. `addedBy` is informational
// attribution (nullable if the contributor's account was deleted).
const PlacementFields = z.object({
  id: z.string(),
  addedAt: z.number(),
  addedBy: z.string().nullable(),
  updatedAt: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  tags: z.array(z.string()),
});

// Product variant — all the URL-parse metadata.
const ProductFields = z.object({
  kind: z.literal('product'),
  title: z.string().nullable(),
  brand: z.string().nullable(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string(),
  details: z.array(ItemDetailSchema),
  sourceUrl: z.string(),
});

// Text variant — sparse text-shape columns. Nullable style knobs let the
// renderer fall back to the user's theme default.
const TextFields = z.object({
  kind: z.literal('text'),
  textContent: z.string(),
  textFontSize: z.number().nullable(),
  textWeight: z.number().nullable(),
  textColorToken: z.string().nullable(),
  textAlign: TextAlignSchema.nullable(),
});

// Domain — services emit this. No transport knowledge.
export const BoardItemRowImageSchema = z.object({
  id: z.string(),
  image: StoredImageSchema,
});

const ProductRow = PlacementFields.merge(ProductFields).extend({
  images: z.array(BoardItemRowImageSchema),
});
const TextRow = PlacementFields.merge(TextFields);
export const BoardItemRowSchema = z.discriminatedUnion('kind', [
  ProductRow,
  TextRow,
]);

// Wire — what the router returns. The product `url` is constructed at the
// router boundary via `lib/imageRoute.ts:imageDisplayUrl`.
export const BoardImageSchema = z.object({
  id: z.string(),
  url: z.string(),
});

const ProductWire = PlacementFields.merge(ProductFields).extend({
  images: z.array(BoardImageSchema),
});
export const BoardItemSchema = z.discriminatedUnion('kind', [
  ProductWire,
  TextRow,
]);

export const PatchBoardItemBody = z.object({
  x: Coord.optional(),
  y: Coord.optional(),
  zIndex: ZIndex.optional(),
  width: Size.optional(),
  height: Size.optional(),
});

// Cap at 100 to stay within D1's `db.batch()` statement limit. Each entry
// stages exactly one UPDATE / one soft-delete, so N entries ⇒ N statements.
const BATCH_MAX = 100;

export const PatchItemsManyBody = z.object({
  patches: z
    .array(z.object({ id: z.string(), patch: PatchBoardItemBody }))
    .min(1)
    .max(BATCH_MAX),
});

export const DeleteItemsManyBody = z.object({
  ids: z.array(z.string()).min(1).max(BATCH_MAX),
});

const TagName = z.string().min(1).max(64);

export const TagsMutationBody = z.object({
  boardItemIds: z.array(z.string()).min(1).max(BATCH_MAX),
  names: z.array(TagName).min(1).max(50),
});
export type TagsMutationInput = z.infer<typeof TagsMutationBody>;

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

// Text-shape inputs. `null` means clear the style knob (fall back to default);
// `undefined` means leave it untouched (only on patch). `content` is plain
// string — rich text is deferred.
const TextStyleBody = z.object({
  fontSize: z.number().positive().nullable().optional(),
  weight: z.number().int().min(100).max(900).nullable().optional(),
  colorToken: z.string().min(1).max(64).nullable().optional(),
  align: TextAlignSchema.nullable().optional(),
});

export const AddTextItemBody = TextStyleBody.extend({
  content: z.string(),
  x: Coord,
  y: Coord,
});

export const PatchTextItemBody = TextStyleBody.extend({
  content: z.string().optional(),
});

export type BoardItem = z.infer<typeof BoardItemSchema>;
export type BoardImage = z.infer<typeof BoardImageSchema>;
export type BoardItemRow = z.infer<typeof BoardItemRowSchema>;
export type BoardItemRowImage = z.infer<typeof BoardItemRowImageSchema>;
export type PatchBoardItemInput = z.infer<typeof PatchBoardItemBody>;
export type PatchItemsManyInput = z.infer<typeof PatchItemsManyBody>;
export type DeleteItemsManyInput = z.infer<typeof DeleteItemsManyBody>;
export type AddItemInput = z.infer<typeof AddItemBody>;
export type AddTextItemInput = z.infer<typeof AddTextItemBody>;
export type PatchTextItemInput = z.infer<typeof PatchTextItemBody>;
