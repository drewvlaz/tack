import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';

export type ItemRow = typeof schema.items.$inferSelect;
export type ItemInsert = Omit<typeof schema.items.$inferInsert, 'ownerId'>;
export type ItemUpdate = Partial<
  Omit<typeof schema.items.$inferInsert, 'id' | 'ownerId' | 'createdAt'>
>;

function activeScope(scope: Scope): SQL | undefined {
  return and(
    eq(schema.items.ownerId, scope.userId),
    isNull(schema.items.deletedAt),
  );
}

function anyScope(scope: Scope): SQL {
  return eq(schema.items.ownerId, scope.userId);
}

export class ItemsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  async byId(id: string): Promise<ItemRow | undefined> {
    return this.db.query.items.findFirst({
      where: and(eq(schema.items.id, id), activeScope(this.scope)),
    });
  }

  async byIdOrThrow(id: string): Promise<ItemRow> {
    const row = await this.byId(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  async byIdIncludingTrashed(id: string): Promise<ItemRow | undefined> {
    return this.db.query.items.findFirst({
      where: and(eq(schema.items.id, id), anyScope(this.scope)),
    });
  }

  async byIdIncludingTrashedOrThrow(id: string): Promise<ItemRow> {
    const row = await this.byIdIncludingTrashed(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }
}

export class ItemsTxRepo extends ItemsReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  stageInsert(values: ItemInsert): void {
    this.tx.stage(
      this.tx.db.insert(schema.items).values({
        ...values,
        ownerId: this.scope.userId,
      }),
    );
  }

  // UPDATE any row owned by the caller (active or trashed). "Trashed-ness"
  // is a service-layer invariant — pair with `byIdOrThrow` at the boundary
  // if you need to reject updates against trashed rows.
  stageUpdate(id: string, set: ItemUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.items)
        .set(set)
        .where(and(eq(schema.items.id, id), anyScope(this.scope))),
    );
  }

  stageSoftDelete(id: string, deletedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.items)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(and(eq(schema.items.id, id), activeScope(this.scope))),
    );
  }

  stageRestore(id: string, updatedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.items)
        .set({ deletedAt: null, updatedAt })
        .where(
          and(
            eq(schema.items.id, id),
            eq(schema.items.ownerId, this.scope.userId),
            isNotNull(schema.items.deletedAt),
          ),
        ),
    );
  }

  // Hard delete: drops rows regardless of trash state. Used by `stagePurge`
  // to clean up orphaned items.
  stageHardDeleteMany(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    this.tx.stage(
      this.tx.db
        .delete(schema.items)
        .where(and(inArray(schema.items.id, ids), anyScope(this.scope))),
    );
  }
}
