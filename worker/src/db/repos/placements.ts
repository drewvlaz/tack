import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';
import { accessibleActiveBoardIds, accessibleAnyBoardIds } from './scope';

export type PlacementRow = typeof schema.boardItems.$inferSelect;
export type PlacementInsert = typeof schema.boardItems.$inferInsert;
export type PlacementUpdate = Partial<
  Omit<
    typeof schema.boardItems.$inferInsert,
    'id' | 'boardId' | 'createdAt' | 'addedBy'
  >
>;

// After the fold (migration 0009), placements ARE the things on boards.
// They carry their own metadata + image set. Access is transitive through
// the parent board: owner OR member ⇒ read AND write authority on every
// placement of the board. No uploader-only axis.

// Default scope: active placement on an active accessible board.
function activeScope(db: Db, scope: Scope): SQL | undefined {
  return and(
    inArray(schema.boardItems.boardId, accessibleActiveBoardIds(db, scope)),
    isNull(schema.boardItems.deletedAt),
  );
}

// Any state. Used by trashed-access variants and hard delete.
function anyScope(db: Db, scope: Scope): SQL {
  return inArray(schema.boardItems.boardId, accessibleAnyBoardIds(db, scope));
}

type BoardItemImageRow = typeof schema.boardItemImages.$inferSelect;

// Joined shape returned by `listForBoard` / `listTrashForBoard` — placement
// plus its image rows. Services map this to the wire-facing `BoardItemRow`.
export type HydratedPlacement = {
  placement: PlacementRow;
  images: BoardItemImageRow[];
};

export class PlacementsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  // Active placement on an active accessible board.
  async byId(id: string): Promise<PlacementRow | undefined> {
    return this.db.query.boardItems.findFirst({
      where: and(
        eq(schema.boardItems.id, id),
        activeScope(this.db, this.scope),
      ),
    });
  }

  async byIdOrThrow(id: string): Promise<PlacementRow> {
    const row = await this.byId(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  async byIdIncludingTrashed(id: string): Promise<PlacementRow | undefined> {
    return this.db.query.boardItems.findFirst({
      where: and(eq(schema.boardItems.id, id), anyScope(this.db, this.scope)),
    });
  }

  async byIdIncludingTrashedOrThrow(id: string): Promise<PlacementRow> {
    const row = await this.byIdIncludingTrashed(id);
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return row;
  }

  // Active placements on the (active) accessible board, with their images
  // hydrated. boardId is NOT pre-verified — scope predicate handles it.
  async listForBoard(boardId: string): Promise<HydratedPlacement[]> {
    const placements = await this.db.query.boardItems.findMany({
      where: and(
        eq(schema.boardItems.boardId, boardId),
        inArray(
          schema.boardItems.boardId,
          accessibleActiveBoardIds(this.db, this.scope),
        ),
        isNull(schema.boardItems.deletedAt),
      ),
      orderBy: asc(schema.boardItems.createdAt),
    });
    return this.hydrate(placements);
  }

  // Trashed placements on the (active) accessible board.
  async listTrashForBoard(boardId: string): Promise<HydratedPlacement[]> {
    const placements = await this.db.query.boardItems.findMany({
      where: and(
        eq(schema.boardItems.boardId, boardId),
        inArray(
          schema.boardItems.boardId,
          accessibleActiveBoardIds(this.db, this.scope),
        ),
        isNotNull(schema.boardItems.deletedAt),
      ),
      orderBy: asc(schema.boardItems.createdAt),
    });
    return this.hydrate(placements);
  }

  // (id, deletedAt) for every placement on the board, active or trashed.
  // Used by deleteBoard before it stages a hard purge.
  async listIdsForBoardIncludingTrashed(
    boardId: string,
  ): Promise<Array<{ id: string; deletedAt: number | null }>> {
    return this.db
      .select({
        id: schema.boardItems.id,
        deletedAt: schema.boardItems.deletedAt,
      })
      .from(schema.boardItems)
      .where(
        and(
          eq(schema.boardItems.boardId, boardId),
          inArray(
            schema.boardItems.boardId,
            accessibleAnyBoardIds(this.db, this.scope),
          ),
        ),
      );
  }

  async listTrashIdsForBoard(boardId: string): Promise<string[]> {
    const rows = await this.listIdsForBoardIncludingTrashed(boardId);
    return rows.filter((r) => r.deletedAt !== null).map((r) => r.id);
  }

  // Highest zIndex among active placements on the board, or null if empty.
  // Used by addBoardItem to drop new cards on top of the existing stack.
  async maxZIndexForBoard(boardId: string): Promise<number | null> {
    const rows = await this.db
      .select({ max: max(schema.boardItems.zIndex) })
      .from(schema.boardItems)
      .where(
        and(
          eq(schema.boardItems.boardId, boardId),
          inArray(
            schema.boardItems.boardId,
            accessibleActiveBoardIds(this.db, this.scope),
          ),
          isNull(schema.boardItems.deletedAt),
        ),
      );
    return rows[0]?.max ?? null;
  }

  // Second-pass image hydration. Drizzle's relational query API doesn't
  // filter on joined columns the way we need, so we list placements first
  // then fetch their images in a single follow-up query.
  private async hydrate(
    placements: PlacementRow[],
  ): Promise<HydratedPlacement[]> {
    if (placements.length === 0) {
      return [];
    }
    const ids = placements.map((p) => p.id);
    const images = await this.db.query.boardItemImages.findMany({
      where: and(
        inArray(schema.boardItemImages.boardItemId, ids),
        isNull(schema.boardItemImages.deletedAt),
      ),
      orderBy: asc(schema.boardItemImages.displayOrder),
    });
    const byPlacement = new Map<string, BoardItemImageRow[]>();
    for (const img of images) {
      const list = byPlacement.get(img.boardItemId);
      if (list) {
        list.push(img);
      } else {
        byPlacement.set(img.boardItemId, [img]);
      }
    }
    return placements.map((placement) => ({
      placement,
      images: byPlacement.get(placement.id) ?? [],
    }));
  }
}

export class PlacementsTxRepo extends PlacementsReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT trusts the caller. The boardId must already be access-verified
  // (e.g. via `boards.requireEditor(boardId)` at the service boundary).
  stageInsert(values: PlacementInsert): void {
    this.tx.stage(this.tx.db.insert(schema.boardItems).values(values));
  }

  // UPDATE any placement the caller can access (active or trashed).
  // Trashed-ness is a service-layer invariant — pair with `byIdOrThrow`
  // when you need to reject updates on trashed rows.
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

  // Restore: scope via accessible-any so we can reach a trashed placement
  // on an active (accessible) board.
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

  // Hard delete: drops rows regardless of trash state. Used by stagePurge
  // and by deleteBoard. board_item_images cascades.
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
