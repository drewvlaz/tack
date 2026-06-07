import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';

export type ItemDetail = { label: string; value: string };

export const items = sqliteTable('items', {
  ...baseColumns(),
  sourceUrl: text('source_url').notNull(),
  title: text('title'),
  brand: text('brand'),
  description: text('description'),
  price: real('price'),
  currency: text('currency').notNull().default('USD'),
  details: text('details', { mode: 'json' }).$type<ItemDetail[]>(),
  primaryImageId: text('primary_image_id'),
});
