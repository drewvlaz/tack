import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { boards } from './boards';
import { users } from './users';

export type ItemDetail = { label: string; value: string };

// The unit on a board. After folding `items` away in migration 0009, the
// placement IS the item — there's no separate "canonical product" record.
// Access follows board membership: editors can read, mutate, reparse, and
// delete any placement on a board they belong to, regardless of who added
// it. `addedBy` is purely informational ("added by Alice"), nullable so a
// user-delete doesn't take their contributed placements with them.
export const boardItems = sqliteTable(
  'board_items',
  {
    ...baseColumns(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),

    // Attribution only — not a security boundary. Set null on user delete
    // so the placement survives the contributor leaving.
    addedBy: text('added_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    // Where this thing came from. Drives reparse + the click-out link.
    sourceUrl: text('source_url').notNull(),

    // Parsed metadata. All nullable because parsers fail in different ways.
    title: text('title'),
    brand: text('brand'),
    description: text('description'),
    price: real('price'),
    currency: text('currency').notNull().default('USD'),
    details: text('details', { mode: 'json' }).$type<ItemDetail[]>(),

    // FK soft-pointer to board_item_images.id — not a real FK constraint
    // because the image and the placement reference each other (chicken-
    // and-egg on insert). The repo / service layer treats a missing target
    // as "no primary set" rather than a hard error.
    primaryImageId: text('primary_image_id'),

    // Placement geometry on the canvas.
    x: real('x').notNull().default(0),
    y: real('y').notNull().default(0),
    width: real('width').notNull().default(220),
    height: real('height').notNull().default(400),
    zIndex: integer('z_index').notNull().default(0),
  },
  (t) => [
    index('board_items_board_id_idx').on(t.boardId),
    index('board_items_added_by_idx').on(t.addedBy),
  ],
);
