import { asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { BoardSchema, type Board } from '../schemas/board';

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
