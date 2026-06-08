import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import type { Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import {
  type AddItemInput,
  type BoardItemRow,
  type PatchBoardItemInput,
} from '../schemas/board';
import { fromR2Key, toR2Key } from './images';

const DEFAULT_CARD_WIDTH = 220;
const DEFAULT_CARD_HEIGHT = 280;
const INITIAL_Z_INDEX = 0;

// ---------- reads (no Tx; read-only) ----------

export async function listBoardItems(
  db: Db,
  boardId: string,
): Promise<BoardItemRow[]> {
  return queryBoardItems(
    db,
    and(
      eq(schema.boardItems.boardId, boardId),
      isNull(schema.boardItems.deletedAt),
    ),
  );
}

export async function listTrashedBoardItems(
  db: Db,
  boardId: string,
): Promise<BoardItemRow[]> {
  return queryBoardItems(
    db,
    and(
      eq(schema.boardItems.boardId, boardId),
      isNotNull(schema.boardItems.deletedAt),
    ),
  );
}

// Single source of truth for the BoardItemRow shape. Callers compose their own
// where clause; the join + row→domain mapping lives here only. Images are
// returned as `StoredImage` refs — URL construction is a transport concern
// owned by `routers/boards.ts`.
async function queryBoardItems(
  db: Db,
  where: SQL | undefined,
): Promise<BoardItemRow[]> {
  const results = await db.query.boardItems.findMany({
    where,
    with: {
      item: {
        with: {
          images: {
            where: isNull(schema.itemImages.deletedAt),
            orderBy: asc(schema.itemImages.displayOrder),
          },
        },
      },
    },
  });

  return results
    .filter((bi) => bi.item.deletedAt === null)
    .map((bi): BoardItemRow => {
      const sortedImages = sortImagesPrimaryFirst(
        bi.item.images,
        bi.item.primaryImageId,
      );
      return {
        id: bi.id,
        itemId: bi.itemId,
        title: bi.item.title,
        brand: bi.item.brand,
        description: bi.item.description,
        price: bi.item.price,
        currency: bi.item.currency,
        details: bi.item.details ?? [],
        images: sortedImages.map((img) => ({
          id: img.id,
          image: fromR2Key(img.r2Key, img.sourceUrl ?? ''),
        })),
        sourceUrl: bi.item.sourceUrl,
        addedAt: bi.createdAt,
        updatedAt: bi.item.updatedAt,
        x: bi.x,
        y: bi.y,
        width: bi.width,
        height: bi.height,
        zIndex: bi.zIndex,
      };
    });
}

function sortImagesPrimaryFirst<T extends { id: string }>(
  images: T[],
  primaryId: string | null,
): T[] {
  if (!primaryId) {
    return images;
  }
  const idx = images.findIndex((img) => img.id === primaryId);
  if (idx <= 0) {
    return images;
  }
  return [images[idx], ...images.slice(0, idx), ...images.slice(idx + 1)];
}

// ---------- mutations (Tx; staged into the request's single commit) ----------

export function patchBoardItem(
  tx: Tx,
  id: string,
  patch: PatchBoardItemInput,
): void {
  const update: Record<string, number> = { updatedAt: nowSec() };
  if (patch.x !== undefined) {
    update.x = patch.x;
  }
  if (patch.y !== undefined) {
    update.y = patch.y;
  }
  if (patch.zIndex !== undefined) {
    update.zIndex = patch.zIndex;
  }
  if (patch.width !== undefined) {
    update.width = patch.width;
  }
  if (patch.height !== undefined) {
    update.height = patch.height;
  }
  tx.stage(
    tx.db
      .update(schema.boardItems)
      .set(update)
      .where(eq(schema.boardItems.id, id)),
  );
}

export function addBoardItem(
  tx: Tx,
  boardId: string,
  input: AddItemInput,
): BoardItemRow {
  const now = nowSec();
  const itemId = genId();
  const boardItemId = genId();
  const imageIds = input.images.map(() => genId());

  tx.stage(
    tx.db.insert(schema.items).values({
      id: itemId,
      sourceUrl: input.sourceUrl,
      title: input.title,
      brand: input.brand,
      description: input.description,
      price: input.price,
      // `currency` defaults to 'USD' at the column level — only override when
      // the parser actually extracted an ISO code. Missing currency still
      // looks like USD on the wire; a real £/€ product persists correctly.
      ...(input.currency ? { currency: input.currency } : {}),
      details: input.details.length > 0 ? input.details : null,
      createdAt: now,
      updatedAt: now,
    }),
  );

  if (input.images.length > 0) {
    tx.stage(
      tx.db.insert(schema.itemImages).values(
        input.images.map((img, i) => ({
          id: imageIds[i],
          itemId,
          r2Key: toR2Key(img),
          sourceUrl: img.sourceUrl,
          displayOrder: i,
          createdAt: now,
          updatedAt: now,
        })),
      ),
    );
  }

  tx.stage(
    tx.db.insert(schema.boardItems).values({
      id: boardItemId,
      boardId,
      itemId,
      x: input.x,
      y: input.y,
      width: DEFAULT_CARD_WIDTH,
      height: DEFAULT_CARD_HEIGHT,
      zIndex: INITIAL_Z_INDEX,
      createdAt: now,
      updatedAt: now,
    }),
  );

  // Construct the response in memory from inputs + generated IDs. No re-read
  // — the writes haven't been committed yet, so a read wouldn't see them on
  // D1. The shape matches what `listBoardItems` would return after commit.
  return {
    id: boardItemId,
    itemId,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    currency: input.currency ?? 'USD',
    details: input.details,
    images: input.images.map((img, i) => ({
      id: imageIds[i],
      image: img,
    })),
    sourceUrl: input.sourceUrl,
    addedAt: now,
    updatedAt: now,
    x: input.x,
    y: input.y,
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT,
    zIndex: INITIAL_Z_INDEX,
  };
}

export function deleteBoardItem(tx: Tx, id: string): void {
  const now = nowSec();
  tx.stage(
    tx.db
      .update(schema.boardItems)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.boardItems.id, id)),
  );
}

export function restoreBoardItem(tx: Tx, id: string): void {
  tx.stage(
    tx.db
      .update(schema.boardItems)
      .set({ deletedAt: null, updatedAt: nowSec() })
      .where(eq(schema.boardItems.id, id)),
  );
}

export async function purgeBoardItem(tx: Tx, id: string): Promise<void> {
  const placement = await tx.query.boardItems.findFirst({
    where: eq(schema.boardItems.id, id),
  });
  if (!placement) {
    return;
  }
  await stagePurge(tx, [placement.id], [placement.itemId]);
}

export async function emptyBoardTrash(tx: Tx, boardId: string): Promise<void> {
  const trashed = await tx.query.boardItems.findMany({
    where: and(
      eq(schema.boardItems.boardId, boardId),
      isNotNull(schema.boardItems.deletedAt),
    ),
  });
  if (trashed.length === 0) {
    return;
  }
  await stagePurge(
    tx,
    trashed.map((p) => p.id),
    trashed.map((p) => p.itemId),
  );
}

// Stages the SQL writes for a hard-purge of the given placements + any items
// that become orphans + their R2 blob cleanup. Reads are done eagerly to
// compute orphans; writes accumulate in the Tx and commit at the boundary.
// Callers (e.g. `deleteBoard`) can stage additional statements afterward so
// the entire procedure still commits in one batch.
export async function stagePurge(
  tx: Tx,
  placementIds: string[],
  itemIds: string[],
): Promise<void> {
  if (placementIds.length === 0) {
    return;
  }

  const uniqueItemIds = [...new Set(itemIds)];
  const placementIdSet = new Set(placementIds);

  const allPlacements = await tx.query.boardItems.findMany({
    where: inArray(schema.boardItems.itemId, uniqueItemIds),
    columns: { id: true, itemId: true },
  });
  const stillReferenced = new Set(
    allPlacements.filter((p) => !placementIdSet.has(p.id)).map((p) => p.itemId),
  );
  const orphanItemIds = uniqueItemIds.filter(
    (iid) => !stillReferenced.has(iid),
  );

  const orphanImages = orphanItemIds.length
    ? await tx.query.itemImages.findMany({
        where: inArray(schema.itemImages.itemId, orphanItemIds),
      })
    : [];

  tx.stage(
    tx.db
      .delete(schema.boardItems)
      .where(inArray(schema.boardItems.id, placementIds)),
  );
  if (orphanItemIds.length) {
    tx.stage(
      tx.db.delete(schema.items).where(inArray(schema.items.id, orphanItemIds)),
    );
  }
  if (orphanImages.length) {
    tx.scheduleBlobCleanup(orphanImages);
  }
}
