import type { Db } from '../db/client';
import { log } from '../lib/log';

const R2_KEY_PREFIX = 'items/';
const R2_LIST_PAGE = 1000;
// Skip blobs younger than this — they may have been uploaded by an in-flight
// `parseUrl` whose `addItem` hasn't landed yet. Anything older than 30 minutes
// without a referencing row is a genuine orphan.
const GRACE_MS = 30 * 60 * 1000;

export type SweepResult = {
  scanned: number;
  deleted: number;
  skippedTooNew: number;
};

export async function sweepOrphanR2Blobs(
  db: Db,
  imagesR2: R2Bucket,
  now: Date,
): Promise<SweepResult> {
  // Load every referenced r2_key into memory. The set is bounded by the size
  // of `board_item_images` — order of 10² to 10⁴ rows is fine. If this grows
  // past ~1M rows we'd flip the loop (paginate keys, query DB per page).
  const rows = await db.query.boardItemImages.findMany({
    columns: { r2Key: true },
  });
  const referenced = new Set(
    rows.map((r) => r.r2Key).filter((k) => k.startsWith(R2_KEY_PREFIX)),
  );

  const cutoff = now.getTime() - GRACE_MS;
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;
  let skippedTooNew = 0;
  const toDelete: string[] = [];

  do {
    const page = await imagesR2.list({
      prefix: R2_KEY_PREFIX,
      cursor,
      limit: R2_LIST_PAGE,
    });
    scanned += page.objects.length;
    for (const obj of page.objects) {
      if (referenced.has(obj.key)) {
        continue;
      }
      if (obj.uploaded.getTime() > cutoff) {
        skippedTooNew++;
        continue;
      }
      toDelete.push(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // Sequential per-key delete. Slower than parallel, but the GC sweep is a
  // background job — wall-clock isn't critical, and sequential keeps any one
  // R2 hiccup from affecting the others.
  for (const key of toDelete) {
    try {
      await imagesR2.delete(key);
      deleted++;
    } catch (err) {
      log.warn(`R2 delete failed during GC for ${key}:`, err);
    }
  }

  log.info(
    `R2 GC sweep: scanned=${scanned} deleted=${deleted} skippedTooNew=${skippedTooNew}`,
  );
  return { scanned, deleted, skippedTooNew };
}
