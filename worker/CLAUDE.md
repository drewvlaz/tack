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
├── services/            All real logic. Take Db / R2Bucket as params.
│   ├── boards.ts        listBoardItems, patchBoardItem, addBoardItem, deleteBoardItem
│   ├── items.ts
│   ├── images.ts        storeImage, imageDisplayUrl
│   └── parser/
│       ├── index.ts     fetchAndParseMeta, parseProductUrl
│       ├── meta.ts      og tag / json-ld / price regex extractors
│       └── claude.ts    Product-meta system prompt + JSON normalization. HTTP via `lib/anthropic.ts`.
├── routes/
│   └── images.ts        Hono handler for GET /api/images/* (R2 stream)
├── trpc/
│   ├── init.ts          initTRPC.context<Context>().create()
│   └── context.ts       Context = { db, images, anthropicKey }
├── db/
│   ├── schema/          Drizzle schema — one file per table, plus relations.ts
│   │   ├── index.ts     Barrel — drizzle.config.ts and `createDb` import from here
│   │   ├── boards.ts
│   │   ├── items.ts
│   │   ├── itemImages.ts
│   │   ├── boardItems.ts
│   │   └── relations.ts All cross-table relations (kept separate to avoid FK cycles)
│   └── client.ts        createDb(d1) → drizzle instance
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

**Atomicity is at the DB, scoped to the procedure (view).** Every mutation procedure must commit its DB writes in a single transaction — either one SQL statement or one `db.batch([...])` call. The unit of atomicity is the procedure; the enforcement is D1's batch transaction. If a procedure calls a service that does multi-row writes, that service uses `db.batch`; routers stay thin and don't compose multiple batches. For procedures involving R2 (`reparseItem`), the SQL batch is the atomicity boundary — R2 uploads precede it (orphan-safe), R2 deletes follow it (orphan-safe).

**Context shape:** `{ db, images, anthropicKey }`. Built in `index.ts` per request from `c.env`. If you add a new binding, add it to `Bindings` in `index.ts`, to `Context` in `trpc/context.ts`, and wire it in the `createContext` call.

**Images don't go through tRPC.** Bytes stream from R2 via the Hono route `GET /api/images/*` (`routes/images.ts`). tRPC returns the `/api/images/...` URL only; the frontend fetches the actual image directly.

**The `AppRouter` type is the frontend contract.** `export type AppRouter = typeof appRouter` in `router.ts` — the frontend imports it for end-to-end types. Don't break that export.

## Bindings (wrangler.toml)

- `DB` — D1 database `fashion-mood`. **Note:** `database_id` is currently `placeholder-replace-after-create` — run `wrangler d1 create fashion-mood` and paste the real ID before deploying.
- `IMAGES` — R2 bucket `fashion-mood-images`.
- `ANTHROPIC_API_KEY` — set as a worker secret (or in `.dev.vars` locally, which is gitignored).

Regenerate Cloudflare types after binding changes: `npm run cf-typegen`.

## Database (Drizzle + D1)

Schema lives in `src/db/schema/` — one file per table, with `relations.ts` holding all cross-table relations (separated so the table files don't import each other and risk circular FK references). The barrel `index.ts` is what `drizzle.config.ts` and `createDb` point at. Tables and relations:

- `boards` ←(many)— `board_items` —(one)→ `items` —(many)— `item_images`
- `board_items` is the join table with placement (x, y, width, height, z_index). Unique on `(board_id, item_id)`.
- `items` is the canonical product. `item_images` holds N R2-backed images, ordered by `display_order`.

Use Drizzle's relational query API (`db.query.boardItems.findMany({ with: { item: { with: { images } } } })`) when you need joined data — see `listBoardItems` for the canonical example.

**Migrations** (run from root or `worker/` — both work):

```bash
npm run db:generate -- --name describe_change   # write a new migration from schema diff
npm run db:migrate:local                        # apply to local D1
npm run db:migrate                              # apply to remote D1
npm run db:seed:local                           # apply seed.sql (board-1 + 3 items)
npm run db:studio                               # drizzle-kit studio UI
```

Always pass `--name <snake_case_description>` to `db:generate` so the file is named after what changes (e.g. `0002_base_timestamps.sql`, not drizzle's random `0006_calm_vulcan.sql`). The name is the only at-a-glance record of intent in the migrations folder.

Timestamps: store as `Math.floor(Date.now() / 1000)` (unix seconds, integer column). Don't store ISO strings.

IDs: use `genId()` from `lib/id.ts` (nanoid).

## URL parsing flow

`services/parser/index.ts:parseProductUrl` is the orchestrator. Order:

1. `fetch(url)` with a browser-like User-Agent. Throws on non-2xx.
2. Extract `<og:title>`, `<og:site_name>`, `<og:description>`, price regex, JSON-LD images, then `<og:image>` as fallback.
3. **Only if** something's missing (price/description/no images), strip the HTML and call Claude Haiku. Token reduction is the point — most retailer pages give us everything in og tags.
4. For each resolved image URL: fetch bytes, write to R2 under `items/{nanoid}`, return the display URL `/api/images/items/{nanoid}`.

Claude returns JSON only (no markdown, no prose) — the system prompt lives in `services/parser/claude.ts`; the underlying HTTP call is `lib/anthropic.ts:callClaude`. The model ID is pinned: `claude-haiku-4-5-20251001`. Bump intentionally.

If Claude fails (network error, invalid JSON), we swallow it and return whatever we got from og tags. The user gets a partial card rather than a hard failure.

Cap: `MAX_IMAGES = 12` per item.

## Validation

Zod 4 for everything crossing the wire. Input schemas (`AddItemBody`, `PatchBoardItemBody`) live in `schemas/`. Procedure inputs are wrapped in `z.object({ ... })` in the router. Output validation: services re-parse with `BoardItemSchema.parse(...)` before returning — see `addBoardItem` and `listBoardItems`. Don't skip the output parse; it catches drift between DB shape and API shape.

## Scripts

All scripts work from the repo root (mirrored as `npm run <name>`) or from `worker/`. See the root `CLAUDE.md` for the full table.

- `dev` — `wrangler dev` (port 8787)
- `deploy` — `wrangler deploy`
- `lint` — `tsc --noEmit && eslint .`
- `test` / `test:watch` — `vitest`
- `cf-typegen` — regenerate `worker-configuration.d.ts` from `wrangler.toml`
- `db:*` — see Migrations section above
