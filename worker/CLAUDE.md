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
│       └── claude.ts    Direct fetch to Anthropic /v1/messages
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
    └── id.ts            genId (nanoid)
```

## Architectural rules

**Routers are thin.** Each procedure does: parse input → call a service → return. No DB queries, no business logic in routers. Look at `routers/boards.ts` — it's all one-liners delegating to `services/boards.ts`. Keep it that way.

**Services take dependencies as parameters.** `services/boards.ts:listBoardItems(db, boardId)` — `db` is passed in, not pulled from context. This makes services testable without spinning up a request and makes the dependency surface explicit.

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

**Migrations:**

```bash
npm run db:generate         # write a new migration from schema diff
npm run db:migrate:local    # apply to local D1
npm run db:migrate          # apply to remote D1
npm run db:seed:local       # apply seed.sql (board-1 + 3 items)
npm run db:studio           # drizzle-kit studio UI
```

Timestamps: store as `Math.floor(Date.now() / 1000)` (unix seconds, integer column). Don't store ISO strings.

IDs: use `genId()` from `lib/id.ts` (nanoid).

## URL parsing flow

`services/parser/index.ts:parseProductUrl` is the orchestrator. Order:

1. `fetch(url)` with a browser-like User-Agent. Throws on non-2xx.
2. Extract `<og:title>`, `<og:site_name>`, `<og:description>`, price regex, JSON-LD images, then `<og:image>` as fallback.
3. **Only if** something's missing (price/description/no images), strip the HTML and call Claude Haiku. Token reduction is the point — most retailer pages give us everything in og tags.
4. For each resolved image URL: fetch bytes, write to R2 under `items/{nanoid}`, return the display URL `/api/images/items/{nanoid}`.

Claude returns JSON only (no markdown, no prose) — see the prompt in `services/parser/claude.ts`. The model ID is pinned: `claude-haiku-4-5-20251001`. Bump intentionally.

If Claude fails (network error, invalid JSON), we swallow it and return whatever we got from og tags. The user gets a partial card rather than a hard failure.

Cap: `MAX_IMAGES = 12` per item.

## Validation

Zod 4 for everything crossing the wire. Input schemas (`AddItemBody`, `PatchBoardItemBody`) live in `schemas/`. Procedure inputs are wrapped in `z.object({ ... })` in the router. Output validation: services re-parse with `BoardItemSchema.parse(...)` before returning — see `addBoardItem` and `listBoardItems`. Don't skip the output parse; it catches drift between DB shape and API shape.

## Scripts

- `npm run dev` — `wrangler dev` (port 8787)
- `npm run deploy` — `wrangler deploy`
- `npm run lint` — `tsc --noEmit && eslint .`
- `npm run cf-typegen` — regenerate `worker-configuration.d.ts` from `wrangler.toml`
- `npm run db:*` — see Database section above
