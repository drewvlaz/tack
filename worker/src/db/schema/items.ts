import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { users } from './users';

export type ItemDetail = { label: string; value: string };

export const items = sqliteTable(
  'items',
  {
    ...baseColumns(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    title: text('title'),
    brand: text('brand'),
    description: text('description'),
    price: real('price'),
    currency: text('currency').notNull().default('USD'),
    details: text('details', { mode: 'json' }).$type<ItemDetail[]>(),
    primaryImageId: text('primary_image_id'),
  },
  (t) => [index('items_owner_id_idx').on(t.ownerId)],
);
