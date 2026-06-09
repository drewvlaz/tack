import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { boards } from './boards';
import { users } from './users';

// Non-owner members of a board. The owner stays denormalized on boards.ownerId
// — this table is purely additive, so scope predicates remain a clean
// `owner OR member-of` OR rather than a uniform members-lookup.
// `deletedAt` soft-removes membership; restoring a row (clear deletedAt)
// re-grants access without rewriting history.
export const boardMembers = sqliteTable(
  'board_members',
  {
    ...baseColumns(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Only 'editor' for now; viewer role comes later by widening this column.
    role: text('role').notNull().default('editor'),
    invitedBy: text('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    // One active membership per (board, user); a removed-and-reinvited member
    // re-uses the same row by clearing deletedAt.
    unique().on(t.boardId, t.userId),
    index('board_members_user_id_idx').on(t.userId),
    index('board_members_board_id_idx').on(t.boardId),
  ],
);
