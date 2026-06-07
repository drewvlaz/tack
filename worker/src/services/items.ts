import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import { storeImage, toR2Key } from './images';
import { commitWithBlobCleanup } from './itemImages';
import { fetchAndParseMeta } from './parser';

export async function setPrimaryImage(
  db: Db,
  itemId: string,
  imageId: string | null,
): Promise<void> {
  if (imageId !== null) {
    const owned = await db.query.itemImages.findFirst({
      where: and(
        eq(schema.itemImages.id, imageId),
        eq(schema.itemImages.itemId, itemId),
        isNull(schema.itemImages.deletedAt),
      ),
    });
    if (!owned)
      throw new Error(`Image ${imageId} does not belong to ${itemId}`);
  }
  await db
    .update(schema.items)
    .set({ primaryImageId: imageId, updatedAt: nowSec() })
    .where(eq(schema.items.id, itemId));
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
  if (left.length !== right.length) return false;
  return left.every(
    (d, i) => d.label === right[i].label && d.value === right[i].value,
  );
}

export async function reparseItem(
  db: Db,
  imagesR2: R2Bucket,
  itemId: string,
  anthropicKey: string,
): Promise<ReparseResult> {
  const item = await db.query.items.findFirst({
    where: and(eq(schema.items.id, itemId), isNull(schema.items.deletedAt)),
  });
  if (!item) throw new Error(`Item not found: ${itemId}`);

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

  function buildItemUpdate(primaryImageId: string | null | undefined) {
    const set: Record<string, unknown> = {
      title: meta.title ?? item!.title,
      brand: meta.brand ?? item!.brand,
      description: meta.description ?? item!.description,
      price: meta.price ?? item!.price,
      details: nextDetails ?? item!.details,
      updatedAt: now,
    };
    if (primaryImageId !== undefined) set.primaryImageId = primaryImageId;
    return db.update(schema.items).set(set).where(eq(schema.items.id, itemId));
  }

  if (meta.imageUrls.length === 0) {
    await buildItemUpdate(undefined);
    return { id: itemId, updated, imageCount: 0 };
  }

  const existing = await db.query.itemImages.findMany({
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
    await buildItemUpdate(undefined);
    return { id: itemId, updated, imageCount: existing.length };
  }

  // R2 writes before SQL: SQL inserts need the new keys, and a crash here
  // leaves orphan blobs (GC-able) rather than rows pointing at missing bytes.
  const stored = (
    await Promise.all(meta.imageUrls.map((src) => storeImage(imagesR2, src)))
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

  await commitWithBlobCleanup(
    imagesR2,
    () =>
      db.batch([
        buildItemUpdate(reboundPrimaryId),
        db
          .delete(schema.itemImages)
          .where(eq(schema.itemImages.itemId, itemId)),
        db.insert(schema.itemImages).values(
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
      ]),
    existing,
  );

  return { id: itemId, updated, imageCount: meta.imageUrls.length };
}
