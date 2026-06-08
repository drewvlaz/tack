import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';

export const users = sqliteTable('users', {
  ...baseColumns(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
});
