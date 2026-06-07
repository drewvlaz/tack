import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  sourceUrl: text('source_url').notNull(),
  title: text('title'),
  brand: text('brand'),
  description: text('description'),
  price: real('price'),
  currency: text('currency').notNull().default('USD'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
