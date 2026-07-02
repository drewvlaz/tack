import { TRPCError } from '@trpc/server';
import { P } from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { nowSec } from '../lib/time';

// Normalize a free-form tag: trim, collapse internal whitespace, lowercase.
// Mirrors how the UI displays them so two visually-identical entries dedupe.
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeNames(names: string[]): string[] {
  return [...new Set(names.map(normalizeTagName).filter(Boolean))];
}

// Verify every placement is on a board the caller can EDIT. One IN-list
// SELECT for the placement→board lookup; then one boards.require per unique
// board (usually 1, up to a small handful in multi-board bulk selections).
// Missing / trashed / inaccessible ids surface as NOT_FOUND — same disclosure
// rule as byIdOrThrow.
async function requireEditOnPlacements(
  tx: Tx,
  placementIds: string[],
): Promise<void> {
  const rows = await tx.placements.listActiveByIds(placementIds);
  if (rows.length !== placementIds.length) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const boardIds = new Set(rows.map((r) => r.boardId));
  await Promise.all(
    [...boardIds].map((boardId) => tx.boards.require(boardId, P.BoardEdit)),
  );
}

export async function addTags(
  tx: Tx,
  placementIds: string[],
  names: string[],
): Promise<void> {
  const normalized = normalizeNames(names);
  if (normalized.length === 0) {
    return;
  }
  await requireEditOnPlacements(tx, placementIds);

  const now = nowSec();
  const rows = placementIds.flatMap((boardItemId) =>
    normalized.map((name) => ({ boardItemId, name, createdAt: now })),
  );
  tx.boardItemTags.stageInsertMany(rows);
}

export async function removeTags(
  tx: Tx,
  placementIds: string[],
  names: string[],
): Promise<void> {
  const normalized = normalizeNames(names);
  if (normalized.length === 0) {
    return;
  }
  await requireEditOnPlacements(tx, placementIds);
  tx.boardItemTags.stageDeleteMany(placementIds, normalized);
}

// Distinct names + counts for a board. Permission is BoardView — anyone with
// access to the board can see its taxonomy.
export async function listBoardTags(
  ctx: ServiceCtx,
  boardId: string,
): Promise<Array<{ name: string; count: number }>> {
  await ctx.boards.require(boardId, P.BoardView);
  return ctx.boardItemTags.listForBoard(boardId);
}
