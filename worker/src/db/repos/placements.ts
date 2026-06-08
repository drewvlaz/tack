import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';

export type PlacementRow = typeof schema.boardItems.$inferSelect;
export type PlacementInsert = typeof schema.boardItems.$inferInsert;
export type PlacementUpdate = Partial<
  Omit<typeof schema.boardItems.$inferInsert, 'id' | 'boardId' | 'createdAt'>
>;

// Placements (board_items) inherit ownership transitively through their
// parent board. There's no ownerId column to filter on directly, so every
// read joins boards.ownerId and every write uses a subquery against boards.

// Scope subquery: "the set of board ids owned by the caller". Used in WHERE
// clauses on UPDATE/DELETE since SQLite/Drizzle UPDATE doesn't support JOIN.
function ownedBoardIds(db: Db, scope: Scope) {
  return db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(eq(schema.boards.ownerId, scope.userId));
}

// Scope predicate for a transitive WHERE on board_items.
function scopeWhere(db: Db, scope: Scope): SQL {
  return inArray(schema.boardItems.boardId, ownedBoardIds(db, scope));
}

// Raw rows joined by listForBoard / listTrashForBoard. The repo returns
// scoped + joined data; services do the domain mapping (BoardItemRow,
// StoredImage construction, primary-image sort).
export type HydratedPlacement = {
  placement: PlacementRow;
  item: typeof schema.items.$inferSelect;
  images: Array<typeof schema.itemImages.$inferSelect>;
};

export class PlacementsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  // Returns the placement row only, scoped via the boards join.
  async byId(id: string): Promise<PlacementRow | undefined> {
    const rows = await this.db
      .select({ p: schema.boardItems })
      .from(schema.boardItems)
      .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
      .where(
        and(
          eq(schema.boardItems.id, id),
          eq(schema.boards.ownerId, this.scope.userId),
        ),
      )
      .limit(1);
    return rows[0]?.p;
  }

  async byIdOrThrow(id: string): Promise<PlacementRow> {
    const row = await this.byId(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  // Listing rows for a board. The boardId argument is NOT pre-verified — the
  // join + scope filter does it implicitly. Asking for a board you don't own
  // returns an empty array (which is what callers want for list endpoints).
  async listForBoard(boardId: string): Promise<HydratedPlacement[]> {
    return this.hydrate(
      and(
        eq(schema.boardItems.boardId, boardId),
        eq(schema.boards.ownerId, this.scope.userId),
        isNull(schema.boardItems.deletedAt),
      ),
    );
  }

  async listTrashForBoard(boardId: string): Promise<HydratedPlacement[]> {
    return this.hydrate(
      and(
        eq(schema.boardItems.boardId, boardId),
        eq(schema.boards.ownerId, this.scope.userId),
        isNotNull(schema.boardItems.deletedAt),
      ),
    );
  }

  // Returns (id, itemId, deletedAt) tuples for every placement on the board,
  // active or trashed. Used by deleteBoard before it stages a hard purge.
  async listIdsForBoard(
    boardId: string,
  ): Promise<Array<{ id: string; itemId: string; deletedAt: number | null }>> {
    const rows = await this.db
      .select({
        id: schema.boardItems.id,
        itemId: schema.boardItems.itemId,
        deletedAt: schema.boardItems.deletedAt,
      })
      .from(schema.boardItems)
      .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
      .where(
        and(
          eq(schema.boardItems.boardId, boardId),
          eq(schema.boards.ownerId, this.scope.userId),
        ),
      );
    return rows;
  }

  async listTrashIdsForBoard(
    boardId: string,
  ): Promise<Array<{ id: string; itemId: string }>> {
    const rows = await this.listIdsForBoard(boardId);
    return rows
      .filter((r) => r.deletedAt !== null)
      .map(({ id, itemId }) => ({ id, itemId }));
  }

  // Given a set of item ids, find ALL of the caller's placements that
  // reference them. Used by stagePurge to compute which items still have
  // OTHER placements (vs. becoming orphans).
  async findReferencingItems(
    itemIds: string[],
  ): Promise<Array<{ id: string; itemId: string }>> {
    if (itemIds.length === 0) {
      return [];
    }
    return this.db
      .select({ id: schema.boardItems.id, itemId: schema.boardItems.itemId })
      .from(schema.boardItems)
      .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
      .where(
        and(
          inArray(schema.boardItems.itemId, itemIds),
          eq(schema.boards.ownerId, this.scope.userId),
        ),
      );
  }

  // INNER JOIN over board_items + boards + items, then a second query for
  // images. Drizzle's relational query API can't filter on joined columns,
  // so we drop to the core builder for the join.
  private async hydrate(where: SQL | undefined): Promise<HydratedPlacement[]> {
    const rows = await this.db
      .select({ p: schema.boardItems, item: schema.items })
      .from(schema.boardItems)
      .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
      .innerJoin(schema.items, eq(schema.items.id, schema.boardItems.itemId))
      .where(where);

    if (rows.length === 0) {
      return [];
    }

    const itemIds = [...new Set(rows.map((r) => r.item.id))];
    const images = await this.db.query.itemImages.findMany({
      where: and(
        inArray(schema.itemImages.itemId, itemIds),
        isNull(schema.itemImages.deletedAt),
      ),
      orderBy: asc(schema.itemImages.displayOrder),
    });
    const imagesByItem = new Map<string, typeof images>();
    for (const img of images) {
      const list = imagesByItem.get(img.itemId);
      if (list) {
        list.push(img);
      } else {
        imagesByItem.set(img.itemId, [img]);
      }
    }

    return rows
      .filter(({ item }) => item.deletedAt === null)
      .map(({ p, item }) => ({
        placement: p,
        item,
        images: imagesByItem.get(item.id) ?? [],
      }));
  }
}

export class PlacementsTxRepo extends PlacementsReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT trusts the caller: the boardId must already be ownership-verified
  // (either in the same Tx via boards.byIdOrThrow, or by chained insertion
  // earlier in the same flow). Same pattern as the previous direct drizzle
  // inserts in addBoardItem.
  stageInsert(values: PlacementInsert): void {
    this.tx.stage(this.tx.db.insert(schema.boardItems).values(values));
  }

  // UPDATE / DELETE always scope via the boards subquery — a forged id
  // targeting another user's placement matches zero rows.
  stageUpdate(id: string, set: PlacementUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boardItems)
        .set(set)
        .where(
          and(eq(schema.boardItems.id, id), scopeWhere(this.tx.db, this.scope)),
        ),
    );
  }

  stageDeleteMany(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    this.tx.stage(
      this.tx.db
        .delete(schema.boardItems)
        .where(
          and(
            inArray(schema.boardItems.id, ids),
            scopeWhere(this.tx.db, this.scope),
          ),
        ),
    );
  }
}
