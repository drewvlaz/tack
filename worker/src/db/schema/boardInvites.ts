import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { boards } from './boards';
import { users } from './users';

// One-shot tokens that grant editor membership on redemption. The capability
// is 32 random bytes, base64url, generated server-side and surfaced once via
// the URL shown to the inviter. The DB only stores `tokenHash` — SHA-256 hex
// of the raw token — so a DB leak doesn't expose redeemable links. The raw
// token is high-entropy so a single SHA-256 round is enough; no salt.
//
// Redemption is a one-time event: `redeemedAt` is set, `redeemedBy` records
// who consumed it. A second redeem attempt is rejected. Tokens also expire
// after 7 days regardless.
export const boardInvites = sqliteTable(
  'board_invites',
  {
    ...baseColumns(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    redeemedAt: integer('redeemed_at'),
    redeemedBy: text('redeemed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('board_invites_board_id_idx').on(t.boardId)],
);
