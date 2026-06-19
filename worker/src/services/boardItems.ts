import { TRPCError } from '@trpc/server';
import type { HydratedPlacement } from '../db/repos/placements';
import { P } from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { mapLimit } from '../lib/mapLimit';
import { nowSec } from '../lib/time';
import {
  type AddItemInput,
  type AddTextItemInput,
  type BoardItemRow,
  type PatchBoardItemInput,
  type PatchItemsManyInput,
  type PatchTextItemInput,
  type TextAlign,
} from '../schemas/board';
import { fromR2Key, r2KeyOwner, storeImage, toR2Key } from './images';
import { fetchAndParseMeta } from './parser';

const DEFAULT_CARD_WIDTH = 220;
const DEFAULT_CARD_HEIGHT = 400;
// Text card starts narrow + shrink-to-content; placement geometry can be
// patched after first paint when the renderer knows its real size.
const DEFAULT_TEXT_WIDTH = 240;
const DEFAULT_TEXT_HEIGHT = 80;
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

// Map a hydrated placement (row + images) to the domain shape. Branches on
// `kind`: null and 'product' both read as product (existing rows pre-TAC-1
// have null and must continue to work). Text rows drop images entirely.
function toBoardItemRow({
  placement,
  images,
}: HydratedPlacement): BoardItemRow {
  const placementBase = {
    id: placement.id,
    addedAt: placement.createdAt,
    addedBy: placement.addedBy,
    updatedAt: placement.updatedAt,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    zIndex: placement.zIndex,
  };
  if (placement.kind === 'text') {
    return {
      ...placementBase,
      kind: 'text',
      textContent: placement.textContent ?? '',
      textFontSize: placement.textFontSize,
      textWeight: placement.textWeight,
      textColorToken: placement.textColorToken,
      // DB column is plain text; the schema enum constrains writes, so any
      // value present came in through TextAlignSchema.
      textAlign: placement.textAlign as TextAlign | null,
    };
  }
  const sorted = sortImagesPrimaryFirst(images, placement.primaryImageId);
  return {
    ...placementBase,
    kind: 'product',
    title: placement.title,
    brand: placement.brand,
    description: placement.description,
    price: placement.price,
    currency: placement.currency,
    details: placement.details ?? [],
    sourceUrl: placement.sourceUrl,
    images: sorted.map((img) => ({
      id: img.id,
      image: fromR2Key(img.r2Key, img.sourceUrl ?? ''),
    })),
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
  const placement = await tx.placements.byIdOrThrow(id);
  await tx.boards.require(placement.boardId, P.BoardEdit);
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
  // Editor or owner can add; viewer is rejected (FORBIDDEN). Non-members
  // get NOT_FOUND so we don't leak board existence.
  await tx.boards.require(boardId, P.BoardEdit);

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

  // Drop the new card on top of the existing stack so it isn't hidden
  // behind cards the user previously brought to front.
  const maxZ = await tx.placements.maxZIndexForBoard(boardId);
  const zIndex = (maxZ ?? 0) + 1;

  const now = nowSec();
  const placementId = genId();
  const imageIds = input.images.map(() => genId());

  tx.placements.stageInsert({
    id: placementId,
    boardId,
    addedBy: tx.scope.userId,
    kind: 'product',
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
    zIndex,
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
    kind: 'product',
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
    zIndex,
  };
}

// ---------- text-kind mutations ----------

export async function addTextItem(
  tx: Tx,
  boardId: string,
  input: AddTextItemInput,
): Promise<BoardItemRow> {
  await tx.boards.require(boardId, P.BoardEdit);

  const maxZ = await tx.placements.maxZIndexForBoard(boardId);
  const zIndex = (maxZ ?? 0) + 1;
  const now = nowSec();
  const placementId = genId();

  tx.placements.stageInsert({
    id: placementId,
    boardId,
    addedBy: tx.scope.userId,
    kind: 'text',
    // ponytail: source_url is NOT NULL on the column; text items have no URL,
    // so we write '' as a sentinel. The wire shape's text variant doesn't
    // expose it. Upgrade path: make source_url nullable when another non-URL
    // kind shows up.
    sourceUrl: '',
    textContent: input.content,
    textFontSize: input.fontSize ?? null,
    textWeight: input.weight ?? null,
    textColorToken: input.colorToken ?? null,
    textAlign: input.align ?? null,
    x: input.x,
    y: input.y,
    width: DEFAULT_TEXT_WIDTH,
    height: DEFAULT_TEXT_HEIGHT,
    zIndex,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: placementId,
    kind: 'text',
    textContent: input.content,
    textFontSize: input.fontSize ?? null,
    textWeight: input.weight ?? null,
    textColorToken: input.colorToken ?? null,
    textAlign: input.align ?? null,
    addedAt: now,
    addedBy: tx.scope.userId,
    updatedAt: now,
    x: input.x,
    y: input.y,
    width: DEFAULT_TEXT_WIDTH,
    height: DEFAULT_TEXT_HEIGHT,
    zIndex,
  };
}

// Patch ONLY text-shape fields (content + style knobs). Position is reused via
// existing patchBoardItem / patchBoardItems — no kind-specific placement logic.
// Rejects non-text rows so a misrouted call from the client can't silently
// scribble text columns onto a product placement.
export async function patchTextItem(
  tx: Tx,
  id: string,
  patch: PatchTextItemInput,
): Promise<void> {
  const placement = await tx.placements.byIdOrThrow(id);
  await tx.boards.require(placement.boardId, P.BoardEdit);
  if (placement.kind !== 'text') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Not a text item',
    });
  }
  tx.placements.stageUpdate(id, {
    updatedAt: nowSec(),
    ...(patch.content !== undefined && { textContent: patch.content }),
    ...(patch.fontSize !== undefined && { textFontSize: patch.fontSize }),
    ...(patch.weight !== undefined && { textWeight: patch.weight }),
    ...(patch.colorToken !== undefined && { textColorToken: patch.colorToken }),
    ...(patch.align !== undefined && { textAlign: patch.align }),
  });
}

export async function deleteBoardItem(tx: Tx, id: string): Promise<void> {
  const placement = await tx.placements.byIdOrThrow(id);
  await tx.boards.require(placement.boardId, P.BoardEdit);
  tx.placements.stageSoftDelete(id, nowSec());
}

// Batch update — one UPDATE per patch, all flushed in the same db.batch
// commit when withTransaction returns. byIdOrThrow per entry enforces
// existence scoping; the per-placement edit check rejects viewers and
// aborts the whole transaction on any unauthorized id.
export async function patchBoardItems(
  tx: Tx,
  patches: PatchItemsManyInput['patches'],
): Promise<void> {
  const now = nowSec();
  // Cache board-level edit checks across this batch — group mutations
  // typically all hit the same board, so one role lookup per board is
  // enough.
  const checkedBoards = new Set<string>();
  for (const { id, patch } of patches) {
    const placement = await tx.placements.byIdOrThrow(id);
    if (!checkedBoards.has(placement.boardId)) {
      await tx.boards.require(placement.boardId, P.BoardEdit);
      checkedBoards.add(placement.boardId);
    }
    tx.placements.stageUpdate(id, {
      updatedAt: now,
      ...(patch.x !== undefined && { x: patch.x }),
      ...(patch.y !== undefined && { y: patch.y }),
      ...(patch.zIndex !== undefined && { zIndex: patch.zIndex }),
      ...(patch.width !== undefined && { width: patch.width }),
      ...(patch.height !== undefined && { height: patch.height }),
    });
  }
}

// Batch soft-delete — one UPDATE per id, atomic via the same accumulator.
export async function deleteBoardItems(tx: Tx, ids: string[]): Promise<void> {
  const now = nowSec();
  const checkedBoards = new Set<string>();
  for (const id of ids) {
    const placement = await tx.placements.byIdOrThrow(id);
    if (!checkedBoards.has(placement.boardId)) {
      await tx.boards.require(placement.boardId, P.BoardEdit);
      checkedBoards.add(placement.boardId);
    }
    tx.placements.stageSoftDelete(id, now);
  }
}

export async function restoreBoardItem(tx: Tx, id: string): Promise<void> {
  const placement = await tx.placements.byIdIncludingTrashedOrThrow(id);
  await tx.boards.require(placement.boardId, P.BoardEdit);
  tx.placements.stageRestore(id, nowSec());
}

export async function purgeBoardItem(tx: Tx, id: string): Promise<void> {
  const placement = await tx.placements.byIdIncludingTrashedOrThrow(id);
  await tx.boards.require(placement.boardId, P.BoardEdit);
  await stagePurge(tx, [placement.id]);
}

export async function emptyBoardTrash(tx: Tx, boardId: string): Promise<void> {
  await tx.boards.require(boardId, P.BoardEdit);
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
  const placement = await tx.placements.byIdOrThrow(placementId);
  await tx.boards.require(placement.boardId, P.BoardEdit);
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
  await tx.boards.require(placement.boardId, P.BoardEdit);
  if (placement.kind === 'text') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Cannot reparse a text item',
    });
  }

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
