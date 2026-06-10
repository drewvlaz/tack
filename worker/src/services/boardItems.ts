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
import { fromR2Key, r2KeyOwner, storeImage, toR2Key } from './images';
import { fetchAndParseMeta, mapLimit } from './parser';

const DEFAULT_CARD_WIDTH = 220;
const DEFAULT_CARD_HEIGHT = 400;
const INITIAL_Z_INDEX = 0;
const IMAGE_FETCH_CONCURRENCY = 4;

// ---------- reads ----------

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

// Map a hydrated placement (row + images) to the domain shape. Images get
// the primary one moved to position 0 if set.
function toBoardItemRow({
  placement,
  images,
}: HydratedPlacement): BoardItemRow {
  const sorted = sortImagesPrimaryFirst(images, placement.primaryImageId);
  return {
    id: placement.id,
    title: placement.title,
    brand: placement.brand,
    description: placement.description,
    price: placement.price,
    currency: placement.currency,
    details: placement.details ?? [],
    images: sorted.map((img) => ({
      id: img.id,
      image: fromR2Key(img.r2Key, img.sourceUrl ?? ''),
    })),
    sourceUrl: placement.sourceUrl,
    addedAt: placement.createdAt,
    addedBy: placement.addedBy,
    updatedAt: placement.updatedAt,
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
  // Editor or owner can add. requireEditor returns NOT_FOUND for non-
  // members (existence-leak safety) and is the only access check we need
  // — placement metadata + images all hang off this one row now.
  await tx.boards.requireEditor(boardId);

  // R2 keys returned by parseUrl are namespaced `items/{uploaderUserId}/...`.
  // Reject any r2-kind image whose owner segment doesn't match the caller,
  // so a client can't pass a key scraped from another user's parse and
  // attach those bytes to a board.
  for (const img of input.images) {
    if (img.kind === 'r2' && r2KeyOwner(img.key) !== tx.scope.userId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Image key not owned by caller',
      });
    }
  }

  const now = nowSec();
  const placementId = genId();
  const imageIds = input.images.map(() => genId());

  tx.placements.stageInsert({
    id: placementId,
    boardId,
    addedBy: tx.scope.userId,
    sourceUrl: input.sourceUrl,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    // currency falls back to the column default 'USD' when the parser
    // didn't extract one.
    ...(input.currency ? { currency: input.currency } : {}),
    details: input.details.length > 0 ? input.details : null,
    x: input.x,
    y: input.y,
    width: DEFAULT_CARD_WIDTH,
    height: DEFAULT_CARD_HEIGHT,
    zIndex: INITIAL_Z_INDEX,
    createdAt: now,
    updatedAt: now,
  });

  if (input.images.length > 0) {
    tx.boardItemImages.stageInsertMany(
      input.images.map((img, i) => ({
        id: imageIds[i],
        boardItemId: placementId,
        r2Key: toR2Key(img),
        sourceUrl: img.sourceUrl,
        displayOrder: i,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  // Construct the response in memory from inputs + generated IDs. Same
  // reason as before the fold: D1 can't see staged writes mid-Tx.
  return {
    id: placementId,
    title: input.title,
    brand: input.brand,
    description: input.description,
    price: input.price,
    currency: input.currency ?? 'USD',
    details: input.details,
    images: input.images.map((img, i) => ({ id: imageIds[i], image: img })),
    sourceUrl: input.sourceUrl,
    addedAt: now,
    addedBy: tx.scope.userId,
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
  await stagePurge(tx, [placement.id]);
}

export async function emptyBoardTrash(tx: Tx, boardId: string): Promise<void> {
  await tx.boards.requireEditor(boardId);
  const trashed = await tx.placements.listTrashIdsForBoard(boardId);
  if (trashed.length === 0) {
    return;
  }
  await stagePurge(tx, trashed);
}

// Stages the SQL writes for a hard-purge of the given placements + their
// R2 blob cleanup. After the fold, there's no orphan-item accounting:
// board_item_images cascades on placement delete, so a single hard delete
// against board_items is enough. Blob cleanup runs after the SQL commit.
export async function stagePurge(
  tx: Tx,
  placementIds: string[],
): Promise<void> {
  if (placementIds.length === 0) {
    return;
  }
  const images =
    await tx.boardItemImages.findForBoardItemsIncludingTrashed(placementIds);
  tx.placements.stageHardDeleteMany(placementIds);
  if (images.length) {
    tx.scheduleBlobCleanup(images);
  }
}

// ---------- placement-keyed item-edit ops (formerly in services/items.ts) ----------

export async function setPrimaryImage(
  tx: Tx,
  placementId: string,
  imageId: string | null,
): Promise<void> {
  await tx.placements.byIdOrThrow(placementId);
  if (imageId !== null) {
    const owned = await tx.boardItemImages.findByBoardItemAndId(
      placementId,
      imageId,
    );
    if (!owned) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Image ${imageId} does not belong to ${placementId}`,
      });
    }
  }
  tx.placements.stageUpdate(placementId, {
    primaryImageId: imageId,
    updatedAt: nowSec(),
  });
}

export type ReparseResult = {
  id: string;
  updated: {
    title: boolean;
    brand: boolean;
    description: boolean;
    price: boolean;
    details: boolean;
  };
  imageCount: number;
};

function detailsEqual(
  a: Array<{ label: string; value: string }> | null | undefined,
  b: Array<{ label: string; value: string }> | null | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (d, i) => d.label === right[i].label && d.value === right[i].value,
  );
}

// Re-fetch the placement's sourceUrl, run it through the parser, and
// update the placement + its images in place. Access is board-scoped:
// any editor on the board can refresh metadata for any placement,
// regardless of who originally added it. New image blobs go under the
// caller's R2 prefix; old blobs are scheduled for cleanup after commit.
export async function reparseItem(
  tx: Tx,
  placementId: string,
  anthropicKey: string,
): Promise<ReparseResult> {
  const placement = await tx.placements.byIdOrThrow(placementId);

  const { meta } = await fetchAndParseMeta(placement.sourceUrl, anthropicKey);

  const nextDetails = meta.details.length > 0 ? meta.details : null;
  const updated = {
    title: meta.title !== null && meta.title !== placement.title,
    brand: meta.brand !== null && meta.brand !== placement.brand,
    description:
      meta.description !== null && meta.description !== placement.description,
    price: meta.price !== null && meta.price !== placement.price,
    details:
      meta.details.length > 0 && !detailsEqual(nextDetails, placement.details),
  };

  const now = nowSec();
  const baseUpdate = {
    title: meta.title ?? placement.title,
    brand: meta.brand ?? placement.brand,
    description: meta.description ?? placement.description,
    price: meta.price ?? placement.price,
    currency: meta.currency ?? placement.currency,
    details: nextDetails ?? placement.details,
    updatedAt: now,
  };

  if (meta.imageUrls.length === 0) {
    tx.placements.stageUpdate(placementId, baseUpdate);
    return { id: placementId, updated, imageCount: 0 };
  }

  const existing = await tx.boardItemImages.listForBoardItem(placementId);

  const existingSrcs = existing.map((img) => img.sourceUrl);
  const sourceUrlsMatch =
    existingSrcs.length === meta.imageUrls.length &&
    existingSrcs.every((s, i) => s === meta.imageUrls[i]);

  if (sourceUrlsMatch) {
    tx.placements.stageUpdate(placementId, baseUpdate);
    return { id: placementId, updated, imageCount: existing.length };
  }

  // R2 writes before SQL: SQL inserts need the new keys; a crash here
  // leaves orphan blobs (GC-able) rather than rows pointing at missing
  // bytes. Uploaded under the CALLER's r2 prefix, even when reparsing a
  // placement someone else originally added — uploader provenance is the
  // R2 boundary, not the placement boundary.
  const stored = (
    await mapLimit(meta.imageUrls, IMAGE_FETCH_CONCURRENCY, (src) =>
      storeImage(tx.r2, tx.scope.userId, src),
    )
  ).filter((s) => s !== null);
  const newIds = stored.map(() => genId());

  // Preserve primary across reparse when the same source URL is still present.
  const prevPrimary = placement.primaryImageId
    ? existing.find((img) => img.id === placement.primaryImageId)
    : null;
  const reboundPrimaryId = prevPrimary?.sourceUrl
    ? (newIds[stored.findIndex((s) => s.sourceUrl === prevPrimary.sourceUrl)] ??
      null)
    : null;

  tx.placements.stageUpdate(placementId, {
    ...baseUpdate,
    primaryImageId: reboundPrimaryId,
  });
  tx.boardItemImages.stageHardDeleteAllForBoardItem(placementId);
  tx.boardItemImages.stageInsertMany(
    stored.map((s, i) => ({
      id: newIds[i],
      boardItemId: placementId,
      r2Key: toR2Key(s),
      sourceUrl: s.sourceUrl,
      displayOrder: i,
      createdAt: now,
      updatedAt: now,
    })),
  );
  tx.scheduleBlobCleanup(existing);

  return { id: placementId, updated, imageCount: meta.imageUrls.length };
}
