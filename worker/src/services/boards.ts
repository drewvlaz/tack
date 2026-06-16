import { P } from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { type Board } from '../schemas/board';
import { stagePurge } from './boardItems';

// ---------- reads ----------

export async function listBoards(ctx: ServiceCtx): Promise<Board[]> {
  // listWithRole resolves the caller's role per board in one query
  // (owner | editor | viewer). Includes shared-with-me rows via the same
  // scope predicate as `list()`.
  const rows = await ctx.boards.listWithRole();
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    role: b.role,
  }));
}

// ---------- mutations ----------

export function createBoard(tx: Tx, name: string): Board {
  const now = nowSec();
  const id = genId();
  tx.boards.stageInsert({ id, name, createdAt: now, updatedAt: now });
  // Creator is always the owner of the boards they create.
  return { id, name, createdAt: now, role: 'owner' };
}

// Hard purge: drops all placements for the board, their R2 blobs, then
// the board row — all in a single atomic batch via the Tx. P.BoardManage.
// After fold 0009 there's no separate items table to orphan-check; the
// FK cascade on board_items + the staged blob cleanup are enough.
export async function deleteBoard(tx: Tx, id: string): Promise<void> {
  await tx.boards.require(id, P.BoardManage);

  const placements = await tx.placements.listIdsForBoardIncludingTrashed(id);
  await stagePurge(
    tx,
    placements.map((p) => p.id),
  );

  tx.boards.stageHardDelete(id);
}

export async function renameBoard(
  tx: Tx,
  id: string,
  name: string,
): Promise<Board> {
  // P.BoardManage: editors/viewers don't rename. `require` throws FORBIDDEN
  // for insufficient role (they already know the board exists) and NOT_FOUND
  // for non-members. After the check, read the row for the response payload
  // — the staged UPDATE hasn't run yet on D1.
  await tx.boards.require(id, P.BoardManage);
  const existing = await tx.boards.byIdOrThrow(id);
  tx.boards.stageUpdate(id, { name, updatedAt: nowSec() });
  return {
    id: existing.id,
    name,
    createdAt: existing.createdAt,
    role: 'owner',
  };
}
