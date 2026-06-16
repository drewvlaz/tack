import type { Board } from './trpc';

// Mirror of the catalog defined in worker/src/db/schema/boardMembers.ts.
// The worker is the source of truth — these constants exist on the client
// so we can gate UI affordances without round-tripping a permission check.
// The wire format (the `role` string on each board) is what the server
// validates against, so client-side drift here is a UX issue, never an
// authorization hole.

export const P = {
  BoardView: 'board.view',
  BoardEdit: 'board.edit',
  BoardManage: 'board.manage',
} as const;
export type Permission = (typeof P)[keyof typeof P];

export type BoardRole = Board['role'];

const ROLE_PERMS: Record<BoardRole, ReadonlySet<Permission>> = {
  viewer: new Set<Permission>([P.BoardView]),
  editor: new Set<Permission>([P.BoardView, P.BoardEdit]),
  owner: new Set<Permission>([P.BoardView, P.BoardEdit, P.BoardManage]),
};

export function can(
  role: BoardRole | null | undefined,
  perm: Permission,
): boolean {
  return role ? ROLE_PERMS[role].has(perm) : false;
}
