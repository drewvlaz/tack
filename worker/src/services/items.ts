import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import { genId } from '../lib/id';
import { deleteStoredImage, storeImage } from './images';
import { fetchAndParseMeta } from './parser';

export type ReparseResult = {
  id: string;
  updated: {
    title: boolean;
    brand: boolean;
    description: boolean;
    price: boolean;
  };
  imageCount: number;
};

export async function reparseItem(
  db: Db,
  imagesR2: R2Bucket,
  itemId: string,
  anthropicKey: string,
): Promise<ReparseResult> {
  const item = await db.query.items.findFirst({
    where: eq(schema.items.id, itemId),
  });
  if (!item) throw new Error(`Item not found: ${itemId}`);

  const meta = await fetchAndParseMeta(item.sourceUrl, anthropicKey);

  const updated = {
    title: meta.title !== null && meta.title !== item.title,
    brand: meta.brand !== null && meta.brand !== item.brand,
    description:
      meta.description !== null && meta.description !== item.description,
    price: meta.price !== null && meta.price !== item.price,
  };

  const now = Math.floor(Date.now() / 1000);

  await db
    .update(schema.items)
    .set({
      title: meta.title ?? item.title,
      brand: meta.brand ?? item.brand,
      description: meta.description ?? item.description,
      price: meta.price ?? item.price,
      updatedAt: now,
    })
    .where(eq(schema.items.id, itemId));

  if (meta.imageUrls.length > 0) {
    const existing = await db.query.itemImages.findMany({
      where: eq(schema.itemImages.itemId, itemId),
    });
    for (const img of existing) {
      await deleteStoredImage(imagesR2, img.r2Key);
    }
    await db
      .delete(schema.itemImages)
      .where(eq(schema.itemImages.itemId, itemId));

    const stored = await Promise.all(
      meta.imageUrls.map((src) => storeImage(imagesR2, src)),
    );
    for (let i = 0; i < stored.length; i++) {
      await db.insert(schema.itemImages).values({
        id: genId(),
        itemId,
        r2Key: stored[i].r2Key,
        sourceUrl: stored[i].sourceUrl,
        displayOrder: i,
        createdAt: now,
      });
    }
  }

  return { id: itemId, updated, imageCount: meta.imageUrls.length };
}
