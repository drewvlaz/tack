---
name: service-design
description: Author and review service code in worker/src/services/. Enforces the layering rules (routers → services → db), the Tx vs ServiceCtx split, ownership scoping, R2/SQL ordering, and the composition primitives that let services stack into one atomic commit. Load whenever adding a new service, editing an existing one, refactoring a router, or reviewing a service-layer diff.
---

# Service design

The worker's service layer is the place where _real_ logic lives. Routers are thin (parse + delegate); the DB and R2 are dumb byte stores; services are the load-bearing middle. This skill is the contract that keeps that middle layer composable.

The single biggest failure mode is **knowledge leakage** — a service that knows the request shape, a router that knows a SQL column, an image helper that knows about boards. When this skill says "must not know", that is a hard rule, not a suggestion.

## Who knows what

Read this as a one-way arrow: a layer below never imports from a layer above.

```
   routers/        ← knows: zod input shape, services, wire types
       │           knows NOT: drizzle, schema columns, SQL, R2, anthropic
       ▼
   services/       ← knows: drizzle, schema, R2 keys, sibling services
       │           knows NOT: tRPC context, Hono, zod input schemas, wire URLs
       ▼
   db/, lib/       ← knows: only itself + types
                   knows NOT: any specific service or table semantics
```

Things to grep for as smells:

| Smell                                                                             | What it means                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `import { TRPCError }` outside `services/`, `trpc/`, and `db/repos/`              | A non-service / non-repo file is making auth/auth decisions. Move the throw into the service or `repo.byIdOrThrow`.                                                                                                      |
| `ctx.images` / `ctx.db` passed into a service alongside another service           | The router is reaching past the service abstraction. Services take `Tx` or `ServiceCtx`, never raw bindings.                                                                                                             |
| `imageDisplayUrl(...)` called inside `services/`                                  | Wire URL construction has leaked into the domain. The service returns `StoredImage` refs; the router (`toBoardItemWire`) is the only place URLs are built.                                                               |
| `userId: string` parameter on a service function                                  | Scope must come from `tx.scope` or `ctx.scope`, never as a free arg. Free `userId` args invite "trust the caller" bugs.                                                                                                  |
| `db.batch(...)` outside `db/tx.ts`                                                | Atomic-commit is the Tx's job. Direct `db.batch` calls skip the staging accumulator and break cross-service composition.                                                                                                 |
| `await tx.db.insert/update/delete(...)` (not wrapped in `tx.stage`)               | A mutation that runs immediately, outside the atomic commit. If a later stage throws, this write is already durable.                                                                                                     |
| `tx.db.query.<owned-table>` / `ctx.db.query.<owned-table>` in `services/`         | Bypassing the scoped repo. Reads on `boards`, `items`, `board_items`, `item_images` go through `tx.boards` / `tx.items` / `tx.placements` / `tx.itemImages`. Direct drizzle on these tables removes the scope guarantee. |
| `eq(schema.boards.ownerId, ...)` / `eq(schema.items.ownerId, ...)` in `services/` | Hand-rolled ownership filter. The repo already does this; calling it via the repo means future devs can't forget. The exception is `db/repos/*.ts` itself.                                                               |
| `tx.stage(tx.db.insert/update/delete(schema.<owned-table>)...)` in `services/`    | Hand-rolled mutation against an owned table. Use `tx.<repo>.stageInsert/stageUpdate/stageDelete` so the scope filter / ownerId stamp can't be skipped.                                                                   |

## The two service shapes

There are exactly two:

### Read-only: `ServiceCtx`

```ts
export async function listBoardItems(
  ctx: ServiceCtx,
  boardId: string,
): Promise<BoardItemRow[]> { ... }
```

- `ServiceCtx` is a class (in `db/tx.ts`) carrying `db`, `r2`, `scope` plus one read-only repo per owned table: `ctx.boards`, `ctx.items`, `ctx.placements`, `ctx.itemImages`.
- Reads go through repos — `ctx.boards.byIdOrThrow(id)`, `ctx.placements.listForBoard(boardId)`. Each repo internally ANDs the scope filter / does the parent join. Forgetting to scope is structurally impossible from the repo path.
- `ctx.db` remains accessible as an escape hatch for tables the repos don't cover (currently `users`, `sessions` in auth code only). Direct `ctx.db.query.<owned-table>` is a smell.
- Returns domain rows. **Never** wire shapes.

### Mutation: `Tx`

```ts
export async function addBoardItem(
  tx: Tx,
  boardId: string,
  input: AddItemInput,
): Promise<BoardItemRow> { ... }
```

- `Tx` (in `db/tx.ts`) carries `db`, `r2`, `scope`, the staged-writes accumulator, AND the four write-capable repos: `tx.boards`, `tx.items`, `tx.placements`, `tx.itemImages`.
- Reads go through repos (same as `ServiceCtx`) — every read is auto-scoped.
- Writes go through repos — `tx.boards.stageInsert(values)`, `tx.placements.stageUpdate(id, set)`. Inserts on direct-owned tables auto-stamp `ownerId`; UPDATE/DELETE on all owned tables AND in the scope filter (direct column or parent subquery).
- For tables the repos don't cover (e.g. `sessions` in auth), use `tx.stage(tx.db.insert(...).values(...))` directly. The `tx.stage` primitive remains available; it just isn't the routine path for owned tables.
- R2 cleanup via `tx.scheduleBlobCleanup(blobs)` — runs only after a successful SQL commit.
- Caller (the router) wraps the call in `withTransaction(db, r2, scope, tx => ...)`; that's the one place `db.batch` runs.

## Composition: what makes this layer powerful

Multiple services can be staged into the same Tx, and the whole thing commits as one batch. This is the abstraction the routers buy from `Tx`. It means:

- `deleteBoard` calls `stagePurge` from `boardItems.ts`, then stages its own `delete(boards)` on top. All four kinds of writes (placements, items, blob cleanup, board) commit together or none do.
- A new "duplicate board" service could read board A's placements, then call `addBoardItem` N times into board B, then `renameBoard` — all one atomic commit, no new primitive needed.

**Rules that keep composition working:**

1. **A mutation service never opens its own transaction.** It accepts a `Tx` it didn't create. `withTransaction` is the boundary; services compose underneath it.
2. **A mutation service never returns until it has staged everything it intends to write.** No background "I'll write this later" patterns. Either it's staged or it's not happening.
3. **Reads done inside a Tx don't see writes staged earlier in the same Tx** (D1 doesn't commit until the boundary). Do all conditional reads first, then stage. If you're reading to check a value that you also write in the same Tx, you have a bug.
4. **Ownership checks come before staging writes**, not after. If `assertX` throws, the Tx accumulator is dropped on the floor — no commit ever happens. Stage-then-check would not stage the writes (the throw still skips commit), but it's harder to reason about and order-sensitive.
5. **Side-effects on R2 follow the SQL.** Uploads must happen _before_ staging the rows that point at them; deletes must be `tx.scheduleBlobCleanup`'d so they run _after_ commit. The asymmetry is intentional — uploads need to exist before the row, and deletes must not strand rows pointing at missing bytes.

## Ownership scoping (the security boundary)

Scope enforcement lives in `db/repos/`. Every read, insert, update, and delete on the four owned tables (`boards`, `items`, `board_items`, `item_images`) is routed through a repo, which auto-applies the scope filter. Services don't write ownership predicates by hand — they ask the repo.

The canonical interactions:

- `tx.boards.byIdOrThrow(id)` — fetch a board owned by the caller, or throw `NOT_FOUND`. Replaces the old `assertBoardOwned` helper.
- `tx.placements.byIdOrThrow(id)` — same for placements; the repo joins through `boards` to check the parent's owner.
- `tx.<repo>.stageInsert(values)` — inserts auto-stamp `ownerId` on direct-owned tables.
- `tx.<repo>.stageUpdate(id, set)` / `tx.<repo>.stageDelete(id)` — write paths AND the scope filter into the WHERE (direct column for `boards`/`items`; subquery against the parent table for `board_items`/`item_images`).

**Throw `NOT_FOUND`, never `FORBIDDEN`.** A `FORBIDDEN` response confirms the row exists and belongs to someone else; that's an existence-leak. `NOT_FOUND` collapses the two failure modes into one indistinguishable response. The repos already do this; don't second-guess it.

**Trust boundaries within services:** a low-level helper that _only_ runs after the caller has already authorized may skip the ownership-check call itself — but it must say so in a comment. `stagePurge` is the canonical example: it accepts an already-authorized list of placement/item ids and just stages the cascade. The repos it uses internally still enforce scope, so even a forgetful caller can't escape the boundary — this is defense in depth, not the primary guarantee.

**When a query genuinely needs a custom join across owned tables**, add a named method to the appropriate repo (e.g. `placements.listForBoard` does the placement + boards + items + images hydration). Don't reach for `tx.db.select()` in a service. The repo is the only place hand-written joins on owned tables should appear.

## Service ↔ router contract

The router translates wire ⇄ domain. The service speaks domain only.

**Router responsibilities (and _only_ these):**

1. Parse the zod input.
2. Decide whether the procedure is a read or a write. Reads pass `new ServiceCtx(ctx.db, ctx.images, { userId: ctx.userId })`. Writes wrap in `withTransaction(ctx.db, ctx.images, { userId: ctx.userId }, tx => ...)`.
3. Call exactly one or a small composition of services.
4. Map the returned domain row(s) to the wire shape (e.g. `toBoardItemWire` resolves `StoredImage` → `/api/images/...` URL). This mapping is **pure and total** — no fallibility, no second `z.parse`.

If a router does anything else (a SQL query, a Claude call, an R2 read), the logic belongs in a service.

**Service responsibilities:**

1. Take `Tx` or `ServiceCtx` (never raw bindings, never `userId`).
2. Run any conditional reads through scoped repos — `tx.boards.byIdOrThrow(id)`, `tx.placements.listForBoard(boardId)`, etc. Reaching to `tx.db.query.<owned-table>` directly removes the scope guarantee.
3. Stage writes through scoped repos — `tx.<repo>.stageInsert/stageUpdate/stageDelete`. Hand-writing `tx.stage(tx.db.insert(<owned-table>)...)` removes the auto-stamped `ownerId` / scope filter.
4. Validate the _outbound_ shape with the appropriate zod schema before returning, when the row construction is non-trivial. This is the boundary that catches DB-shape drift; routers cannot catch what services miss.
5. Throw `TRPCError`s for client-visible failures (or let `repo.byIdOrThrow` throw `NOT_FOUND` for you). Internal invariant violations throw plain `Error`.

Things services must _not_ do: read `process.env`, touch `ctx.req`, set cookies, build `/api/images/...` URLs, import zod _input_ schemas (input parsing is the router's job; the service may reuse the inferred input type).

## Reads, writes, and read-then-write windows

D1 is single-batch-commit. That means a Tx that reads X, then stages an update to X, has a window between the read and the eventual commit where another concurrent request could change X under it. There is no row-locking primitive on D1 — we accept this.

When that window matters:

- **Pre-write existence/ownership checks** (every mutation): the row could be soft-deleted between the SELECT and the eventual commit. Worst case: the update applies to a now-deleted row. That's benign — the row is already invisible to reads, and a delete-then-update doesn't create bad data.
- **Reparse / refresh flows that interleave Claude or R2 calls**: don't fire two of these for the same item concurrently. Last-write-wins on the columns; image batches may interleave. If you find yourself needing serializability here, the right move is to push this work into a Durable Object per item, not to add locks.
- **Reads that compute orphans before deleting** (`stagePurge`): the read sees the current placement-graph; we stage deletes based on it. If a new placement is created between the read and the commit, that new placement may briefly reference a deleted item. In practice the new-placement insert would race the deletes in the same engine; D1 will linearize them at commit. This is fine; do not add post-read re-validation.

If you need stronger guarantees than D1 offers, the answer is _not_ a more clever service. The answer is moving that piece of state into a Durable Object. Until then, document the read-then-write window in a comment.

## R2 ordering (orphan safety)

R2 and D1 are separate stores; you must order writes so a crash leaves a recoverable state.

| Operation                                        | Order                                                         | Why                                                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding image bytes that a new row will reference | `await storeImage(r2, ...)` _then_ `tx.stage(insert ...)`     | The SQL row needs the new R2 key to insert. If `tx` commits, the blob already exists. If `tx` throws, the blob is orphaned in R2 — `services/gc.ts:sweepOrphanR2Blobs` reclaims it (30-min grace window). |
| Removing rows + the bytes they referenced        | `tx.stage(delete ...)` _then_ `tx.scheduleBlobCleanup(blobs)` | The cleanup list only drains _after_ the SQL batch commits. If commit fails, blobs remain in R2 (GC-able), but no SQL row is ever left pointing at missing bytes.                                         |
| Reparse (replace existing images)                | upload new → stage row swaps → schedule old blob cleanup      | Combines both: new keys must exist before SQL references them; old blobs only die after the SQL pointer flips.                                                                                            |

**Never** call `r2.delete` directly from a mutation service. Use `tx.scheduleBlobCleanup(blobs)`. Direct deletes run before commit and break the orphan-safety invariant.

The `BlobRef = { r2Key, sourceUrl }` shape is what `scheduleBlobCleanup` takes. Pass full rows from `item_images` directly — the field names line up.

## Service file structure

When a service file holds both reads and mutations, separate them visibly:

```ts
// ---------- reads (no Tx; read-only) ----------

export async function listX(ctx: ServiceCtx, ...): Promise<...> { ... }

// ---------- mutations (Tx; staged into the request's single commit) ----------

export async function addX(tx: Tx, ...): Promise<...> { ... }
```

This is more than cosmetic — it makes the `Tx` / `ServiceCtx` split visible at a glance, which is the contract the router relies on. Look at `services/boardItems.ts` for the canonical layout.

## When you're about to add a new service function

Walk this checklist _before_ writing code:

1. **Is this a read or a mutation?** Reads take `ServiceCtx`. Mutations take `Tx`. If your function does both (read X to decide whether to write Y), it's a mutation — write goes through `Tx`, reads go through the same `Tx` via its repos.
2. **What other services should this compose with?** If a router would naturally call your new service alongside an existing one, the existing one's reads/writes must end up in _your_ Tx. Don't create a second Tx; accept the one passed in.
3. **What's the smallest scope this function owns?** A service should do one well-named thing. `addBoardItem` owns the three-table insert-graph for one placement; it doesn't own "syncing a board". Cross-cutting flows belong in a _new_ composing service, not jammed into an existing primitive.
4. **What does this NOT need to know?** A service handling "delete board item" does not need to know the request IP, the Anthropic key, the cookie, whether the user is on mobile, or what the wire URL of an image looks like. Anything the function doesn't strictly need stays out of the signature.
5. **What does the caller need back?** Domain shape only. If the router needs the row, return the row; if the wire shape requires URL resolution, that's the router's job (`toBoardItemWire`). When the response is non-trivial, validate it with the domain zod schema before returning.
6. **What read-then-write windows exist?** If there are any, write a comment explaining the worst case. If the worst case is "data loss", redesign — D1 isn't going to bail you out.

## When you're about to add a new router procedure

Walk this checklist:

1. **Is there already a service that does this work, or close to it?** If yes, call it. If no, write the service first, then come back to the router.
2. **Does the procedure read or write?** Reads use `ServiceCtx`; writes use `withTransaction`. The router is the only place `withTransaction` appears.
3. **Should it be `protectedProcedure`?** Yes. There are no `publicProcedure`s in user-facing routers.
4. **Does the input need a zod schema?** If it's reusable, put it in `schemas/`. If it's a one-off `{ id: string }`, inline `z.object({ id: z.string() })` is fine.
5. **Will the procedure compose multiple services?** Stage them all in one `withTransaction` callback. They share the Tx, commit as one batch. Don't open two transactions back-to-back unless they must be observable as separate events (almost never).
6. **Is the return shape a wire shape or a domain shape?** Convert at the router boundary. The service must not know about `/api/images/...`.

## Quick reference: the imports map

What each layer is allowed to import:

| Layer                | May import                                                                                                                                                                                  | Must not import                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `routers/*`          | `db/tx` (`ServiceCtx`, `withTransaction`), `services/*`, `schemas/*`, `trpc/init`, `lib/imageRoute` (for wire URLs)                                                                         | drizzle, `db/schema`, `db/repos/*`, raw bindings, `lib/anthropic`, `services/parser/claude`                              |
| `services/*`         | `db/tx` (`Tx`, `ServiceCtx` types), `db/repos/*` (joined-row types like `HydratedPlacement`), other `services/*`, `lib/*`. Drizzle/`db/schema` ONLY for tables the repos don't cover (auth) | tRPC `init`, Hono, `trpc/context` (except via the typed `ServiceCtx`/`Tx`), zod _input_ schemas, drizzle on owned tables |
| `db/repos/*`         | drizzle, `db/schema`, `db/tx` (types), `@trpc/server` for `TRPCError`                                                                                                                       | `services/*`, `routers/*`, anything tRPC-context-shaped, anything domain-shaped (`BoardItemRow`)                         |
| `db/tx`, `db/client` | drizzle, `db/repos/*`, `services/images` (cleanup helper only)                                                                                                                              | any specific service, any router                                                                                         |
| `lib/*`              | only itself, generic deps (zod, nanoid, native fetch)                                                                                                                                       | anything from `services/`, `routers/`, `db/schema`, `db/repos`                                                           |

If you find yourself wanting to violate this map, the right answer is almost always to add a new function at the _lower_ layer and call it from the _higher_ one — not to reach across.

## Anti-patterns (and the right move)

| Tempting shortcut                                                                                   | The right move                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a `userId` parameter to a service "for testability"                                          | Tests should construct a `Tx` / `ServiceCtx` with a fake scope. The scope is identity; identity is not an argument.                                       |
| Doing a Claude call directly in a router                                                            | Push it into `services/parser/`. Routers don't speak to external APIs.                                                                                    |
| Building a `/api/images/{key}` URL inside a service                                                 | Return a `StoredImage` ref. The router calls `imageDisplayUrl`.                                                                                           |
| Using `db.batch` inside a service to "make this atomic"                                             | Stage statements on the `Tx`. The whole request commits in one batch already; you don't need a second one.                                                |
| Calling `r2.delete` from a mutation service                                                         | Use `tx.scheduleBlobCleanup`. Direct deletes break orphan-safety.                                                                                         |
| Adding a service that takes `(tx, db, ...)` "to read without staging"                               | The repos on `tx` already separate reads from writes per table. Two handles is two truths.                                                                |
| Writing `tx.db.query.boards.findFirst({ where: eq(boards.ownerId, tx.scope.userId) })` in a service | Use `tx.boards.byId(...)` / `tx.boards.byIdOrThrow(...)`. Hand-rolled scope predicates removes the structural guarantee.                                  |
| Writing `tx.stage(tx.db.insert(items).values({ ...vals, ownerId: tx.scope.userId }))` in a service  | Use `tx.items.stageInsert(vals)`. The repo auto-stamps `ownerId` so the call site can't ship without it.                                                  |
| Hand-writing a JOIN across `boards`/`items`/`board_items`/`item_images` in a service                | Add a named method on the appropriate repo (e.g. `placements.listForBoard`). Services shape domain rows from repo output, not from raw drizzle.           |
| Throwing `FORBIDDEN` instead of `NOT_FOUND` for an unowned row                                      | Existence leak. Always `NOT_FOUND`.                                                                                                                       |
| Catching errors inside a Tx callback and continuing                                                 | Errors inside `fn` skip commit entirely (the design). Swallowing them produces partial side-effects (R2 uploads done, SQL never committed). Let it throw. |
| Re-parsing the service output with zod in the router "for safety"                                   | The router can't catch what the service didn't. Move output validation into the service. The router does pure, total wire mapping.                        |

## Mental model in one paragraph

A service is a building block that owns one slice of domain logic. It declares its dependencies in its signature (`Tx` for writes, `ServiceCtx` for reads) and nothing more. It composes with siblings via the shared `Tx` accumulator, so the router can chain N services and still get one atomic commit. It speaks domain types — never wire shapes — so the same service serves tRPC today, a Hono route tomorrow, and a Durable Object after that, without changing. Identity is carried by the scope on the handle, not by free parameters, so a service is never tempted to trust its caller's input. R2 and D1 are ordered around the commit so any crash leaves a state the GC can clean up. The router is dumb glue. The DB layer is dumb storage. Everything in between is the service layer; that is where the system actually lives.
