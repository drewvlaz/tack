import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { genId } from '../lib/id';
import {
  BoardItemSchema,
  BoardSchema,
  type AddItemInput,
  type Board,
  type BoardItem,
  type PatchBoardItemInput,
} from '../schemas/board';
import { imageDisplayUrl } from './images';

export async function listBoards(db: Db): Promise<Board[]> {
  const rows = await db.query.boards.findMany({
    orderBy: asc(schema.boards.createdAt),
  });
  return rows.map((b) => BoardSchema.parse(b));
}

export async function createBoard(db: Db, name: string): Promise<Board> {
  const now = Math.floor(Date.now() / 1000);
  const id = genId();
  await db.insert(schema.boards).values({ id, name, createdAt: now });
  return BoardSchema.parse({ id, name, createdAt: now });
}

export async function deleteBoard(db: Db, id: string): Promise<void> {
  await db.delete(schema.boards).where(eq(schema.boards.id, id));
}

export async function renameBoard(
  db: Db,
  id: string,
  name: string,
): Promise<Board> {
  await db.update(schema.boards).set({ name }).where(eq(schema.boards.id, id));
  const row = await db.query.boards.findFirst({
    where: eq(schema.boards.id, id),
  });
  if (!row) throw new Error(`board ${id} not found`);
  return BoardSchema.parse(row);
}

export async function listBoardItems(
  db: Db,
  boardId: string,
): Promise<BoardItem[]> {
  const results = await db.query.boardItems.findMany({
    where: eq(schema.boardItems.boardId, boardId),
    with: {
      item: {
        with: {
          images: { orderBy: asc(schema.itemImages.displayOrder) },
        },
      },
    },
  });

  return results.map((bi) =>
    BoardItemSchema.parse({
      id: bi.id,
      itemId: bi.itemId,
      title: bi.item.title,
      brand: bi.item.brand,
      description: bi.item.description,
      price: bi.item.price,
      currency: bi.item.currency,
      imageUrls: bi.item.images.map((img) => imageDisplayUrl(img.r2Key)),
      sourceUrl: bi.item.sourceUrl,
      updatedAt: bi.item.updatedAt,
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
  const itemId = genId();
  const boardItemId = genId();

  await db.insert(schema.items).values({
    id: itemId,
    sourceUrl: input.sourceUrl,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    createdAt: now,
    updatedAt: now,
  });

  for (let i = 0; i < input.images.length; i++) {
    const img = input.images[i];
    await db.insert(schema.itemImages).values({
      id: genId(),
      itemId,
      r2Key: img.r2Key,
      sourceUrl: img.sourceUrl,
      displayOrder: i,
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
    height: 280,
    zIndex: 0,
    createdAt: now,
    updatedAt: now,
  });

  return BoardItemSchema.parse({
    id: boardItemId,
    itemId,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    currency: 'USD',
    imageUrls: input.images.map((img) => imageDisplayUrl(img.r2Key)),
    sourceUrl: input.sourceUrl,
    updatedAt: now,
    x: input.x,
    y: input.y,
    width: 220,
    height: 280,
    zIndex: 0,
  });
}

export async function deleteBoardItem(db: Db, id: string): Promise<void> {
  await db.delete(schema.boardItems).where(eq(schema.boardItems.id, id));
}
