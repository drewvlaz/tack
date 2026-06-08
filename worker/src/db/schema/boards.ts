import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { users } from './users';

export const boards = sqliteTable(
  'boards',
  {
    ...baseColumns(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [index('boards_owner_id_idx').on(t.ownerId)],
);
