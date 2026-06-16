import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import {
  BOARD_ROLES,
  roleHas,
  type BoardRole,
  type Permission,
} from '../schema';
import type { Scope, Tx } from '../tx';
import { accessibleBoardsWhere } from './scope';

export type BoardRow = typeof schema.boards.$inferSelect;
export type BoardWithRole = BoardRow & { role: BoardRole };
export type BoardInsert = Omit<typeof schema.boards.$inferInsert, 'ownerId'>;
export type BoardUpdate = Partial<
  Omit<typeof schema.boards.$inferInsert, 'id' | 'ownerId' | 'createdAt'>
>;

// Read scope: caller is owner OR active member, board not trashed. Reads
// expose shared boards; writes against `boards` rows remain owner-only and
// build their predicates directly (`ownerOnlyActive` / `ownerOnlyAny`).
function activeScope(db: Db, scope: Scope): SQL | undefined {
  return and(accessibleBoardsWhere(db, scope), isNull(schema.boards.deletedAt));
}

// Read scope without the trash filter — used for restore/purge reach-in.
function anyScope(db: Db, scope: Scope): SQL {
  return accessibleBoardsWhere(db, scope);
}

// Write scope: owner-only. Editors can mutate placements on the board, but
// they don't rename, trash, restore, or purge the board itself.
function ownerOnlyActive(scope: Scope): SQL | undefined {
  return and(
    eq(schema.boards.ownerId, scope.userId),
    isNull(schema.boards.deletedAt),
  );
}

function ownerOnlyAny(scope: Scope): SQL {
  return eq(schema.boards.ownerId, scope.userId);
}

export class BoardsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  async byId(id: string): Promise<BoardRow | undefined> {
    return this.db.query.boards.findFirst({
      where: and(eq(schema.boards.id, id), activeScope(this.db, this.scope)),
    });
  }

  // Throws NOT_FOUND (never FORBIDDEN — don't leak existence of other users'
  // rows). Also 404s on a trashed row; use `byIdIncludingTrashedOrThrow` if
  // you need to reach into the trash (restore / purge).
  async byIdOrThrow(id: string): Promise<BoardRow> {
    const row = await this.byId(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  async byIdIncludingTrashed(id: string): Promise<BoardRow | undefined> {
    return this.db.query.boards.findFirst({
      where: and(eq(schema.boards.id, id), anyScope(this.db, this.scope)),
    });
  }

  async byIdIncludingTrashedOrThrow(id: string): Promise<BoardRow> {
    const row = await this.byIdIncludingTrashed(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  async list(): Promise<BoardRow[]> {
    return this.db.query.boards.findMany({
      where: activeScope(this.db, this.scope),
      orderBy: asc(schema.boards.createdAt),
    });
  }

  // Same scope as `list`, but each row carries the caller's role on that
  // board (resolved via the same LEFT JOIN pattern as `roleFor`, in one
  // query). Owner wins on ownerId match; otherwise the membership row's
  // role. Used by services that surface role to the client without
  // re-querying per row.
  async listWithRole(): Promise<BoardWithRole[]> {
    const rows = await this.db
      .select({
        board: schema.boards,
        memberRole: schema.boardMembers.role,
      })
      .from(schema.boards)
      .leftJoin(
        schema.boardMembers,
        and(
          eq(schema.boardMembers.boardId, schema.boards.id),
          eq(schema.boardMembers.userId, this.scope.userId),
          isNull(schema.boardMembers.deletedAt),
        ),
      )
      .where(activeScope(this.db, this.scope))
      .orderBy(asc(schema.boards.createdAt));
    return rows.map(({ board, memberRole }) => ({
      ...board,
      role: resolveRole(board.ownerId, this.scope.userId, memberRole),
    }));
  }

  async listTrashed(): Promise<BoardRow[]> {
    // Trash for the BOARDS rail is owner-only: a member viewing the trash
    // of a board they're invited to would see entries they can't restore
    // (owner-only op), so the rail only shows what the caller can act on.
    return this.db.query.boards.findMany({
      where: and(
        eq(schema.boards.ownerId, this.scope.userId),
        isNotNull(schema.boards.deletedAt),
      ),
      orderBy: asc(schema.boards.createdAt),
    });
  }

  // Resolves the caller's role on the given active board. Returns 'owner',
  // 'editor', 'viewer', or null (no access).
  //
  // For authorization, prefer `require(boardId, P.X)` — it's the single check
  // that asks "can I do X?" without exposing the role enum to the caller.
  // Reach for `roleFor` only when the caller genuinely needs to BRANCH on
  // role (e.g. surfacing the caller's role to the client, or computing
  // promote-only deltas between two role grants).
  async roleFor(boardId: string): Promise<BoardRole | null> {
    // UNIQUE(board_id, user_id) on board_members guarantees at most one
    // joined row, so a single LEFT JOIN resolves the role in one query.
    const [row] = await this.db
      .select({
        ownerId: schema.boards.ownerId,
        memberRole: schema.boardMembers.role,
      })
      .from(schema.boards)
      .leftJoin(
        schema.boardMembers,
        and(
          eq(schema.boardMembers.boardId, schema.boards.id),
          eq(schema.boardMembers.userId, this.scope.userId),
          isNull(schema.boardMembers.deletedAt),
        ),
      )
      .where(
        and(eq(schema.boards.id, boardId), isNull(schema.boards.deletedAt)),
      )
      .limit(1);
    if (!row) {
      return null;
    }
    if (row.ownerId === this.scope.userId) {
      return 'owner';
    }
    if (row.memberRole === null) {
      return null;
    }
    return parseStoredRole(row.memberRole);
  }

  // The resource-managed permission check. Routers/services declare what
  // they need; the board resolves the caller's role and the permission
  // catalog answers. NOT_FOUND for non-members (existence-leak safety —
  // non-members shouldn't be able to probe whether a board id is real);
  // FORBIDDEN for insufficient permission (they already know the board
  // exists, so the explicit code is more useful than hiding it).
  // Returns the resolved role for callers that need to branch.
  async require(boardId: string, perm: Permission): Promise<BoardRole> {
    const role = await this.roleFor(boardId);
    if (role === null) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    if (!roleHas(role, perm)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return role;
  }
}

// A stored membership.role is one of the BOARD_ROLES strings — but the
// DB is just TEXT, so guard at the read boundary. An unknown value would
// indicate either a buggy write or a manual DB edit; treat as no-access
// rather than crashing the request.
function parseStoredRole(stored: string): BoardRole | null {
  return (BOARD_ROLES as readonly string[]).includes(stored)
    ? (stored as BoardRole)
    : null;
}

function resolveRole(
  ownerId: string,
  userId: string,
  memberRole: string | null,
): BoardRole {
  if (ownerId === userId) {
    return 'owner';
  }
  // listWithRole's scope predicate guarantees the caller has access — they
  // either own the board or have an active member row. So a null memberRole
  // here is unreachable, but defensively fall back to 'viewer' (the most
  // restrictive) rather than crashing.
  return memberRole === null
    ? 'viewer'
    : (parseStoredRole(memberRole) ?? 'viewer');
}

export class BoardsTxRepo extends BoardsReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT auto-stamps ownerId from the Tx's scope. Members never insert
  // boards on behalf of others.
  stageInsert(values: BoardInsert): void {
    this.tx.stage(
      this.tx.db.insert(schema.boards).values({
        ...values,
        ownerId: this.scope.userId,
      }),
    );
  }

  // UPDATE owner-only. Renaming a board is the only consumer; even editors
  // don't get to rename. Pair with `require(id, P.BoardManage)` at the
  // service boundary for an explicit 403 — a forged id targeting another
  // user's row would otherwise match zero and silently no-op.
  stageUpdate(id: string, set: BoardUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boards)
        .set(set)
        .where(and(eq(schema.boards.id, id), ownerOnlyAny(this.scope))),
    );
  }

  // Soft delete: stamp deletedAt + updatedAt. Owner-only.
  stageSoftDelete(id: string, deletedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boards)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(schema.boards.id, id), ownerOnlyActive(this.scope))),
    );
  }

  // Restore: clear deletedAt. Owner-only.
  stageRestore(id: string, updatedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boards)
        .set({ deletedAt: null, updatedAt })
        .where(
          and(
            eq(schema.boards.id, id),
            eq(schema.boards.ownerId, this.scope.userId),
            isNotNull(schema.boards.deletedAt),
          ),
        ),
    );
  }

  // Hard delete: owner-only. Used by purge inside deleteBoard.
  stageHardDelete(id: string): void {
    this.tx.stage(
      this.tx.db
        .delete(schema.boards)
        .where(and(eq(schema.boards.id, id), ownerOnlyAny(this.scope))),
    );
  }
}
