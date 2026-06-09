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
import {
  accessibleActiveBoardIds,
  accessibleAnyBoardIds,
  accessibleBoardsWhere,
} from './scope';

export type PlacementRow = typeof schema.boardItems.$inferSelect;
export type PlacementInsert = typeof schema.boardItems.$inferInsert;
export type PlacementUpdate = Partial<
  Omit<typeof schema.boardItems.$inferInsert, 'id' | 'boardId' | 'createdAt'>
>;

// Placements (board_items) inherit access transitively through their parent
// board. With collab, access = owner OR active member; the predicate lives
// in `repos/scope.ts` so every repo agrees. Reads INNER JOIN boards and the
// scope predicate filters on boards.ownerId OR boards.id IN (members).
// Writes use the equivalent ids-subquery via `accessibleAnyBoardIds`.

// Default scope: active placement on an active board the caller can access.
function activeScope(db: Db, scope: Scope): SQL | undefined {
  return and(
    inArray(schema.boardItems.boardId, accessibleActiveBoardIds(db, scope)),
    isNull(schema.boardItems.deletedAt),
  );
}

// Any state. Used by trashed-access variants and by hard delete.
function anyScope(db: Db, scope: Scope): SQL {
  return inArray(schema.boardItems.boardId, accessibleAnyBoardIds(db, scope));
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

  // Active placement on an active board the caller can access.
  async byId(id: string): Promise<PlacementRow | undefined> {
    const rows = await this.db
      .select({ p: schema.boardItems })
      .from(schema.boardItems)
      .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
      .where(
        and(
          eq(schema.boardItems.id, id),
          accessibleBoardsWhere(this.db, this.scope),
          isNull(schema.boards.deletedAt),
          isNull(schema.boardItems.deletedAt),
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

  // Reach a placement regardless of trash state (its own or its board's).
  // Used by the restore / purge flows.
  async byIdIncludingTrashed(id: string): Promise<PlacementRow | undefined> {
    const rows = await this.db
      .select({ p: schema.boardItems })
      .from(schema.boardItems)
      .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
      .where(
        and(
          eq(schema.boardItems.id, id),
          accessibleBoardsWhere(this.db, this.scope),
        ),
      )
      .limit(1);
    return rows[0]?.p;
  }

  async byIdIncludingTrashedOrThrow(id: string): Promise<PlacementRow> {
    const row = await this.byIdIncludingTrashed(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  // Active placements on the (active) board. The boardId is NOT pre-verified
  // — the join + scope filter does it implicitly. Asking for a board you
  // can't access returns an empty array (which is what callers want for
  // list endpoints).
  async listForBoard(boardId: string): Promise<HydratedPlacement[]> {
    return this.hydrate(
      and(
        eq(schema.boardItems.boardId, boardId),
        accessibleBoardsWhere(this.db, this.scope),
        isNull(schema.boards.deletedAt),
        isNull(schema.boardItems.deletedAt),
        isNull(schema.items.deletedAt),
      ),
    );
  }

  // Trashed placements on the (active) board.
  async listTrashForBoard(boardId: string): Promise<HydratedPlacement[]> {
    return this.hydrate(
      and(
        eq(schema.boardItems.boardId, boardId),
        accessibleBoardsWhere(this.db, this.scope),
        isNull(schema.boards.deletedAt),
        isNotNull(schema.boardItems.deletedAt),
        isNull(schema.items.deletedAt),
      ),
    );
  }

  // (id, itemId, deletedAt) tuples for every placement on the board,
  // active or trashed. Used by deleteBoard before it stages a hard purge.
  async listIdsForBoardIncludingTrashed(
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
          accessibleBoardsWhere(this.db, this.scope),
        ),
      );
    return rows;
  }

  async listTrashIdsForBoard(
    boardId: string,
  ): Promise<Array<{ id: string; itemId: string }>> {
    const rows = await this.listIdsForBoardIncludingTrashed(boardId);
    return rows
      .filter((r) => r.deletedAt !== null)
      .map(({ id, itemId }) => ({ id, itemId }));
  }

  // All placements (any state) that reference the given item ids — INCLUDING
  // ones the caller can't access. Used by stagePurge to compute orphans: an
  // item is only truly orphan if NO placement anywhere references it, so we
  // have to look past the caller's scope. The returned tuples are internal
  // to the orphan calculation and never surfaced to the caller, so this
  // doesn't leak existence — it just keeps orphan accounting correct when a
  // shared item is referenced on a board the caller can't see (e.g. Alice
  // has item X on her private board AND a shared board with Bob; Bob purges
  // his side; the private placement must keep X alive).
  async findReferencingItemsIncludingTrashed(
    itemIds: string[],
  ): Promise<Array<{ id: string; itemId: string }>> {
    if (itemIds.length === 0) {
      return [];
    }
    return this.db
      .select({ id: schema.boardItems.id, itemId: schema.boardItems.itemId })
      .from(schema.boardItems)
      .where(inArray(schema.boardItems.itemId, itemIds));
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

    return rows.map(({ p, item }) => ({
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
  // earlier in the same flow).
  stageInsert(values: PlacementInsert): void {
    this.tx.stage(this.tx.db.insert(schema.boardItems).values(values));
  }

  // UPDATE any placement owned by the caller (active or trashed). "Trashed-
  // ness" is a service-layer invariant — pair with `byIdOrThrow` at the
  // boundary if you need to reject updates against trashed rows.
  stageUpdate(id: string, set: PlacementUpdate): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boardItems)
        .set(set)
        .where(
          and(eq(schema.boardItems.id, id), anyScope(this.tx.db, this.scope)),
        ),
    );
  }

  stageSoftDelete(id: string, deletedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boardItems)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            eq(schema.boardItems.id, id),
            activeScope(this.tx.db, this.scope),
          ),
        ),
    );
  }

  // Restore: scope via the any-state accessible-board subquery — the parent
  // might be trashed too (future feature), but restoring the placement is
  // fine; it'll only become reachable once the board is also restored.
  stageRestore(id: string, updatedAt: number): void {
    this.tx.stage(
      this.tx.db
        .update(schema.boardItems)
        .set({ deletedAt: null, updatedAt })
        .where(
          and(
            eq(schema.boardItems.id, id),
            inArray(
              schema.boardItems.boardId,
              accessibleAnyBoardIds(this.tx.db, this.scope),
            ),
            isNotNull(schema.boardItems.deletedAt),
          ),
        ),
    );
  }

  // Hard delete: drops rows regardless of trash state. Used by `stagePurge`.
  stageHardDeleteMany(ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    this.tx.stage(
      this.tx.db
        .delete(schema.boardItems)
        .where(
          and(
            inArray(schema.boardItems.id, ids),
            anyScope(this.tx.db, this.scope),
          ),
        ),
    );
  }
}
