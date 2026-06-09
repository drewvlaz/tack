import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';

export type BoardRow = typeof schema.boards.$inferSelect;
export type BoardInsert = Omit<typeof schema.boards.$inferInsert, 'ownerId'>;
export type BoardUpdate = Partial<
  Omit<typeof schema.boards.$inferInsert, 'id' | 'ownerId' | 'createdAt'>
>;

// Default scope: caller-owned AND NOT trashed. Every read/update uses this
// unless an `IncludingTrashed` variant is called explicitly. Soft-delete
// filtering at the repo means a service can't accidentally see or write
// trashed rows through the default path.
function activeScope(scope: Scope): SQL | undefined {
  return and(
    eq(schema.boards.ownerId, scope.userId),
    isNull(schema.boards.deletedAt),
  );
}

// Caller-owned, any state (active OR trashed). Used by the trashed-access
// variants and by hard delete (purge), which operates regardless of state.
function anyScope(scope: Scope): SQL {
  return eq(schema.boards.ownerId, scope.userId);
}

export class BoardsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  async byId(id: string): Promise<BoardRow | undefined> {
    return this.db.query.boards.findFirst({
      where: and(eq(schema.boards.id, id), activeScope(this.scope)),
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
      where: and(eq(schema.boards.id, id), anyScope(this.scope)),
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
      where: activeScope(this.scope),
      orderBy: asc(schema.boards.createdAt),
    });
  }

  async listTrashed(): Promise<BoardRow[]> {
    return this.db.query.boards.findMany({
      where: and(
        eq(schema.boards.ownerId, this.scope.userId),
        isNotNull(schema.boards.deletedAt),
      ),
      orderBy: asc(schema.boards.createdAt),
    });
  }
}

export class BoardsTxRepo extends BoardsReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT auto-stamps ownerId from the Tx's scope. Callers can't construct a
  // board owned by anyone other than the caller.
  stageInsert(values: BoardInsert): void {
    this.tx.stage(
      this.tx.db.insert(schema.boards).values({
        ...values,
        ownerId: this.scope.userId,
      }),
    );
  }

  // UPDATE any row owned by the caller (active or trashed). "Trashed-ness"
  // is a service-layer invariant — pair with `byIdOrThrow` (active-only) at
  // the boundary if you need to reject updates against trashed rows. Forging
  // an id targeting another user's row still matches zero rows → no-op.
  stageUpdate(id: string, set: BoardUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boards)
        .set(set)
        .where(and(eq(schema.boards.id, id), anyScope(this.scope))),
    );
  }

  // Soft delete: stamp deletedAt + updatedAt. Targets active rows only — a
  // double-trash is a no-op.
  stageSoftDelete(id: string, deletedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boards)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(schema.boards.id, id), activeScope(this.scope))),
    );
  }

  // Restore: clear deletedAt. Targets trashed rows only.
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

  // Hard delete: drops the row regardless of trash state. Used by the purge
  // path in `deleteBoard`. For user-facing "trash this board", use
  // `stageSoftDelete` instead.
  stageHardDelete(id: string): void {
    this.tx.stage(
      this.tx.db
        .delete(schema.boards)
        .where(and(eq(schema.boards.id, id), anyScope(this.scope))),
    );
  }
}
