import { integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Common columns every domain table inherits — primary key + timestamps.
 *
 * Use as a spread inside `sqliteTable(...)`:
 *
 *   sqliteTable('foo', {
 *     ...baseColumns(),
 *     name: text('name').notNull(),
 *   })
 *
 * Returns a *fresh* set of column builders on every call so multiple tables
 * don't share a single (stateful) builder instance.
 *
 * Timestamps are unix seconds (integer). Set both on insert; bump `updatedAt`
 * on any meaningful row change.
 */
export function baseColumns() {
  return {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  };
}
