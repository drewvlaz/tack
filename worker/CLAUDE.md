# worker/

Hono on Cloudflare Workers. Exposes a tRPC API plus one Hono route for streaming images out of R2. See root `CLAUDE.md` for product context and stack.

## Directory map

```
src/
├── index.ts             Hono app — mounts /trpc/* and /api/images/*
├── router.ts            Root tRPC AppRouter (boards, items, parseUrl)
├── routers/             tRPC routers — thin, parse input, delegate to services
│   ├── boards.ts        getItems, patchItem, addItem, deleteItem
│   ├── items.ts
│   └── parser.ts        parseUrl procedure
├── services/            All real logic. Mutations take `tx: Tx`, reads take `db`.
│   ├── boards.ts        listBoards, createBoard, deleteBoard, renameBoard
│   ├── boardItems.ts    listBoardItems, addBoardItem, patchBoardItem, deleteBoardItem, restoreBoardItem, purgeBoardItem, emptyBoardTrash, stagePurge
│   ├── items.ts         setPrimaryImage, reparseItem
│   ├── images.ts        storeImage, deleteStoredImage, loadImage, content-type clamp
│   ├── gc.ts            sweepOrphanR2Blobs (called from the scheduled handler)
│   └── parser/
│       ├── index.ts     fetchAndParseMeta, parseProductUrl
│       ├── meta.ts      og tag / json-ld / price regex extractors
│       └── claude.ts    Product-meta system prompt + JSON normalization. HTTP via `lib/anthropic.ts`.
├── routes/
│   └── images.ts        Hono handler for GET /api/images/* (R2 stream)
├── trpc/
│   ├── init.ts          initTRPC.context<Context>().create()
│   └── context.ts       Context = { db, images, anthropicKey, parseLimiter, clientIp }
├── db/
│   ├── client.ts        createDb(d1) → drizzle instance
│   ├── tx.ts            `Tx` + `withTransaction` — staged-writes accumulator that commits as one batch
│   └── schema/          Drizzle schema — one file per table, plus relations.ts
│       ├── index.ts     Barrel — drizzle.config.ts and `createDb` import from here
│       ├── boards.ts
│       ├── items.ts
│       ├── itemImages.ts
│       ├── boardItems.ts
│       └── relations.ts All cross-table relations (kept separate to avoid FK cycles)
├── schemas/             Zod schemas for tRPC inputs/outputs
│   ├── board.ts         BoardItemSchema, AddItemBody, PatchBoardItemBody
│   └── parse.ts         ParseResult
└── lib/
    ├── id.ts            genId (nanoid)
    └── anthropic.ts     callClaude — generic POST /v1/messages, no domain types
```

## Architectural rules

**Routers are thin.** Each procedure does: parse input → call a service → return. No DB queries, no business logic in routers. Look at `routers/boards.ts` — it's all one-liners delegating to `services/boards.ts`. Keep it that way.

**Services take dependencies as parameters.** `services/boards.ts:listBoardItems(db, boardId)` — `db` is passed in, not pulled from context. This makes services testable without spinning up a request and makes the dependency surface explicit.

**Mutations go through `Tx`, committed at the router boundary by `withTransaction`.** Service signature is `(tx: Tx, ...args)` — reads happen eagerly via `tx.query`, writes are STAGED via `tx.stage(...)` and the actual `db.batch([...])` runs once when `withTransaction` returns. Errors thrown inside the callback skip the commit entirely. Cross-service composition is automatic: any number of services can stage into the same Tx, all commit (or none do).

R2 cleanup is scheduled on the Tx via `tx.scheduleBlobCleanup(blobs)` and runs AFTER the SQL batch commits — orphan-safe: if the batch fails, blobs remain in R2 and the GC sweeper reclaims them eventually (never rows pointing at missing bytes).

R2 uploads (in `reparseItem`, `parseProductUrl`) happen BEFORE staging — SQL needs the new keys, and a failure after upload leaves orphans (also GC-reclaimed).

Read-only services keep the `Db` signature — there's nothing to stage.

**Why a Tx-and-commit shim instead of `db.transaction()`?** D1 doesn't support interactive transactions; raw `BEGIN` is rejected at the engine. `db.batch([...])` is the only atomic primitive, but it requires pre-composed statement lists, which doesn't compose across services. `Tx` is the accumulator that makes service composition feel transactional on D1.

**Forward path to collab (Durable Objects).** When per-board write logic moves into a `BoardDO`, the same `Tx` shape will wrap `state.storage.transaction(cb)` instead of a deferred batch — services keep the `(tx, ...)` signature. The migration is at the `withTransaction` implementation, not at the service surface.

**Resource scoping (future).** When auth lands, `Tx` will carry a `scope` field (`{ userId, kind }`) populated by the router from the authenticated context. Services will read `tx.scope` and apply it to their reads/writes (e.g. `eq(boards.ownerId, tx.scope.userId)`). Read-only services that don't take Tx today will need a parallel `Ctx` shape carrying scope. Leave this slot open; don't pretend it's already there.

**Read-then-write stale-check windows** (not partial commits — the write itself is still atomic):

- `setPrimaryImage` SELECTs for ownership before staging the UPDATE. The image could be soft-deleted between the SELECT and the eventual commit. Worst case: primary points at a just-deleted image; the list-time filter resolves it on next read.
- `reparseItem` interleaves a Claude call and R2 uploads between its reads and stages. Concurrent reparses for the same item are last-write-wins on `items` columns; image batches may also interleave. Don't fire concurrent reparses for the same item.

**Context shape:** `{ db, images, anthropicKey }`. Built in `index.ts` per request from `c.env`. If you add a new binding, add it to `Bindings` in `index.ts`, to `Context` in `trpc/context.ts`, and wire it in the `createContext` call.

**Images don't go through tRPC.** Bytes stream from R2 via the Hono route `GET /api/images/*` (`routes/images.ts`). tRPC returns the `/api/images/...` URL only; the frontend fetches the actual image directly.

**The `AppRouter` type is the frontend contract.** `export type AppRouter = typeof appRouter` in `router.ts` — the frontend imports it for end-to-end types. Don't break that export.

## Bindings (wrangler.toml)

- `DB` — D1 database `fashion-mood`. **Note:** `database_id` is currently `placeholder-replace-after-create` — run `wrangler d1 create fashion-mood` and paste the real ID before deploying.
- `IMAGES` — R2 bucket `fashion-mood-images`.
- `ANTHROPIC_API_KEY` — set as a worker secret (or in `.dev.vars` locally, which is gitignored).
- `PARSE_LIMITER` — first-party rate-limit binding (`[[ratelimits]]` block), 30 requests per 60s per `cf-connecting-ip`. Only `parseUrl` consults it; the rest of the API isn't rate-limited yet.

## CORS / auth posture

CORS is currently locked to localhost dev origins (`5173`/`5174`) in `index.ts`. **The worker has no auth yet** — every tRPC procedure is `publicProcedure`. Before any production deploy, add auth and extend the CORS allowlist to the deployed frontend origin. See the `TODO(auth)` marker in `index.ts`.

## Cron triggers

`[triggers] crons = ["0 */6 * * *"]` — every 6 hours, the `scheduled` handler in `index.ts` runs `services/gc.ts:sweepOrphanR2Blobs`. It lists every `items/*` blob in R2, anti-joins against `item_images.r2_key` in D1, and deletes anything older than 30 minutes that has no referencing row.

The grace period exists for the `parseUrl` → `addItem` flow: `parseUrl` writes R2 blobs and returns their refs; the frontend then calls `addItem` which inserts the rows. Between those two calls, the blob is orphan-ish — sweeping it would break the add. The 30-min window is well beyond any realistic gap.

Regenerate Cloudflare types after binding changes: `pnpm cf-typegen`.

## Database (Drizzle + D1)

Schema lives in `src/db/schema/` — one file per table, with `relations.ts` holding all cross-table relations (separated so the table files don't import each other and risk circular FK references). The barrel `index.ts` is what `drizzle.config.ts` and `createDb` point at. Tables and relations:

- `boards` ←(many)— `board_items` —(one)→ `items` —(many)— `item_images`
- `board_items` is the join table with placement (x, y, width, height, z_index). Unique on `(board_id, item_id)`.
- `items` is the canonical product. `item_images` holds N R2-backed images, ordered by `display_order`.

Use Drizzle's relational query API (`db.query.boardItems.findMany({ with: { item: { with: { images } } } })`) when you need joined data — see `listBoardItems` for the canonical example.

**Migrations** (run from root or `worker/` — both work):

```bash
pnpm db:generate --name describe_change   # write a new migration from schema diff
pnpm db:migrate:local                     # apply to local D1
pnpm db:migrate                           # apply to remote D1
pnpm db:seed:local                        # apply seed.sql (board-1 + 3 items)
pnpm db:studio                            # drizzle-kit studio UI
```

Always pass `--name <snake_case_description>` to `db:generate` so the file is named after what changes (e.g. `0002_base_timestamps.sql`, not drizzle's random `0006_calm_vulcan.sql`). The name is the only at-a-glance record of intent in the migrations folder.

Timestamps: store as `Math.floor(Date.now() / 1000)` (unix seconds, integer column). Don't store ISO strings.

IDs: use `genId()` from `lib/id.ts` (nanoid).

## URL parsing flow

`services/parser/index.ts:parseProductUrl` is the orchestrator. Order:

1. `safeFetch(url)` with a browser-like User-Agent. Manually walks redirects and re-validates each `Location` against the SSRF policy. Throws on non-2xx.
2. Body capped at 4MB via a streaming reader — pathological responses abort rather than OOMing the isolate.
3. Extract `<og:title>`, `<og:site_name>`, `<og:description>`, structured-data price (JSON-LD / microdata), JSON-LD images, then `<og:image>` and `<img>` tags as fallbacks. Currency from JSON-LD / microdata / og:price:currency.
4. **Always** call Claude Haiku on the stripped HTML — it fills in any gaps (description/price/currency/images) plus the `details` array (materials/care/sizing/etc) which doesn't live in og tags. Prompt caching is on; system block is `ephemeral`-cached.
5. For each resolved image URL: fetch bytes (concurrency capped at 4), validate content-type against an image allowlist, validate size between 10KB and 10MB, write to R2 under `items/{nanoid}`, return a `StoredImage` ref. Failures drop the URL rather than persisting a broken external.

Claude returns JSON only — the system prompt lives in `services/parser/claude.ts`; the HTTP call is `lib/anthropic.ts:callClaude` (auto-retries 429/5xx with backoff, three attempts). The model ID is pinned: `claude-haiku-4-5-20251001`. Bump intentionally.

If Claude fails after retries, we swallow it and return whatever we got from og tags. The user gets a partial card with a `claude_failed` warning rather than a hard failure.

Cap: `MAX_IMAGES = 12` per item, `IMAGE_FETCH_CONCURRENCY = 4`.

## Validation

Zod 4 for everything crossing the wire. Input schemas (`AddItemBody`, `PatchBoardItemBody`) live in `schemas/`. Procedure inputs are wrapped in `z.object({ ... })` in the router.

Output validation lives in the **service**, not the router. `addBoardItem` parses with `BoardItemRowSchema` before returning; that's the boundary that catches DB-shape drift. The router's `toBoardItemWire` is a pure, total mapping (`StoredImage` → display URL) — no re-parse needed. Don't add a router-side `z.parse` "for safety"; it can't catch anything the service-side parse missed.

## Scripts

All scripts work from the repo root (mirrored as `pnpm <name>`) or from `worker/`. See the root `CLAUDE.md` for the full table.

- `dev` — `wrangler dev` (port 8787)
- `deploy` — `wrangler deploy`
- `lint` — `tsc --noEmit && eslint .`
- `test` / `test:watch` — `vitest`
- `cf-typegen` — regenerate `worker-configuration.d.ts` from `wrangler.toml`
- `db:*` — see Migrations section above
