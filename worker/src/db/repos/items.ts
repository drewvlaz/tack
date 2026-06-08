import { TRPCError } from '@trpc/server';
import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';

export type ItemRow = typeof schema.items.$inferSelect;
export type ItemInsert = Omit<typeof schema.items.$inferInsert, 'ownerId'>;
export type ItemUpdate = Partial<
  Omit<typeof schema.items.$inferInsert, 'id' | 'ownerId' | 'createdAt'>
>;

function scopeWhere(scope: Scope): SQL {
  return eq(schema.items.ownerId, scope.userId);
}

export class ItemsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  async byId(id: string): Promise<ItemRow | undefined> {
    return this.db.query.items.findFirst({
      where: and(eq(schema.items.id, id), scopeWhere(this.scope)),
    });
  }

  async byIdOrThrow(id: string): Promise<ItemRow> {
    const row = await this.byId(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  // byId with the soft-delete filter applied — used by reparseItem so it
  // doesn't refresh a trashed item.
  async byIdActiveOrThrow(id: string): Promise<ItemRow> {
    const row = await this.db.query.items.findFirst({
      where: and(
        eq(schema.items.id, id),
        scopeWhere(this.scope),
        isNull(schema.items.deletedAt),
      ),
    });
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

  stageUpdate(id: string, set: ItemUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.items)
        .set(set)
        .where(and(eq(schema.items.id, id), scopeWhere(this.scope))),
    );
  }

  stageDeleteMany(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    this.tx.stage(
      this.tx.db
        .delete(schema.items)
        .where(and(inArray(schema.items.id, ids), scopeWhere(this.scope))),
    );
  }
}
