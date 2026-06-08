import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { users } from './users';

// `id` is the opaque token sent in the `tack_sess` cookie. It IS the
// credential — stored as-is (32 random bytes, base64url) so lookup is a
// single primary-key SELECT.
export const sessions = sqliteTable(
  'sessions',
  {
    ...baseColumns(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);
