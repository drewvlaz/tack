import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import {
  BoardItemSchema,
  BoardSchema,
  type AddItemInput,
  type Board,
  type BoardItem,
  type PatchBoardItemInput,
} from '../schemas/board';
import {
  deleteStoredImage,
  fromR2Key,
  imageDisplayUrl,
  toR2Key,
} from './images';

const DEFAULT_CARD_WIDTH = 220;
const DEFAULT_CARD_HEIGHT = 280;
const INITIAL_Z_INDEX = 0;
const DEFAULT_CURRENCY = 'USD';

export async function listBoards(db: Db): Promise<Board[]> {
  const rows = await db.query.boards.findMany({
    where: isNull(schema.boards.deletedAt),
    orderBy: asc(schema.boards.createdAt),
  });
  return rows.map((b) => BoardSchema.parse(b));
}

export async function createBoard(db: Db, name: string): Promise<Board> {
  const now = nowSec();
  const id = genId();
  await db
    .insert(schema.boards)
    .values({ id, name, createdAt: now, updatedAt: now });
  return BoardSchema.parse({ id, name, createdAt: now });
}

export async function deleteBoard(db: Db, id: string): Promise<void> {
  const now = nowSec();
  await db.batch([
    db
      .update(schema.boards)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.boards.id, id)),
    db
      .update(schema.boardItems)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.boardItems.boardId, id)),
  ]);
}

export async function renameBoard(
  db: Db,
  id: string,
  name: string,
): Promise<Board> {
  const [row] = await db
    .update(schema.boards)
    .set({ name, updatedAt: nowSec() })
    .where(eq(schema.boards.id, id))
    .returning();
  if (!row) throw new Error(`board ${id} not found`);
  return BoardSchema.parse(row);
}

export async function listBoardItems(
  db: Db,
  boardId: string,
): Promise<BoardItem[]> {
  return queryBoardItems(db, boardId, isNull(schema.boardItems.deletedAt));
}

export async function listTrashedBoardItems(
  db: Db,
  boardId: string,
): Promise<BoardItem[]> {
  return queryBoardItems(db, boardId, isNotNull(schema.boardItems.deletedAt));
}

async function queryBoardItems(
  db: Db,
  boardId: string,
  placementFilter: ReturnType<typeof isNull>,
): Promise<BoardItem[]> {
  const results = await db.query.boardItems.findMany({
    where: and(eq(schema.boardItems.boardId, boardId), placementFilter),
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
    .map((bi): BoardItem => {
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
          url: imageDisplayUrl(fromR2Key(img.r2Key, img.sourceUrl ?? '')),
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
  if (!primaryId) return images;
  const idx = images.findIndex((img) => img.id === primaryId);
  if (idx <= 0) return images;
  return [images[idx], ...images.slice(0, idx), ...images.slice(idx + 1)];
}

export async function patchBoardItem(
  db: Db,
  id: string,
  patch: PatchBoardItemInput,
): Promise<void> {
  const update: Record<string, number> = {
    updatedAt: nowSec(),
  };
  if (patch.x !== undefined) update.x = patch.x;
  if (patch.y !== undefined) update.y = patch.y;
  if (patch.zIndex !== undefined) update.zIndex = patch.zIndex;
  if (patch.width !== undefined) update.width = patch.width;
  if (patch.height !== undefined) update.height = patch.height;

  await db
    .update(schema.boardItems)
    .set(update)
    .where(eq(schema.boardItems.id, id));
}

export async function addBoardItem(
  db: Db,
  boardId: string,
  input: AddItemInput,
): Promise<BoardItem> {
  const now = nowSec();
  const itemId = genId();
  const boardItemId = genId();
  const imageIds = input.images.map(() => genId());

  const itemInsert = db.insert(schema.items).values({
    id: itemId,
    sourceUrl: input.sourceUrl,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    details: input.details.length > 0 ? input.details : null,
    createdAt: now,
    updatedAt: now,
  });

  const boardItemInsert = db.insert(schema.boardItems).values({
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
  });

  if (input.images.length > 0) {
    const imagesInsert = db.insert(schema.itemImages).values(
      input.images.map((img, i) => ({
        id: imageIds[i],
        itemId,
        r2Key: toR2Key(img),
        sourceUrl: img.sourceUrl,
        displayOrder: i,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.batch([itemInsert, imagesInsert, boardItemInsert]);
  } else {
    await db.batch([itemInsert, boardItemInsert]);
  }

  return BoardItemSchema.parse({
    id: boardItemId,
    itemId,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    currency: DEFAULT_CURRENCY,
    details: input.details,
    images: input.images.map((img, i) => ({
      id: imageIds[i],
      url: imageDisplayUrl(img),
    })),
    sourceUrl: input.sourceUrl,
    addedAt: now,
    updatedAt: now,
    x: input.x,
    y: input.y,
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT,
    zIndex: INITIAL_Z_INDEX,
  });
}

export async function deleteBoardItem(db: Db, id: string): Promise<void> {
  const now = nowSec();
  await db
    .update(schema.boardItems)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(schema.boardItems.id, id));
}

export async function restoreBoardItem(db: Db, id: string): Promise<void> {
  await db
    .update(schema.boardItems)
    .set({ deletedAt: null, updatedAt: nowSec() })
    .where(eq(schema.boardItems.id, id));
}

export async function purgeBoardItem(
  db: Db,
  imagesR2: R2Bucket,
  id: string,
): Promise<void> {
  const placement = await db.query.boardItems.findFirst({
    where: eq(schema.boardItems.id, id),
  });
  if (!placement) return;
  await purgeBoardItemsByIds(db, imagesR2, [placement.id], [placement.itemId]);
}

export async function emptyBoardTrash(
  db: Db,
  imagesR2: R2Bucket,
  boardId: string,
): Promise<void> {
  const trashed = await db.query.boardItems.findMany({
    where: and(
      eq(schema.boardItems.boardId, boardId),
      isNotNull(schema.boardItems.deletedAt),
    ),
  });
  if (trashed.length === 0) return;
  await purgeBoardItemsByIds(
    db,
    imagesR2,
    trashed.map((p) => p.id),
    trashed.map((p) => p.itemId),
  );
}

// Hard-deletes the given placements. For any item that has no remaining
// placements after the delete, also wipes the item and its R2 blobs (item
// rows cascade to item_images and board_items). R2 deletes happen after the
// SQL batch so a crash leaves orphan blobs (GC-able) rather than rows pointing
// at missing bytes.
async function purgeBoardItemsByIds(
  db: Db,
  imagesR2: R2Bucket,
  placementIds: string[],
  itemIds: string[],
): Promise<void> {
  const uniqueItemIds = [...new Set(itemIds)];
  const placementIdSet = new Set(placementIds);

  const allPlacements = await db.query.boardItems.findMany({
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
    ? await db.query.itemImages.findMany({
        where: inArray(schema.itemImages.itemId, orphanItemIds),
      })
    : [];

  const placementDelete = db
    .delete(schema.boardItems)
    .where(inArray(schema.boardItems.id, placementIds));
  if (orphanItemIds.length) {
    await db.batch([
      placementDelete,
      db.delete(schema.items).where(inArray(schema.items.id, orphanItemIds)),
    ]);
  } else {
    await placementDelete;
  }

  for (const img of orphanImages) {
    await deleteStoredImage(
      imagesR2,
      fromR2Key(img.r2Key, img.sourceUrl ?? ''),
    );
  }
}
