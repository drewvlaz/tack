import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { boardItems } from './boardItems';

// A tag is a string. No tag entity — a tag exists iff a row references its
// name. Composite PK enforces uniqueness per placement; no soft delete (a
// tag has no identity to preserve). Access flows transitively through the
// placement's board (see repos/boardItemTags.ts).
export const boardItemTags = sqliteTable(
  'board_item_tags',
  {
    boardItemId: text('board_item_id')
      .notNull()
      .references(() => boardItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.boardItemId, t.name] }),
    index('board_item_tags_name_idx').on(t.name),
  ],
);
