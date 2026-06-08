import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { type Board } from '../schemas/board';
import { stagePurge } from './boardItems';

// ---------- reads ----------

export async function listBoards(ctx: ServiceCtx): Promise<Board[]> {
  const rows = await ctx.db.query.boards.findMany({
    where: and(
      eq(schema.boards.ownerId, ctx.scope.userId),
      isNull(schema.boards.deletedAt),
    ),
    orderBy: asc(schema.boards.createdAt),
  });
  return rows.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt }));
}

// ---------- mutations ----------

export function createBoard(tx: Tx, name: string): Board {
  const now = nowSec();
  const id = genId();
  tx.stage(
    tx.db.insert(schema.boards).values({
      id,
      ownerId: tx.scope.userId,
      name,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { id, name, createdAt: now };
}

// Hard purge: drops all placements for the board, items that become orphans
// (no remaining placements anywhere), their R2 blobs, then the board row —
// all in a single atomic batch via the Tx. There's no board-restore UI, so
// soft-deleting the board would just strand placements and blobs indefinitely.
export async function deleteBoard(tx: Tx, id: string): Promise<void> {
  await assertBoardOwned(tx, id);

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
  const existing = await assertBoardOwned(tx, id);
  tx.stage(
    tx.db
      .update(schema.boards)
      .set({ name, updatedAt: nowSec() })
      .where(eq(schema.boards.id, id)),
  );
  return { id: existing.id, name, createdAt: existing.createdAt };
}

// Used by `boardItems` callers too: confirms the board exists AND belongs to
// the current scope. Throws NOT_FOUND on miss (don't leak existence of
// other users' boards as FORBIDDEN).
export async function assertBoardOwned(
  tx: Tx,
  boardId: string,
): Promise<{ id: string; createdAt: number }> {
  const existing = await tx.query.boards.findFirst({
    where: and(
      eq(schema.boards.id, boardId),
      eq(schema.boards.ownerId, tx.scope.userId),
    ),
    columns: { id: true, createdAt: true },
  });
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return existing;
}
