import type { BatchItem } from 'drizzle-orm/batch';
import { deleteStoredImage, fromR2Key } from '../services/images';
import type { Db } from './client';
import {
  BoardsReadRepo,
  BoardsTxRepo,
  ItemImagesReadRepo,
  ItemImagesTxRepo,
  ItemsReadRepo,
  ItemsTxRepo,
  PlacementsReadRepo,
  PlacementsTxRepo,
} from './repos';

// One drizzle statement that can be passed to `db.batch([...])`.
export type BatchStatement = BatchItem<'sqlite'>;

export type BlobRef = { r2Key: string; sourceUrl: string | null };

// Identity of the caller, attached to every Tx and to read-only ServiceCtx.
// Repos read this to filter queries / stamp writes — services never accept a
// userId as a free parameter.
export type Scope = { userId: string };

// Read-only handle. Exposes one scoped repo per owned table; services do
// list/get through `ctx.boards`, `ctx.items`, etc. instead of constructing
// drizzle calls directly. Reaching past these accessors to `ctx.db` is a
// smell — see .claude/skills/service-design.
export class ServiceCtx {
  readonly boards: BoardsReadRepo;
  readonly items: ItemsReadRepo;
  readonly placements: PlacementsReadRepo;
  readonly itemImages: ItemImagesReadRepo;

  constructor(
    public readonly db: Db,
    public readonly r2: R2Bucket,
    public readonly scope: Scope,
  ) {
    this.boards = new BoardsReadRepo(db, scope);
    this.items = new ItemsReadRepo(db, scope);
    this.placements = new PlacementsReadRepo(db, scope);
    this.itemImages = new ItemImagesReadRepo(db, scope);
  }
}

// Logical transaction handle. Services that mutate take `tx: Tx`; the per-
// table repos auto-stamp ownerId on insert and auto-AND the scope filter on
// every read/update/delete, so a forgetful caller can't leak across users.
// Writes are STAGED (recorded in an accumulator) but not executed; reads
// pass through directly. `withTransaction` commits everything in one
// `db.batch([...])` at the boundary — D1's only atomic primitive.
//
// On D1 this is a one-batch-at-commit abstraction. On Durable Object SQLite
// storage (future, for collab) the same shape will wrap a real interactive
// transaction without changing service signatures.
export class Tx {
  private readonly statements: BatchStatement[] = [];
  private readonly blobsToDelete: BlobRef[] = [];

  readonly boards: BoardsTxRepo;
  readonly items: ItemsTxRepo;
  readonly placements: PlacementsTxRepo;
  readonly itemImages: ItemImagesTxRepo;

  constructor(
    public readonly db: Db,
    public readonly r2: R2Bucket,
    public readonly scope: Scope,
  ) {
    this.boards = new BoardsTxRepo(this);
    this.items = new ItemsTxRepo(this);
    this.placements = new PlacementsTxRepo(this);
    this.itemImages = new ItemImagesTxRepo(this);
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
