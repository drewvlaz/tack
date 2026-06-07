import { deleteStoredImage, fromR2Key } from './images';

// Encodes the invariant for any operation that touches item_images and their
// backing R2 blobs: R2 deletes happen ONLY after the SQL operation that drops
// the references has committed. A failure during R2 cleanup leaves orphan blobs
// (GC-able); the inverse — rows pointing at missing bytes — must never occur.
//
// The "R2 first on writes" rule is enforced naturally: SQL inserts need the R2
// keys, so uploads must precede the batch. No helper needed for that side.

type ImageRow = { r2Key: string; sourceUrl: string | null };

// Runs the SQL commit, then deletes the listed R2 blobs. If `commit` throws,
// cleanup is skipped and the blobs remain referenced. R2 cleanup is best-effort:
// failures are logged in `deleteStoredImage` but do not throw.
export async function commitWithBlobCleanup(
  imagesR2: R2Bucket,
  commit: () => Promise<unknown>,
  blobsToDelete: ImageRow[],
): Promise<void> {
  await commit();
  // Parallel cleanup — deleteStoredImage is best-effort and never throws, so
  // Promise.all here can't reject. Sequential was a ~12× round-trip tax on
  // requests that purge an item with a full image gallery.
  await Promise.all(
    blobsToDelete.map((row) =>
      deleteStoredImage(imagesR2, fromR2Key(row.r2Key, row.sourceUrl ?? '')),
    ),
  );
}
