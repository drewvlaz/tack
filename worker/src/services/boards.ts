import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import {
  BoardItemSchema,
  type AddItemInput,
  type BoardItem,
  type PatchBoardItemInput,
} from '../schemas/board';

export async function listBoardItems(
  db: Db,
  boardId: string,
): Promise<BoardItem[]> {
  const results = await db.query.boardItems.findMany({
    where: eq(schema.boardItems.boardId, boardId),
    with: {
      item: {
        with: {
          images: { orderBy: asc(schema.itemImages.displayOrder), limit: 1 },
        },
      },
    },
  });

  return results.map((bi) =>
    BoardItemSchema.parse({
      id: bi.id,
      itemId: bi.itemId,
      title: bi.item.title,
      price: bi.item.price,
      currency: bi.item.currency,
      imageUrl: bi.item.images[0]?.sourceUrl ?? null,
      x: bi.x,
      y: bi.y,
      width: bi.width,
      height: bi.height,
      zIndex: bi.zIndex,
    }),
  );
}

export async function patchBoardItem(
  db: Db,
  id: string,
  patch: PatchBoardItemInput,
): Promise<void> {
  const update: Record<string, number> = {
    updatedAt: Math.floor(Date.now() / 1000),
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
  const now = Math.floor(Date.now() / 1000);
  const itemId = crypto.randomUUID();
  const boardItemId = crypto.randomUUID();

  await db.insert(schema.items).values({
    id: itemId,
    sourceUrl: input.sourceUrl,
    title: input.title,
    brand: input.brand,
    price: input.price,
    createdAt: now,
    updatedAt: now,
  });

  if (input.imageUrl) {
    await db.insert(schema.itemImages).values({
      id: crypto.randomUUID(),
      itemId,
      r2Key: input.imageUrl,
      sourceUrl: input.imageUrl,
      displayOrder: 0,
      createdAt: now,
    });
  }

  await db.insert(schema.boardItems).values({
    id: boardItemId,
    boardId,
    itemId,
    x: input.x,
    y: input.y,
    width: 220,
    height: 400,
    zIndex: 0,
    createdAt: now,
    updatedAt: now,
  });

  return BoardItemSchema.parse({
    id: boardItemId,
    itemId,
    title: input.title,
    price: input.price,
    currency: 'USD',
    imageUrl: input.imageUrl,
    x: input.x,
    y: input.y,
    width: 220,
    height: 400,
    zIndex: 0,
  });
}

export async function deleteBoardItem(db: Db, id: string): Promise<void> {
  await db.delete(schema.boardItems).where(eq(schema.boardItems.id, id));
}
