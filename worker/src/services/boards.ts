import { asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { BoardSchema, type Board } from '../schemas/board';
import { purgeBoardItemsByIds } from './boardItems';

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

// Hard purge: drops all placements for the board, items that become orphans
// (no remaining placements anywhere), their R2 blobs, then the board row.
// There's no board-restore UI, so soft-deleting the board would just strand
// the placements and blobs indefinitely.
export async function deleteBoard(
  db: Db,
  imagesR2: R2Bucket,
  id: string,
): Promise<void> {
  const placements = await db.query.boardItems.findMany({
    where: eq(schema.boardItems.boardId, id),
    columns: { id: true, itemId: true },
  });

  if (placements.length > 0) {
    await purgeBoardItemsByIds(
      db,
      imagesR2,
      placements.map((p) => p.id),
      placements.map((p) => p.itemId),
    );
  }

  await db.delete(schema.boards).where(eq(schema.boards.id, id));
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
  if (!row) {
    throw new Error(`board ${id} not found`);
  }

  return BoardSchema.parse(row);
}
