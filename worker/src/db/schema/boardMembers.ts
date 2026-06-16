import { index, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { baseColumns } from './base';
import { boards } from './boards';
import { users } from './users';

// Non-owner members of a board. The owner stays denormalized on boards.ownerId
// — this table is purely additive, so scope predicates remain a clean
// `owner OR member-of` OR rather than a uniform members-lookup.
// `deletedAt` soft-removes membership; restoring a row (clear deletedAt)
// re-grants access without rewriting history.
//
// `role` is one of BOARD_ROLES below ('editor' | 'viewer' — owner is implicit
// via boards.ownerId and never stored here). The column is TEXT without a
// CHECK constraint; runtime safety comes from Zod at the router boundary +
// the Exclude<BoardRole, 'owner'> service-signature ban.
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

// ---------- permission catalog ----------
//
// Permissions are the atomic unit of board access. Every call site that
// gates behavior expresses what it needs in permission terms; the role on
// a (user, board) pair resolves to a permission set via ROLE_PERMISSIONS.
// New roles are just new compositions; new actions are new permissions.

export const PERMISSIONS = [
  'board.view',
  'board.edit',
  'board.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Ergonomic constant for call sites — `P.BoardEdit` reads better than the
// stringly-typed `'board.edit'` everywhere it's checked.
export const P = {
  BoardView: 'board.view',
  BoardEdit: 'board.edit',
  BoardManage: 'board.manage',
} as const satisfies Record<string, Permission>;

export const BOARD_ROLES = ['owner', 'editor', 'viewer'] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

const ROLE_PERMISSIONS: Record<BoardRole, ReadonlySet<Permission>> = {
  viewer: new Set<Permission>([P.BoardView]),
  editor: new Set<Permission>([P.BoardView, P.BoardEdit]),
  owner: new Set<Permission>([P.BoardView, P.BoardEdit, P.BoardManage]),
};

export function roleHas(role: BoardRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(perm);
}
