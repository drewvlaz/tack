import { asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import type { Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { type Board } from '../schemas/board';
import { stagePurge } from './boardItems';

// ---------- reads ----------

export async function listBoards(db: Db): Promise<Board[]> {
  const rows = await db.query.boards.findMany({
    where: isNull(schema.boards.deletedAt),
    orderBy: asc(schema.boards.createdAt),
  });
  return rows.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt }));
}

// ---------- mutations ----------

export function createBoard(tx: Tx, name: string): Board {
  const now = nowSec();
  const id = genId();
  tx.stage(
    tx.db
      .insert(schema.boards)
      .values({ id, name, createdAt: now, updatedAt: now }),
  );
  return { id, name, createdAt: now };
}

// Hard purge: drops all placements for the board, items that become orphans
// (no remaining placements anywhere), their R2 blobs, then the board row —
// all in a single atomic batch via the Tx. There's no board-restore UI, so
// soft-deleting the board would just strand placements and blobs indefinitely.
export async function deleteBoard(tx: Tx, id: string): Promise<void> {
  const placements = await tx.query.boardItems.findMany({
    where: eq(schema.boardItems.boardId, id),
    columns: { id: true, itemId: true },
  });

  await stagePurge(
    tx,
    placements.map((p) => p.id),
    placements.map((p) => p.itemId),
  );

  tx.stage(tx.db.delete(schema.boards).where(eq(schema.boards.id, id)));
}

export async function renameBoard(
  tx: Tx,
  id: string,
  name: string,
): Promise<Board> {
  // RENAME needs to return the updated row, but the staged UPDATE hasn't run
  // yet. Read the current row to confirm existence (throw early on 404), then
  // construct the response from the read + new name. The actual write happens
  // at commit time.
  const existing = await tx.query.boards.findFirst({
    where: eq(schema.boards.id, id),
  });
  if (!existing) {
    throw new Error(`board ${id} not found`);
  }
  tx.stage(
    tx.db
      .update(schema.boards)
      .set({ name, updatedAt: nowSec() })
      .where(eq(schema.boards.id, id)),
  );
  return { id: existing.id, name, createdAt: existing.createdAt };
}
