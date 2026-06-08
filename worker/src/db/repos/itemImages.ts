import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope, Tx } from '../tx';

export type ItemImageRow = typeof schema.itemImages.$inferSelect;
export type ItemImageInsert = typeof schema.itemImages.$inferInsert;

// Item images inherit ownership transitively through their parent item.
// Reads INNER JOIN items; writes filter via an items.ownerId subquery.

function ownedItemIds(db: Db, scope: Scope) {
  return db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(eq(schema.items.ownerId, scope.userId));
}

function scopeWhere(db: Db, scope: Scope): SQL {
  return inArray(schema.itemImages.itemId, ownedItemIds(db, scope));
}

export class ItemImagesReadRepo {
  constructor(
    protected readonly db: Db,
    protected readonly scope: Scope,
  ) {}

  // Active images for one item, ordered by displayOrder. Scoped via items.
  async listForItem(itemId: string): Promise<ItemImageRow[]> {
    const rows = await this.db
      .select({ img: schema.itemImages })
      .from(schema.itemImages)
      .innerJoin(schema.items, eq(schema.items.id, schema.itemImages.itemId))
      .where(
        and(
          eq(schema.itemImages.itemId, itemId),
          eq(schema.items.ownerId, this.scope.userId),
          isNull(schema.itemImages.deletedAt),
        ),
      )
      .orderBy(asc(schema.itemImages.displayOrder));
    return rows.map((r) => r.img);
  }

  // Find one image by id, but only when it actually belongs to the given
  // (caller-owned) item. Used by setPrimaryImage to confirm parent → child.
  async findByItemAndId(
    itemId: string,
    imageId: string,
  ): Promise<ItemImageRow | undefined> {
    const rows = await this.db
      .select({ img: schema.itemImages })
      .from(schema.itemImages)
      .innerJoin(schema.items, eq(schema.items.id, schema.itemImages.itemId))
      .where(
        and(
          eq(schema.itemImages.id, imageId),
          eq(schema.itemImages.itemId, itemId),
          eq(schema.items.ownerId, this.scope.userId),
          isNull(schema.itemImages.deletedAt),
        ),
      )
      .limit(1);
    return rows[0]?.img;
  }

  // Returns all images for a set of items, scoped via items. Used by
  // stagePurge to know which R2 blobs to clean up.
  async findForItems(itemIds: string[]): Promise<ItemImageRow[]> {
    if (itemIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({ img: schema.itemImages })
      .from(schema.itemImages)
      .innerJoin(schema.items, eq(schema.items.id, schema.itemImages.itemId))
      .where(
        and(
          inArray(schema.itemImages.itemId, itemIds),
          eq(schema.items.ownerId, this.scope.userId),
        ),
      );
    return rows.map((r) => r.img);
  }
}

export class ItemImagesTxRepo extends ItemImagesReadRepo {
  constructor(private readonly tx: Tx) {
    super(tx.db, tx.scope);
  }

  // INSERT trusts the caller. The itemId either was just stage-inserted in
  // the same Tx (D1 hasn't committed yet, so an ownership lookup wouldn't
  // see it), or was fetched earlier with ownership verification.
  stageInsertMany(values: ItemImageInsert[]): void {
    if (values.length === 0) {
      return;
    }
    this.tx.stage(this.tx.db.insert(schema.itemImages).values(values));
  }

  // Hard-delete every image for one item. Scoped via items subquery — an id
  // referencing another user's item matches zero rows.
  stageDeleteAllForItem(itemId: string): void {
    this.tx.stage(
      this.tx.db
        .delete(schema.itemImages)
        .where(
          and(
            eq(schema.itemImages.itemId, itemId),
            scopeWhere(this.tx.db, this.scope),
          ),
        ),
    );
  }
}
