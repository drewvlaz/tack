import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { type Board } from '../schemas/board';
import { stagePurge } from './boardItems';

// ---------- reads ----------

export async function listBoards(ctx: ServiceCtx): Promise<Board[]> {
  const rows = await ctx.boards.listActive();
  return rows.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt }));
}

// ---------- mutations ----------

export function createBoard(tx: Tx, name: string): Board {
  const now = nowSec();
  const id = genId();
  tx.boards.stageInsert({ id, name, createdAt: now, updatedAt: now });
  return { id, name, createdAt: now };
}

// Hard purge: drops all placements for the board, items that become orphans
// (no remaining placements anywhere), their R2 blobs, then the board row —
// all in a single atomic batch via the Tx. There's no board-restore UI, so
// soft-deleting the board would just strand placements and blobs indefinitely.
export async function deleteBoard(tx: Tx, id: string): Promise<void> {
  await tx.boards.byIdOrThrow(id);

  const placements = await tx.placements.listIdsForBoard(id);
  await stagePurge(
    tx,
    placements.map((p) => p.id),
    placements.map((p) => p.itemId),
  );

  tx.boards.stageDelete(id);
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
  const existing = await tx.boards.byIdOrThrow(id);
  tx.boards.stageUpdate(id, { name, updatedAt: nowSec() });
  return { id: existing.id, name, createdAt: existing.createdAt };
}
