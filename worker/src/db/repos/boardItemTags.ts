import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';
import { accessibleAnyBoardIds } from './scope';

export type BoardItemTagRow = typeof schema.boardItemTags.$inferSelect;
export type BoardItemTagInsert = typeof schema.boardItemTags.$inferInsert;

// Tags inherit access transitively through the placement and its board
// (`accessibleAnyBoardIds`). Same shape as `boardItemImages`.
function accessibleScope(db: Db, scope: Scope): SQL {
  return inArray(
    schema.boardItemTags.boardItemId,
    db
      .select({ id: schema.boardItems.id })
      .from(schema.boardItems)
      .where(
        inArray(schema.boardItems.boardId, accessibleAnyBoardIds(db, scope)),
      ),
  );
}

export class BoardItemTagsReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  // Tags for a set of placements. Used to hydrate `listBoardItems`.
  async listForBoardItems(boardItemIds: string[]): Promise<BoardItemTagRow[]> {
    if (boardItemIds.length === 0) {
      return [];
    }
    return this.db.query.boardItemTags.findMany({
      where: and(
        inArray(schema.boardItemTags.boardItemId, boardItemIds),
        accessibleScope(this.db, this.scope),
      ),
    });
  }

  // Distinct tag names on a board with usage counts. Powers the sidebar /
  // autocomplete. `boardId` is constrained via the placement subquery — no
  // pre-verification needed; an inaccessible board yields zero rows.
  async listForBoard(
    boardId: string,
  ): Promise<Array<{ name: string; count: number }>> {
    const rows = await this.db
      .select({
        name: schema.boardItemTags.name,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(schema.boardItemTags)
      .innerJoin(
        schema.boardItems,
        eq(schema.boardItems.id, schema.boardItemTags.boardItemId),
      )
      .where(
        and(
          eq(schema.boardItems.boardId, boardId),
          inArray(
            schema.boardItems.boardId,
            accessibleAnyBoardIds(this.db, this.scope),
          ),
          // Active placements only — sidebar counts must match what's on canvas.
          isNull(schema.boardItems.deletedAt),
        ),
      )
      .groupBy(schema.boardItemTags.name);
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  }
}

export class BoardItemTagsTxRepo extends BoardItemTagsReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT trusts the caller — the placement(s) must already be permission-
  // verified at the service boundary. `onConflictDoNothing` makes re-tagging
  // idempotent (same name on same placement is a no-op).
  stageInsertMany(values: BoardItemTagInsert[]): void {
    if (values.length === 0) {
      return;
    }
    // D1 caps bound parameters at 100 per statement; this row has 3 columns.
    // Chunk so N rows × 3 cols stays ≤ 99.
    const ROWS_PER_STMT = 32;
    for (let i = 0; i < values.length; i += ROWS_PER_STMT) {
      this.tx.stage(
        this.tx.db
          .insert(schema.boardItemTags)
          .values(values.slice(i, i + ROWS_PER_STMT))
          .onConflictDoNothing(),
      );
    }
  }

  // DELETE specific (placement, name) pairs. Scope-guarded via the
  // accessible-board subquery so a forged boardItemId can't reach into
  // someone else's board.
  stageDeleteMany(boardItemIds: string[], names: string[]): void {
    if (boardItemIds.length === 0 || names.length === 0) {
      return;
    }
    this.tx.stage(
      this.tx.db
        .delete(schema.boardItemTags)
        .where(
          and(
            inArray(schema.boardItemTags.boardItemId, boardItemIds),
            inArray(schema.boardItemTags.name, names),
            accessibleScope(this.tx.db, this.scope),
          ),
        ),
    );
  }
}
