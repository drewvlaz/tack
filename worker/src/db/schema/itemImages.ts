import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { items } from './items';

export const itemImages = sqliteTable('item_images', {
  ...baseColumns(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  sourceUrl: text('source_url'),
  displayOrder: integer('display_order').notNull().default(0),
});
