import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';
import { accessibleAnyBoardIds } from './scope';

export type BoardItemImageRow = typeof schema.boardItemImages.$inferSelect;
export type BoardItemImageInsert = typeof schema.boardItemImages.$inferInsert;

// Images inherit access transitively through their parent placement, which
// itself inherits from the board (`accessibleAnyBoardIds`). No items axis,
// no uploader axis — if you can see the board, you can see the image rows;
// if you can mutate the board, you can mutate the images.

function accessibleScope(db: Db, scope: Scope): SQL {
  // image → placement → board access. Subquery yields board ids the
  // caller can access; we constrain image.board_item.board_id to that.
  return inArray(
    schema.boardItemImages.boardItemId,
    db
      .select({ id: schema.boardItems.id })
      .from(schema.boardItems)
      .where(
        inArray(schema.boardItems.boardId, accessibleAnyBoardIds(db, scope)),
      ),
  );
}

export class BoardItemImagesReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  // Active images on a placement, ordered by displayOrder. The boardItem
  // is NOT pre-verified — the scope predicate does it implicitly. Asking
  // for a placement you can't access returns empty.
  async listForBoardItem(boardItemId: string): Promise<BoardItemImageRow[]> {
    return this.db.query.boardItemImages.findMany({
      where: and(
        eq(schema.boardItemImages.boardItemId, boardItemId),
        isNull(schema.boardItemImages.deletedAt),
        accessibleScope(this.db, this.scope),
      ),
      orderBy: asc(schema.boardItemImages.displayOrder),
    });
  }

  // Find one image by id when it belongs to the named placement and the
  // caller has access. Used by setPrimaryImage.
  async findByBoardItemAndId(
    boardItemId: string,
    imageId: string,
  ): Promise<BoardItemImageRow | undefined> {
    return this.db.query.boardItemImages.findFirst({
      where: and(
        eq(schema.boardItemImages.id, imageId),
        eq(schema.boardItemImages.boardItemId, boardItemId),
        isNull(schema.boardItemImages.deletedAt),
        accessibleScope(this.db, this.scope),
      ),
    });
  }

  // All images (active or trashed) for a set of placements. Used by purge
  // flows to schedule R2 cleanup. Scope filter is intentionally skipped —
  // the caller will already have validated access on the placements;
  // narrowing here would just hide blobs the caller is about to delete.
  async findForBoardItemsIncludingTrashed(
    boardItemIds: string[],
  ): Promise<BoardItemImageRow[]> {
    if (boardItemIds.length === 0) {
      return [];
    }
    return this.db.query.boardItemImages.findMany({
      where: inArray(schema.boardItemImages.boardItemId, boardItemIds),
    });
  }
}

export class BoardItemImagesTxRepo extends BoardItemImagesReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT trusts the caller. The placement either was just stage-inserted
  // in the same Tx (D1 hasn't committed yet, so an access lookup would
  // miss it), or was fetched earlier with access verification.
  stageInsertMany(values: BoardItemImageInsert[]): void {
    if (values.length === 0) {
      return;
    }
    this.tx.stage(this.tx.db.insert(schema.boardItemImages).values(values));
  }

  // Hard-delete every image for one placement, regardless of trash state.
  // Used by reparseItem to swap the image set. Scoped via board access.
  stageHardDeleteAllForBoardItem(boardItemId: string): void {
    this.tx.stage(
      this.tx.db
        .delete(schema.boardItemImages)
        .where(
          and(
            eq(schema.boardItemImages.boardItemId, boardItemId),
            accessibleScope(this.tx.db, this.scope),
          ),
        ),
    );
  }
}
