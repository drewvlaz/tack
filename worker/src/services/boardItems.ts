import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import {
  type AddItemInput,
  type BoardItemRow,
  type PatchBoardItemInput,
} from '../schemas/board';
import { assertBoardOwned } from './boards';
import { fromR2Key, toR2Key } from './images';

const DEFAULT_CARD_WIDTH = 220;
const DEFAULT_CARD_HEIGHT = 280;
const INITIAL_Z_INDEX = 0;

// ---------- reads (no Tx; read-only) ----------

export async function listBoardItems(
  ctx: ServiceCtx,
  boardId: string,
): Promise<BoardItemRow[]> {
  return queryBoardItems(
    ctx.db,
    and(
      eq(schema.boardItems.boardId, boardId),
      eq(schema.boards.ownerId, ctx.scope.userId),
      isNull(schema.boardItems.deletedAt),
    ),
  );
}

export async function listTrashedBoardItems(
  ctx: ServiceCtx,
  boardId: string,
): Promise<BoardItemRow[]> {
  return queryBoardItems(
    ctx.db,
    and(
      eq(schema.boardItems.boardId, boardId),
      eq(schema.boards.ownerId, ctx.scope.userId),
      isNotNull(schema.boardItems.deletedAt),
    ),
  );
}

// Single source of truth for the BoardItemRow shape. Callers compose their own
// where clause; the join + row→domain mapping lives here only. Images are
// returned as `StoredImage` refs — URL construction is a transport concern
// owned by `routers/boards.ts`.
async function queryBoardItems(
  db: Db,
  where: SQL | undefined,
): Promise<BoardItemRow[]> {
  // INNER JOIN to boards so callers can compose `boards.ownerId = ...`
  // predicates in `where`. Drizzle's relational query API doesn't expose the
  // joined columns in `where`, so we drop to the core builder for the join
  // and re-fetch images in a second query.
  const rows = await db
    .select({ bi: schema.boardItems, item: schema.items })
    .from(schema.boardItems)
    .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
    .innerJoin(schema.items, eq(schema.items.id, schema.boardItems.itemId))
    .where(where);

  if (rows.length === 0) {
    return [];
  }

  const itemIds = [...new Set(rows.map((r) => r.item.id))];
  const images = await db.query.itemImages.findMany({
    where: and(
      inArray(schema.itemImages.itemId, itemIds),
      isNull(schema.itemImages.deletedAt),
    ),
    orderBy: asc(schema.itemImages.displayOrder),
  });
  const imagesByItem = new Map<string, typeof images>();
  for (const img of images) {
    const list = imagesByItem.get(img.itemId);
    if (list) {
      list.push(img);
    } else {
      imagesByItem.set(img.itemId, [img]);
    }
  }

  return rows
    .filter(({ item }) => item.deletedAt === null)
    .map(({ bi, item }): BoardItemRow => {
      const sortedImages = sortImagesPrimaryFirst(
        imagesByItem.get(item.id) ?? [],
        item.primaryImageId,
      );
      return {
        id: bi.id,
        itemId: bi.itemId,
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
        addedAt: bi.createdAt,
        updatedAt: item.updatedAt,
        x: bi.x,
        y: bi.y,
        width: bi.width,
        height: bi.height,
        zIndex: bi.zIndex,
      };
    });
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
  await assertPlacementOwned(tx, id);
  const update = {
    updatedAt: nowSec(),
    ...(patch.x !== undefined && { x: patch.x }),
    ...(patch.y !== undefined && { y: patch.y }),
    ...(patch.zIndex !== undefined && { zIndex: patch.zIndex }),
    ...(patch.width !== undefined && { width: patch.width }),
    ...(patch.height !== undefined && { height: patch.height }),
  };
  tx.stage(
    tx.db
      .update(schema.boardItems)
      .set(update)
      .where(eq(schema.boardItems.id, id)),
  );
}

export async function addBoardItem(
  tx: Tx,
  boardId: string,
  input: AddItemInput,
): Promise<BoardItemRow> {
  await assertBoardOwned(tx, boardId);
  const now = nowSec();
  const itemId = genId();
  const boardItemId = genId();
  const imageIds = input.images.map(() => genId());

  tx.stage(
    tx.db.insert(schema.items).values({
      id: itemId,
      ownerId: tx.scope.userId,
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
    }),
  );

  if (input.images.length > 0) {
    tx.stage(
      tx.db.insert(schema.itemImages).values(
        input.images.map((img, i) => ({
          id: imageIds[i],
          itemId,
          r2Key: toR2Key(img),
          sourceUrl: img.sourceUrl,
          displayOrder: i,
          createdAt: now,
          updatedAt: now,
        })),
      ),
    );
  }

  tx.stage(
    tx.db.insert(schema.boardItems).values({
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
    }),
  );

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
  await assertPlacementOwned(tx, id);
  const now = nowSec();
  tx.stage(
    tx.db
      .update(schema.boardItems)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.boardItems.id, id)),
  );
}

export async function restoreBoardItem(tx: Tx, id: string): Promise<void> {
  await assertPlacementOwned(tx, id);
  tx.stage(
    tx.db
      .update(schema.boardItems)
      .set({ deletedAt: null, updatedAt: nowSec() })
      .where(eq(schema.boardItems.id, id)),
  );
}

export async function purgeBoardItem(tx: Tx, id: string): Promise<void> {
  const placement = await tx.query.boardItems.findFirst({
    where: eq(schema.boardItems.id, id),
  });
  if (!placement) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  await assertBoardOwned(tx, placement.boardId);
  await stagePurge(tx, [placement.id], [placement.itemId]);
}

export async function emptyBoardTrash(tx: Tx, boardId: string): Promise<void> {
  await assertBoardOwned(tx, boardId);
  const trashed = await tx.query.boardItems.findMany({
    where: and(
      eq(schema.boardItems.boardId, boardId),
      isNotNull(schema.boardItems.deletedAt),
    ),
  });
  if (trashed.length === 0) {
    return;
  }
  await stagePurge(
    tx,
    trashed.map((p) => p.id),
    trashed.map((p) => p.itemId),
  );
}

// Confirms the placement exists AND its parent board belongs to the current
// scope. Throws NOT_FOUND otherwise (so we don't leak existence of other
// users' placements as FORBIDDEN). Mutations call this before staging writes.
async function assertPlacementOwned(
  tx: Tx,
  placementId: string,
): Promise<void> {
  const row = await tx.db
    .select({ id: schema.boardItems.id })
    .from(schema.boardItems)
    .innerJoin(schema.boards, eq(schema.boards.id, schema.boardItems.boardId))
    .where(
      and(
        eq(schema.boardItems.id, placementId),
        eq(schema.boards.ownerId, tx.scope.userId),
      ),
    )
    .limit(1);
  if (row.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
}

// Stages the SQL writes for a hard-purge of the given placements + any items
// that become orphans + their R2 blob cleanup. Reads are done eagerly to
// compute orphans; writes accumulate in the Tx and commit at the boundary.
// Callers (e.g. `deleteBoard`) can stage additional statements afterward so
// the entire procedure still commits in one batch.
//
// Caller is responsible for ownership checks. This function trusts every id
// passed in has already been authorized.
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

  const allPlacements = await tx.query.boardItems.findMany({
    where: inArray(schema.boardItems.itemId, uniqueItemIds),
    columns: { id: true, itemId: true },
  });
  const stillReferenced = new Set(
    allPlacements.filter((p) => !placementIdSet.has(p.id)).map((p) => p.itemId),
  );
  const orphanItemIds = uniqueItemIds.filter(
    (iid) => !stillReferenced.has(iid),
  );

  const orphanImages = orphanItemIds.length
    ? await tx.query.itemImages.findMany({
        where: inArray(schema.itemImages.itemId, orphanItemIds),
      })
    : [];

  tx.stage(
    tx.db
      .delete(schema.boardItems)
      .where(inArray(schema.boardItems.id, placementIds)),
  );
  if (orphanItemIds.length) {
    tx.stage(
      tx.db.delete(schema.items).where(inArray(schema.items.id, orphanItemIds)),
    );
  }
  if (orphanImages.length) {
    tx.scheduleBlobCleanup(orphanImages);
  }
}
