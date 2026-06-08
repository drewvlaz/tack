import type { BatchItem } from 'drizzle-orm/batch';
import { deleteStoredImage, fromR2Key } from '../services/images';
import type { Db } from './client';

// One drizzle statement that can be passed to `db.batch([...])`.
export type BatchStatement = BatchItem<'sqlite'>;

export type BlobRef = { r2Key: string; sourceUrl: string | null };

// Identity of the caller, attached to every Tx and to read-only ServiceCtx.
// Services read this to filter queries / stamp writes — they never accept a
// userId as a free parameter.
export type Scope = { userId: string };

// Read-only service handle. Carries the same scope as Tx so list/get
// services can apply ownership filters without taking userId out-of-band.
export type ServiceCtx = { db: Db; r2: R2Bucket; scope: Scope };

// Logical transaction handle. Services that mutate take `tx: Tx` instead of
// `db: Db`. Writes are STAGED (recorded in an accumulator) but not executed;
// reads pass through directly. `withTransaction` commits everything in one
// `db.batch([...])` at the boundary — D1's only atomic primitive.
//
// On D1 this is a one-batch-at-commit abstraction. On Durable Object SQLite
// storage (future, for collab) the same shape will wrap a real interactive
// transaction without changing service signatures.
export class Tx {
  private readonly statements: BatchStatement[] = [];
  private readonly blobsToDelete: BlobRef[] = [];

  constructor(
    public readonly db: Db,
    public readonly r2: R2Bucket,
    public readonly scope: Scope,
  ) {}

  // Reads pass through. Reads issued during a Tx do NOT see writes staged
  // earlier in the same Tx — D1 doesn't commit until `withTransaction` does.
  // Pattern: do all conditional reads first, then stage writes.
  get query() {
    return this.db.query;
  }

  stage(...stmts: BatchStatement[]): void {
    this.statements.push(...stmts);
  }

  // R2 blobs to delete AFTER the SQL batch commits. Orphan-safe: if the batch
  // fails, blobs stay in R2 (the GC sweeper eventually reclaims them) rather
  // than rows pointing at missing bytes.
  scheduleBlobCleanup(blobs: BlobRef[]): void {
    this.blobsToDelete.push(...blobs);
  }

  /** @internal */
  drainStatements(): BatchStatement[] {
    return this.statements.splice(0);
  }

  /** @internal */
  drainBlobs(): BlobRef[] {
    return this.blobsToDelete.splice(0);
  }
}

export async function withTransaction<T>(
  db: Db,
  r2: R2Bucket,
  scope: Scope,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const tx = new Tx(db, r2, scope);
  // If `fn` throws, neither the SQL batch nor the R2 cleanup runs.
  const result = await fn(tx);

  const statements = tx.drainStatements();
  if (statements.length > 0) {
    await db.batch(
      statements as unknown as [BatchStatement, ...BatchStatement[]],
    );
  }

  // R2 deletes ONLY after SQL commit (or when there were no SQL writes to
  // begin with — staging blobs without writes is unusual but harmless: the
  // caller asked for those blobs to be dropped).
  const blobs = tx.drainBlobs();
  if (blobs.length > 0) {
    await Promise.all(
      blobs.map((b) =>
        deleteStoredImage(r2, fromR2Key(b.r2Key, b.sourceUrl ?? '')),
      ),
    );
  }

  return result;
}
