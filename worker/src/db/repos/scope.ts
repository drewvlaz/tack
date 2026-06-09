import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema';
import type { Scope } from '../tx';

// Repo-level predicates for the collab access model. The unit of sharing is
// the BOARD: a caller can access a board's content when they are either the
// owner (boards.ownerId) OR have an active (non-soft-removed) row in
// board_members. These helpers center on boards membership; downstream
// transitive scopes (placements, itemImages) compose by `inArray(boardId,
// accessible...BoardIds(...))`.
//
// What stays owner-only: write operations against the boards table itself
// (rename, soft-delete, restore, hard-delete). Editors don't get to mutate
// board metadata or kill the board. Those callsites use owner-only
// predicates directly (`eq(boards.ownerId, scope.userId)`); this module
// exposes ACCESS predicates, not owner-only ones.
//
// What stays uploader-only: items + itemImages. An item record belongs to
// whoever uploaded it; Bob viewing Alice's shared board sees Alice's items
// through the placements join, but the items repo itself still scopes by
// items.ownerId == caller for any direct read or write. Cross-uploader
// mutation flows (reparse, setPrimaryImage) are deliberately uploader-only.

// Predicate on a row of the `boards` table — true when the caller is owner
// OR an active member. Does NOT include a deletedAt filter; compose at the
// callsite based on whether you want trash-aware behavior.
export function accessibleBoardsWhere(db: Db, scope: Scope): SQL {
  // The non-null assertion holds because `or` with at least one defined
  // argument always returns a non-undefined SQL fragment. drizzle's types
  // are conservatively loose here.
  return or(
    eq(schema.boards.ownerId, scope.userId),
    inArray(
      schema.boards.id,
      db
        .select({ id: schema.boardMembers.boardId })
        .from(schema.boardMembers)
        .where(
          and(
            eq(schema.boardMembers.userId, scope.userId),
            isNull(schema.boardMembers.deletedAt),
          ),
        ),
    ),
  )!;
}

// Subquery: ids of every board the caller can access AND that is not
// trashed. Used by placements / itemImages as the right-hand side of
// `inArray(parent.boardId, ...)`. The wrapping SELECT is required because
// drizzle's `inArray` needs a subquery shape, not a raw predicate.
export function accessibleActiveBoardIds(db: Db, scope: Scope) {
  return db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(
      and(accessibleBoardsWhere(db, scope), isNull(schema.boards.deletedAt)),
    );
}

// Subquery: ids of every accessible board, active or trashed. Used by
// restore / purge flows that need to reach into the trash.
export function accessibleAnyBoardIds(db: Db, scope: Scope) {
  return db
    .select({ id: schema.boards.id })
    .from(schema.boards)
    .where(accessibleBoardsWhere(db, scope));
}
