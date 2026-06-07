import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';

export const boards = sqliteTable('boards', {
  ...baseColumns(),
  name: text('name').notNull(),
  deletedAt: integer('deleted_at'),
});
