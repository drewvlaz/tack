import { and, asc, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { storeImage, toR2Key } from './images';
import { fetchAndParseMeta, mapLimit } from './parser';

const IMAGE_FETCH_CONCURRENCY = 4;

export async function setPrimaryImage(
  tx: Tx,
  itemId: string,
  imageId: string | null,
): Promise<void> {
  if (imageId !== null) {
    const owned = await tx.query.itemImages.findFirst({
      where: and(
        eq(schema.itemImages.id, imageId),
        eq(schema.itemImages.itemId, itemId),
        isNull(schema.itemImages.deletedAt),
      ),
    });
    if (!owned) {
      // Throws before staging — Tx accumulates nothing, commit never runs.
      throw new Error(`Image ${imageId} does not belong to ${itemId}`);
    }
  }
  tx.stage(
    tx.db
      .update(schema.items)
      .set({ primaryImageId: imageId, updatedAt: nowSec() })
      .where(eq(schema.items.id, itemId)),
  );
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

export async function reparseItem(
  tx: Tx,
  itemId: string,
  anthropicKey: string,
): Promise<ReparseResult> {
  const item = await tx.query.items.findFirst({
    where: and(eq(schema.items.id, itemId), isNull(schema.items.deletedAt)),
  });
  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const { meta } = await fetchAndParseMeta(item.sourceUrl, anthropicKey);

  const nextDetails = meta.details.length > 0 ? meta.details : null;
  const updated = {
    title: meta.title !== null && meta.title !== item.title,
    brand: meta.brand !== null && meta.brand !== item.brand,
    description:
      meta.description !== null && meta.description !== item.description,
    price: meta.price !== null && meta.price !== item.price,
    details:
      meta.details.length > 0 && !detailsEqual(nextDetails, item.details),
  };

  const now = nowSec();

  function itemUpdate(primaryImageId: string | null | undefined) {
    const set: Record<string, unknown> = {
      title: meta.title ?? item!.title,
      brand: meta.brand ?? item!.brand,
      description: meta.description ?? item!.description,
      price: meta.price ?? item!.price,
      currency: meta.currency ?? item!.currency,
      details: nextDetails ?? item!.details,
      updatedAt: now,
    };
    if (primaryImageId !== undefined) {
      set.primaryImageId = primaryImageId;
    }
    return tx.db
      .update(schema.items)
      .set(set)
      .where(eq(schema.items.id, itemId));
  }

  if (meta.imageUrls.length === 0) {
    tx.stage(itemUpdate(undefined));
    return { id: itemId, updated, imageCount: 0 };
  }

  const existing = await tx.query.itemImages.findMany({
    where: and(
      eq(schema.itemImages.itemId, itemId),
      isNull(schema.itemImages.deletedAt),
    ),
    orderBy: asc(schema.itemImages.displayOrder),
  });

  const existingSrcs = existing.map((img) => img.sourceUrl);
  const sourceUrlsMatch =
    existingSrcs.length === meta.imageUrls.length &&
    existingSrcs.every((s, i) => s === meta.imageUrls[i]);

  if (sourceUrlsMatch) {
    tx.stage(itemUpdate(undefined));
    return { id: itemId, updated, imageCount: existing.length };
  }

  // R2 writes before SQL: SQL inserts need the new keys, and a crash here
  // leaves orphan blobs (GC-able) rather than rows pointing at missing bytes.
  const stored = (
    await mapLimit(meta.imageUrls, IMAGE_FETCH_CONCURRENCY, (src) =>
      storeImage(tx.r2, src),
    )
  ).filter((s) => s !== null);
  const newIds = stored.map(() => genId());

  // Preserve primary across reparse when the same source URL is still present.
  const prevPrimary = item.primaryImageId
    ? existing.find((img) => img.id === item.primaryImageId)
    : null;
  const reboundPrimaryId = prevPrimary?.sourceUrl
    ? (newIds[stored.findIndex((s) => s.sourceUrl === prevPrimary.sourceUrl)] ??
      null)
    : null;

  tx.stage(
    itemUpdate(reboundPrimaryId),
    tx.db.delete(schema.itemImages).where(eq(schema.itemImages.itemId, itemId)),
    tx.db.insert(schema.itemImages).values(
      stored.map((s, i) => ({
        id: newIds[i],
        itemId,
        r2Key: toR2Key(s),
        sourceUrl: s.sourceUrl,
        displayOrder: i,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  );
  tx.scheduleBlobCleanup(existing);

  return { id: itemId, updated, imageCount: meta.imageUrls.length };
}
