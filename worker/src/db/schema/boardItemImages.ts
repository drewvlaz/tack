import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { boardItems } from './boardItems';

// One row per image attached to a placement. Cascades from the placement
// it belongs to — when a board_item goes away, its images go with it.
// `r2Key` follows the `items/{uploaderUserId}/{nanoid}` shape; uploader is
// captured at upload time and validated against the caller in addBoardItem.
export const boardItemImages = sqliteTable(
  'board_item_images',
  {
    ...baseColumns(),
    boardItemId: text('board_item_id')
      .notNull()
      .references(() => boardItems.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    sourceUrl: text('source_url'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => [index('board_item_images_board_item_id_idx').on(t.boardItemId)],
);
