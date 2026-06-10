import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { type Board } from '../schemas/board';
import { stagePurge } from './boardItems';

// ---------- reads ----------

export async function listBoards(ctx: ServiceCtx): Promise<Board[]> {
  const rows = await ctx.boards.list();
  // boards.list() already includes shared-with-me rows (scope predicate).
  // Derive role from ownerId: owner if it matches the caller, editor
  // otherwise (membership is the only other way the row could appear).
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    role:
      b.ownerId === ctx.scope.userId ? ('owner' as const) : ('editor' as const),
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
// the board row — all in a single atomic batch via the Tx. Owner-only.
// After fold 0009 there's no separate items table to orphan-check; the
// FK cascade on board_items + the staged blob cleanup are enough.
export async function deleteBoard(tx: Tx, id: string): Promise<void> {
  await tx.boards.requireOwner(id);

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
  // Owner-only: editors don't rename. requireOwner throws FORBIDDEN for
  // editors (they already know the board exists) and NOT_FOUND for
  // non-members. After the check, read the row for the response payload —
  // the staged UPDATE hasn't run yet on D1.
  await tx.boards.requireOwner(id);
  const existing = await tx.boards.byIdOrThrow(id);
  tx.boards.stageUpdate(id, { name, updatedAt: nowSec() });
  return {
    id: existing.id,
    name,
    createdAt: existing.createdAt,
    role: 'owner',
  };
}
