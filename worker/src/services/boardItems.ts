import { TRPCError } from '@trpc/server';
import type { HydratedPlacement } from '../db/repos/placements';
import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import {
  type AddItemInput,
  type BoardItemRow,
  type PatchBoardItemInput,
} from '../schemas/board';
import { fromR2Key, r2KeyOwner, toR2Key } from './images';

const DEFAULT_CARD_WIDTH = 220;
const DEFAULT_CARD_HEIGHT = 280;
const INITIAL_Z_INDEX = 0;

// ---------- reads (no Tx; read-only) ----------

export async function listBoardItems(
  ctx: ServiceCtx,
  boardId: string,
): Promise<BoardItemRow[]> {
  const hydrated = await ctx.placements.listForBoard(boardId);
  return hydrated.map(toBoardItemRow);
}

export async function listTrashedBoardItems(
  ctx: ServiceCtx,
  boardId: string,
): Promise<BoardItemRow[]> {
  const hydrated = await ctx.placements.listTrashForBoard(boardId);
  return hydrated.map(toBoardItemRow);
}

// Maps the repo's raw joined shape to the domain BoardItemRow. The repo
// returns scoped + joined data; the service handles StoredImage construction
// (fromR2Key) and primary-image sorting — both are domain concerns.
function toBoardItemRow({
  placement,
  item,
  images,
}: HydratedPlacement): BoardItemRow {
  const sortedImages = sortImagesPrimaryFirst(images, item.primaryImageId);
  return {
    id: placement.id,
    itemId: placement.itemId,
    title: item.title,
    brand: item.brand,
    description: item.description,
    price: item.price,
    currency: item.currency,
    details: item.details ?? [],
    images: sortedImages.map((img) => ({
      id: img.id,
      image: fromR2Key(img.r2Key, img.sourceUrl ?? ''),
    })),
    sourceUrl: item.sourceUrl,
    addedAt: placement.createdAt,
    updatedAt: item.updatedAt,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    zIndex: placement.zIndex,
  };
}

function sortImagesPrimaryFirst<T extends { id: string }>(
  images: T[],
  primaryId: string | null,
): T[] {
  if (!primaryId) {
    return images;
  }
  const idx = images.findIndex((img) => img.id === primaryId);
  if (idx <= 0) {
    return images;
  }
  return [images[idx], ...images.slice(0, idx), ...images.slice(idx + 1)];
}

// ---------- mutations (Tx; staged into the request's single commit) ----------

export async function patchBoardItem(
  tx: Tx,
  id: string,
  patch: PatchBoardItemInput,
): Promise<void> {
  await tx.placements.byIdOrThrow(id);
  const update = {
    updatedAt: nowSec(),
    ...(patch.x !== undefined && { x: patch.x }),
    ...(patch.y !== undefined && { y: patch.y }),
    ...(patch.zIndex !== undefined && { zIndex: patch.zIndex }),
    ...(patch.width !== undefined && { width: patch.width }),
    ...(patch.height !== undefined && { height: patch.height }),
  };
  tx.placements.stageUpdate(id, update);
}

export async function addBoardItem(
  tx: Tx,
  boardId: string,
  input: AddItemInput,
): Promise<BoardItemRow> {
  // Verify board ownership BEFORE staging — same-tx reads can't see staged
  // writes on D1, so this is the only chance to fail-fast on a forged boardId.
  await tx.boards.byIdOrThrow(boardId);
  // R2 keys returned by `parseUrl` are namespaced as `items/{userId}/...`.
  // Reject any r2-kind image whose owner segment doesn't match the caller —
  // otherwise a client could pass a key it scraped from another user's parse
  // response and attach those bytes to its own board. The user segment is the
  // capability: unguessable nanoid keys make scraping unlikely, but defense
  // in depth costs us one substring check.
  for (const img of input.images) {
    if (img.kind === 'r2' && r2KeyOwner(img.key) !== tx.scope.userId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Image key not owned by caller',
      });
    }
  }
  const now = nowSec();
  const itemId = genId();
  const boardItemId = genId();
  const imageIds = input.images.map(() => genId());

  tx.items.stageInsert({
    id: itemId,
    sourceUrl: input.sourceUrl,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    // `currency` defaults to 'USD' at the column level — only override when
    // the parser actually extracted an ISO code. Missing currency still
    // looks like USD on the wire; a real £/€ product persists correctly.
    ...(input.currency ? { currency: input.currency } : {}),
    details: input.details.length > 0 ? input.details : null,
    createdAt: now,
    updatedAt: now,
  });

  if (input.images.length > 0) {
    tx.itemImages.stageInsertMany(
      input.images.map((img, i) => ({
        id: imageIds[i],
        itemId,
        r2Key: toR2Key(img),
        sourceUrl: img.sourceUrl,
        displayOrder: i,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  tx.placements.stageInsert({
    id: boardItemId,
    boardId,
    itemId,
    x: input.x,
    y: input.y,
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT,
    zIndex: INITIAL_Z_INDEX,
    createdAt: now,
    updatedAt: now,
  });

  // Construct the response in memory from inputs + generated IDs. No re-read
  // — the writes haven't been committed yet, so a read wouldn't see them on
  // D1. The shape matches what `listBoardItems` would return after commit.
  return {
    id: boardItemId,
    itemId,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    currency: input.currency ?? 'USD',
    details: input.details,
    images: input.images.map((img, i) => ({
      id: imageIds[i],
      image: img,
    })),
    sourceUrl: input.sourceUrl,
    addedAt: now,
    updatedAt: now,
    x: input.x,
    y: input.y,
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT,
    zIndex: INITIAL_Z_INDEX,
  };
}

export async function deleteBoardItem(tx: Tx, id: string): Promise<void> {
  await tx.placements.byIdOrThrow(id);
  tx.placements.stageSoftDelete(id, nowSec());
}

export async function restoreBoardItem(tx: Tx, id: string): Promise<void> {
  await tx.placements.byIdIncludingTrashedOrThrow(id);
  tx.placements.stageRestore(id, nowSec());
}

export async function purgeBoardItem(tx: Tx, id: string): Promise<void> {
  const placement = await tx.placements.byIdIncludingTrashedOrThrow(id);
  await stagePurge(tx, [placement.id], [placement.itemId]);
}

export async function emptyBoardTrash(tx: Tx, boardId: string): Promise<void> {
  await tx.boards.byIdOrThrow(boardId);
  const trashed = await tx.placements.listTrashIdsForBoard(boardId);
  if (trashed.length === 0) {
    return;
  }
  await stagePurge(
    tx,
    trashed.map((p) => p.id),
    trashed.map((p) => p.itemId),
  );
}

// Stages the SQL writes for a hard-purge of the given placements + any items
// that become orphans + their R2 blob cleanup. Reads are done eagerly to
// compute orphans; writes accumulate in the Tx and commit at the boundary.
// Callers (e.g. `deleteBoard`) can stage additional statements afterward so
// the entire procedure still commits in one batch.
//
// Every read and write goes through scoped repos, so even if a caller forgets
// the parent ownership check, this function can't reach across users.
export async function stagePurge(
  tx: Tx,
  placementIds: string[],
  itemIds: string[],
): Promise<void> {
  if (placementIds.length === 0) {
    return;
  }

  const uniqueItemIds = [...new Set(itemIds)];
  const placementIdSet = new Set(placementIds);

  const allPlacements =
    await tx.placements.findReferencingItemsIncludingTrashed(uniqueItemIds);
  const stillReferenced = new Set(
    allPlacements.filter((p) => !placementIdSet.has(p.id)).map((p) => p.itemId),
  );
  const orphanItemIds = uniqueItemIds.filter(
    (iid) => !stillReferenced.has(iid),
  );

  const orphanImages =
    await tx.itemImages.findForItemsIncludingTrashed(orphanItemIds);

  tx.placements.stageHardDeleteMany(placementIds);
  tx.items.stageHardDeleteMany(orphanItemIds);
  if (orphanImages.length) {
    tx.scheduleBlobCleanup(orphanImages);
  }
}
