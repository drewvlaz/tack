import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';

export type BoardRow = typeof schema.boards.$inferSelect;
export type BoardInsert = Omit<typeof schema.boards.$inferInsert, 'ownerId'>;
export type BoardUpdate = Partial<
  Omit<typeof schema.boards.$inferInsert, 'id' | 'ownerId' | 'createdAt'>
>;

// Scope predicate. Centralized so every read/write uses the exact same filter.
function scopeWhere(scope: Scope): SQL {
  return eq(schema.boards.ownerId, scope.userId);
}

export class BoardsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  async byId(id: string): Promise<BoardRow | undefined> {
    return this.db.query.boards.findFirst({
      where: and(eq(schema.boards.id, id), scopeWhere(this.scope)),
    });
  }

  // Throws NOT_FOUND (never FORBIDDEN — don't leak existence of other users'
  // rows). Replaces the old assertBoardOwned helpers in services.
  async byIdOrThrow(id: string): Promise<BoardRow> {
    const row = await this.byId(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  async listActive(): Promise<BoardRow[]> {
    return this.db.query.boards.findMany({
      where: and(scopeWhere(this.scope), isNull(schema.boards.deletedAt)),
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

  // UPDATE always ANDs the scope filter — a forged id targeting another user's
  // row matches zero rows and the UPDATE is a no-op.
  stageUpdate(id: string, set: BoardUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boards)
        .set(set)
        .where(and(eq(schema.boards.id, id), scopeWhere(this.scope))),
    );
  }

  stageDelete(id: string): void {
    this.tx.stage(
      this.tx.db
        .delete(schema.boards)
        .where(and(eq(schema.boards.id, id), scopeWhere(this.scope))),
    );
  }
}
