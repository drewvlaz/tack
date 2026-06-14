# worker/

Hono on Cloudflare Workers. Exposes a tRPC API plus one Hono route for streaming images out of R2. See root `CLAUDE.md` for product context and stack.

## Directory map

```
src/
├── index.ts             Hono app — mounts /trpc/*, /api/auth/*, /api/images/*, and the `scheduled` cron entry point. Pure glue; logic lives in the handlers it imports.
├── scheduled.ts         Entry point for cron triggers — invokes services/gc.sweepOrphanR2Blobs via `ctx.waitUntil`.
├── router.ts            Root tRPC AppRouter (boards, items, parseUrl, parseFromHtml)
├── routers/             tRPC routers — thin, parse input, delegate to services. A router file (or its `index.ts`) holds ONLY exposed procedures + the router export; non-procedure helpers (e.g. wire mappers) go in sibling files inside a router directory.
│   ├── boards/
│   │   ├── index.ts     boards router — exposed procedures only
│   │   └── wire.ts      toBoardItemWire (domain → wire mapper)
│   ├── items.ts
│   └── parser.ts        parseUrl + parseFromHtml procedures (shared rate-limit + error-mapping helpers)
├── services/            All real logic. Mutations take `tx: Tx`, reads take `db`.
│   ├── boards.ts        listBoards, createBoard, deleteBoard, renameBoard
│   ├── boardItems.ts    listBoardItems, addBoardItem, patchBoardItem, deleteBoardItem, restoreBoardItem, purgeBoardItem, emptyBoardTrash, stagePurge
│   ├── items.ts         setPrimaryImage, reparseItem
│   ├── images.ts        storeImage, deleteStoredImage, loadImage, content-type clamp
│   ├── gc.ts            sweepOrphanR2Blobs (called from the scheduled handler)
│   └── parser/
│       ├── index.ts     fetchAndParseMeta, parseHtmlMeta, parseProductUrl, parseProductFromHtml, fetchHtmlWithArchiveFallback (Wayback rescue)
│       ├── meta.ts      og tag / json-ld / price regex extractors
│       └── claude.ts    Product-meta system prompt + JSON normalization. HTTP via `lib/anthropic.ts`.
├── routes/             Hono routes — same rule as `routers/`: a route file (or its `index.ts`) holds ONLY the exposed handler/Hono app; non-handler helpers live in sibling files inside a route directory.
│   ├── auth/
│   │   ├── index.ts     authRoutes Hono app — exposed routes only
│   │   ├── cookie.ts    SESSION_COOKIE name/TTL, read/set/clear cookie helpers
│   │   └── errors.ts    authErrorResponse (AuthError → HTTP status)
│   └── images.ts        Hono handler for GET /api/images/* (R2 stream)
├── trpc/
│   ├── init.ts          initTRPC.context<Context>().create()
│   ├── context.ts       Context = { db, images, anthropicKey, parseLimiter, clientIp }
│   └── handler.ts       handleTrpcRequest — builds the Context from a Hono request and runs `fetchRequestHandler`
├── db/
│   ├── client.ts        createDb(d1) → drizzle instance
│   ├── tx.ts            `Tx` + `ServiceCtx` classes + `withTransaction` — Tx/ServiceCtx host per-table scoped repos and (for Tx) a staged-writes accumulator
│   ├── repos/           One scoped repo per owned table — auto-stamps ownerId on insert, auto-ANDs the scope filter on every read/update/delete. Direct-owned (boards, items) use an ownerId column; transitive (placements, itemImages) use an INNER JOIN for reads and an ownership subquery for UPDATE/DELETE.
│   │   ├── boards.ts    BoardsReadRepo + BoardsTxRepo
│   │   ├── items.ts     ItemsReadRepo + ItemsTxRepo
│   │   ├── placements.ts PlacementsReadRepo + PlacementsTxRepo (board_items)
│   │   └── itemImages.ts ItemImagesReadRepo + ItemImagesTxRepo
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

**Resource scoping.** `Tx` and `ServiceCtx` (both in `db/tx.ts`) carry `scope: { userId }`, populated by the router from the authenticated context, and host one _scoped repo_ per owned table (`tx.boards`, `tx.items`, `tx.placements`, `tx.itemImages`). Services touch tables exclusively through these repos — `tx.boards.byIdOrThrow(id)` instead of a hand-written drizzle SELECT, `tx.items.stageInsert(values)` instead of `tx.db.insert(items).values({ ..., ownerId: tx.scope.userId })`. The repo auto-stamps `ownerId` on insert (direct-owned tables) and auto-ANDs the scope filter on every read / UPDATE / DELETE (direct via column, transitive via subquery on parent's `ownerId`). Forgetting to scope is no longer possible from the repo path. `byIdOrThrow` raises `TRPCError NOT_FOUND` on miss (never `FORBIDDEN` — don't leak existence). `tx.db` / `ctx.db` remain accessible as an escape hatch for the few cases the repos don't cover (the `users`/`sessions` tables in `services/auth.ts`); using them on owned tables is a smell.

## Atomicity boundaries

**The unit is one `withTransaction` block — one tRPC procedure or one Hono route.** Both `routers/boards/index.ts` (every mutating procedure) and `routes/auth/index.ts` (signup/login/logout) wrap their work in `withTransaction`. There is no "second class" of write that bypasses the accumulator; if you add a new mutating endpoint (tRPC or Hono), it must wrap too. Within one block, every `tx.stage(...)` and every `tx.scheduleBlobCleanup(...)` either all apply or all no-op (callback throw → both accumulators discarded). The directional invariant is one-way: bytes can outlive rows (orphan R2, GC-reclaimed) but rows can never point at missing bytes.

**What is NOT inside the boundary.** Side effects produced during the callback but not staged through the accumulators are NOT rolled back on a downstream failure. The intentional ones:

- **Anthropic API calls** (`reparseItem`, `parseProductUrl`). If SQL fails after Claude succeeded, tokens are spent. Cost ≠ correctness — acceptable.
- **R2 uploads** (`reparseItem`, `parseProductUrl`). Bytes land before staging; orphans get the 30-min GC sweep. The symmetric alternative (stage first, upload after) would create broken refs, which is worse.
- **Rate-limit consumption** (`ctx.parseLimiter.limit(...)` in `routers/parser.ts`, `ctx.authLimiter.limit(...)` in `routes/auth/`). Runs before `withTransaction` starts. A downstream failure does NOT refund — by design; rate limits count attempts.
- **Cookies / response headers.** Set after `withTransaction` returns; emitted only on success because the throw bubbles to the framework.
- **Cross-request flows.** `parseUrl` (R2 only, no SQL) and `addItem` (SQL referencing those keys) are two separate atomic units. The GC sweeper's 30-min grace window covers the gap.
- **Fire-and-forget client patterns.** The frontend's position PATCH on drag-end is intentionally not awaited; correctness rides on the per-request atomicity of each PATCH, not on cross-PATCH ordering.

**Read-then-stage windows** (the write is still atomic; the read just isn't part of the snapshot):

- Reads inside `withTransaction` are eager — they hit the DB immediately and don't see staged writes. By the time the batch commits, the read result may be stale.
- `setPrimaryImage` SELECTs for ownership before staging the UPDATE. The image could be soft-deleted between SELECT and commit. Worst case: primary points at a just-deleted image; the list-time filter resolves it on next read.
- `reparseItem` interleaves a Claude call and R2 uploads between its reads and stages. Concurrent reparses for the same item are last-write-wins on `items` columns; image batches may also interleave. Don't fire concurrent reparses for the same item.
- If a future feature needs stronger guarantees (cross-row invariants under concurrent writers), the standard mitigation is optimistic concurrency control: add a `version` column and `WHERE version = :expected` on every UPDATE, retry on zero row-count. Don't try to invent locking on top of `db.batch`.

**Context shape:** `{ db, images, anthropicKey, parseLimiter, clientIp, userId, sessionId }`. Built in `index.ts` per request from `c.env`; `userId`/`sessionId` come from looking up the `tack_sess` cookie via `services/auth.ts:lookupSession`. If you add a new binding, add it to `Bindings` in `index.ts`, to `Context` in `trpc/context.ts`, and wire it in the `createContext` call.

**Procedures:** every tRPC procedure uses `protectedProcedure` (from `trpc/init.ts`), which throws `UNAUTHORIZED` if `ctx.userId` is null and otherwise narrows it to a non-null string for the handler. There are no `publicProcedure`s — auth on the Hono side (POST `/api/auth/{signup,login,logout}`, GET `/api/auth/me`) handles the bootstrap.

**Images don't go through tRPC.** Bytes stream from R2 via the Hono route `GET /api/images/*` (`routes/images.ts`). tRPC returns the `/api/images/...` URL only; the frontend fetches the actual image directly.

**The `AppRouter` type is the frontend contract.** `export type AppRouter = typeof appRouter` in `router.ts` — the frontend imports it for end-to-end types. Don't break that export.

## Bindings (wrangler.toml)

- `DB` — D1 database `tack`. **Note:** `database_id` is currently `placeholder-replace-after-create` — run `wrangler d1 create tack` and paste the real ID before deploying.
- `IMAGES` — R2 bucket `tack-images`.
- `ANTHROPIC_API_KEY` — set as a worker secret (or in `.dev.vars` locally, which is gitignored).
- `PARSE_LIMITER` — first-party rate-limit binding (`[[ratelimits]]` block), 30 requests per 60s per `cf-connecting-ip`. Only `parseUrl` consults it; the rest of the API isn't rate-limited yet.
- `INVITE_EMAILS` — comma-separated email allowlist for signup. Read by `services/auth.ts:parseAllowlist`. Add yourself to sign up locally; override in `.dev.vars` if you don't want your email in source.

## CORS / auth

CORS is locked to localhost dev origins (`5173`/`5174`) in `index.ts` with `credentials: true` so the session cookie can ride along. Adding production: extend the allowlist with the deployed frontend origin — `credentials: true` requires an explicit origin, never `*`.

Auth is email + password with sessions stored in D1 (`sessions` table) and an opaque session id sent as the `tack_sess` cookie (HttpOnly, 30-day TTL). Cookie SameSite/Secure attrs are driven by `ENVIRONMENT`: dev uses `SameSite=Lax` without `Secure` (localhost is same-site, HTTP); staging/prod use `SameSite=None; Secure` because the frontend (`*.pages.dev`) and worker (`*.workers.dev`) are cross-site and browsers won't send `Lax` cookies on cross-site fetch. Hono routes at `/api/auth/{signup,login,logout,me}` (`routes/auth.ts`); tRPC reads the cookie in `createContext` and exposes `ctx.userId` to procedures. Passwords are PBKDF2-SHA256 / 100k iterations (Workers caps PBKDF2 at 100k — OWASP 2023's 600k isn't reachable on this runtime, no compat flag to bypass), stored as a self-describing PHC string (`pbkdf2$100000$<salt>$<hash>`). The iteration count lives in the PHC string, so existing hashes keep verifying if the constant is later bumped. Signup is gated by the `INVITE_EMAILS` allowlist — open signup is off.

Local dev seed creates fixture user `dev@local` with password `tackdev123` (see `seed.sql`); sign in with those to see the seeded board. Real signup requires an email in `INVITE_EMAILS`.

## Cron triggers

`[triggers] crons = ["0 */6 * * *"]` — every 6 hours, the `scheduled` handler in `index.ts` runs `services/gc.ts:sweepOrphanR2Blobs`. It lists every `items/*` blob in R2, anti-joins against `item_images.r2_key` in D1, and deletes anything older than 30 minutes that has no referencing row.

The grace period exists for the `parseUrl` → `addItem` flow: `parseUrl` writes R2 blobs and returns their refs; the frontend then calls `addItem` which inserts the rows. Between those two calls, the blob is orphan-ish — sweeping it would break the add. The 30-min window is well beyond any realistic gap.

Regenerate Cloudflare types after binding changes: `pnpm typegen`.

## Database (Drizzle + D1)

Schema lives in `src/db/schema/` — one file per table, with `relations.ts` holding all cross-table relations (separated so the table files don't import each other and risk circular FK references). The barrel `index.ts` is what `drizzle.config.ts` and `createDb` point at. Tables and relations:

- `users` —(many)→ `boards` ←(many)— `board_items` —(one)→ `items` —(many)→ `item_images`
- `users` —(many)→ `sessions`
- `boards.ownerId` and `items.ownerId` FK into `users(id)` with `ON DELETE cascade`. `board_items` and `item_images` are scoped transitively via their parent.
- `board_items` is the join table with placement (x, y, width, height, z_index). Unique on `(board_id, item_id)`.
- `items` is the canonical product. `item_images` holds N R2-backed images, ordered by `display_order`.

Use Drizzle's relational query API (`db.query.boardItems.findMany({ with: { item: { with: { images } } } })`) when you need joined data — see `listBoardItems` for the canonical example.

**Migrations** (run from root or `worker/` — both work):

```bash
pnpm db:generate --name describe_change   # write a new migration from schema diff
pnpm db:migrate:local                     # apply to local D1
pnpm db:migrate:staging                   # apply to staging D1
pnpm db:migrate:production                # apply to production D1
pnpm db:seed:local                        # apply seed.sql (board-1 + 3 items)
pnpm db:studio                            # drizzle-kit studio UI
```

Always pass `--name <snake_case_description>` to `db:generate` so the file is named after what changes (e.g. `0002_base_timestamps.sql`, not drizzle's random `0006_calm_vulcan.sql`). The name is the only at-a-glance record of intent in the migrations folder.

**Migrations must preserve existing data.** Treat every generated migration as if it's about to run against production with real user boards in it. Before applying, read the generated SQL and confirm it doesn't destroy data:

- **Never** edit a migration to add `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `DELETE FROM` against existing data — even if drizzle-kit suggests it. If a schema change forces drizzle to emit a destructive statement (e.g. renaming a column → drizzle's default is `DROP` + `ADD`), rewrite the migration by hand as `ALTER TABLE ... RENAME COLUMN`, or split into add-new-column → backfill → drop-old-column over multiple deploys.
- **No backfill = data loss.** Adding a `NOT NULL` column without a default to a non-empty table will fail at apply time; with a default, rows get the default and the prior signal is gone. If the new column needs real values, generate it nullable first, backfill in a separate migration, then add the constraint.
- **Renames go through add/copy/drop.** Renaming a table or column in one shot via drizzle often produces a destructive sequence. Stage it: add the new shape, copy the data with a `INSERT ... SELECT` or `UPDATE`, then drop the old shape in a later migration once code no longer references it.
- **No edits to past migrations.** Once a migration has been applied anywhere (local dev counts), it's frozen. Fix mistakes with a new migration on top. Editing applied migrations diverges drizzle's state from the DB and the next `db:migrate` will misbehave.
- **Inspect before applying.** After `pnpm db:generate`, open the SQL file and read it end to end. Confirm: every existing column you care about still exists, every existing row will still satisfy the new constraints, and there are no `DROP`/`TRUNCATE` statements you didn't expect. Only then run `db:migrate:local` and exercise the app.

If a destructive migration is genuinely needed (e.g. dropping a deprecated table that has known-empty production data), call it out explicitly and confirm with the user before generating it.

Timestamps: store as `Math.floor(Date.now() / 1000)` (unix seconds, integer column). Don't store ISO strings.

IDs: use `genId()` from `lib/id.ts` (nanoid).

## URL parsing flow

`services/parser/index.ts:parseProductUrl` is the orchestrator. Order:

1. `safeFetch(url)` with a browser-like User-Agent. Manually walks redirects and re-validates each `Location` against the SSRF policy. Throws on non-2xx. **Wayback fallback:** when the live fetch ends in a `403`/`429`/`451` or a network-level failure (TLS/DNS rejection — Akamai BM, DataDome, etc. fingerprint-block the Worker before headers matter), `fetchHtmlWithArchiveFallback` queries `archive.org/wayback/available?url=…` and, if a `status: "200"` snapshot exists, fetches `https://web.archive.org/web/<timestamp>id_/<url>` (the `id_` flag returns raw archived bytes — no banner injection, no URL rewriting, so JSON-LD / og / image URLs still point at the original CDN). The original page URL stays the parse base so relative URLs resolve correctly. Surfaces a `parsed_from_archive` warning; prices may be stale by days/weeks. Live response statuses outside the fallback set (404, 5xx, etc.) skip Wayback and surface the original `ParseFetchError`.
2. Body capped at 4MB via a streaming reader — pathological responses abort rather than OOMing the isolate.
3. **Stage 1 — deterministic extraction** (`parser/candidates.ts:extractCandidates`). Produces a `StaticExtract { title, docTitle, brand, description, price, currency, productNode, candidates, priceSignals, requestedVariant }`:
   - `parseHtml` is a single HTMLRewriter pass that reads og:title / og:site_name / og:description / og:image, the `<title>` tag (`docTitle` — last-resort title fallback), every `<script type="application/ld+json">` body, and every `<img>` tag's largest srcset entry or src (falling back to `data-srcset` / `data-src` for lazyload libraries that hide the real URL until scroll). Each `<img>` is tagged `suspect: true` when found inside a related/recommendation container (descendant selectors like `[class*="related" i] img`, `[class*="recommend" i] img`, `[class*="menu" i] img`, `[class*="drawer" i] img`, `nav img`, `footer img`, etc. — lol-html handles ancestor matching, no hand-rolled depth counter).
   - `extractFromJsonLd` walks `@graph` / `mainEntity` / `about` / `hasVariant` wrappers and prefers the Product node whose `url` matches the page, falling back to the first. Returns its full JSON node so Claude can read it later. Currency/price come from the same Offer (AggregateOffer prefers lowPrice — sale); OutOfStock offers are skipped; thousand-separator strings tolerated.
   - `extractFromMicrodata` is the fallback price/currency scan for sites without JSON-LD.
   - **Image candidate scoring** combines six sources, weight = source contribution; a URL appearing in multiple sources sums them; high-res hints (`_2048w`, `w_2048`, `_2048x`) add +1, low-quality hints (`thumb`, `cart`, `tile`, …) subtract 2:
     - `jsonld` 4 — Product.image (retailer-declared photography, highest trust)
     - `rebuilt` 3 — `extractTemplateImageUrls` finds CDN templates like SSENSE's `__IMAGE_PARAMS__` and `rebuildFromReference` swaps og:image's filename for each template's filename, propagating its transform segments
     - `og` 2 — og:image / og:image:secure_url / og:image:url
     - `script-samedir` 2 — `extractRawImageUrls` regex-scans the raw HTML for image URLs (decoding JSON-escaped slashes first), keeping only those sharing the anchor's host AND directory (anchor = og:image, else first JSON-LD image). Captures SPA galleries (Next.js **NEXT_DATA**, Shopify analytics blobs) that never appear in `<img>` tags or JSON-LD.
     - `img` 1 — `<img>` tags sharing the page or og:image host
     - `img-offhost` 0 — `<img>` tags on a different host (kept, never preferred — often widgets/ads, occasionally legitimate CDN aliases)
     - `script` 0 — script-scanned URLs on the anchor host but different directory
     - `img-suspect` −3 — `<img>` tags inside related/recommendation/menu/drawer/cart containers
     - `img-variant-match` 5 / `img-variant-mismatch` −6 — when the page URL carries a variant query (`?color=X` / `?colour=X`) AND the markup exposes per-variant `<div data-color="...">` containers, `<img>`s inside the matching container get a strong positive signal; mismatched-variant imgs are filtered out entirely whenever any match candidates exist (the structured sources almost always reflect the default variant, not the one being viewed)
   - Plausibility filter drops SVG/data: URLs and paths matching `logo|favicon|sprite|swatch|payment|paypal|visa|…|size_guide|empty`. Dedupe key is origin + path with Cloudinary-style transform segments stripped AND the Shopify size suffix (`_300x300`, `_2048x`, `_grande`, `_medium`, named presets) collapsed onto the bare filename — so `master.jpg`, `master_2048x.jpg`, and `master_grande.jpg` all dedupe to one entry, inheriting tags (including `img-variant-mismatch`) from whichever variant container they appeared in. Result is the top `MAX_CANDIDATES = 20` by score with stable first-seen tie-break, with placeholder-template URLs dropped.
   - **`priceSignals`** — `extractPriceSignals` regex-pulls every `"price"|"prices"|"value"|"amount"|"current_price"|…` occurrence in the HTML with ~70 chars of leading context (capped at 12). Surfaces SPA prices buried in JSON blobs (e.g. Uniqlo's `{"prices":{"base":{"value":19.9}}}`) to the Claude stage as evidence — never trusted directly.
   - **`requestedVariant`** — `extractVariantHint(pageUrl)` reads `?color=X` / `?colour=X` from the URL and maps to the corresponding `data-<key>` attribute name. When set, `parseHtml` is invoked with the hint and registers extra descendant selectors — `[<attr>] img` (in any variant container) plus one `[<attr>="<form>" i] img` per slug form returned by `variantValueCandidates(value)` (the input, plus space/hyphen/underscore swaps, so a `?color=brown+melange` request matches gallery containers spelled `brown melange`, `brown-melange`, or `brown_melange`). Each `<img>` is tagged `variantMatch: 'match' | 'mismatch' | 'none'`. The hint is surfaced both to scoring (above) and to the Claude evidence document. Add new query-key → attr mappings to `VARIANT_QUERY_KEYS` in `candidates.ts` if a retailer uses something other than `color`/`colour`.

4. **Stage 2 — Claude Haiku selection** (`parser/claude.ts`). `buildEvidence` assembles a structured evidence document — `PAGE_URL`, `OG_TITLE`/`OG_SITE_NAME`/`OG_DESCRIPTION`, `REQUESTED_VARIANT` (when the URL carries `?color=X` / `?colour=X`), `STRUCTURED_PRICE` (or "none"), `PRICE_SIGNALS` (the harvested snippets, when any), `JSON_LD_PRODUCT` (the selected node serialized, capped ~8k chars), the **numbered** `IMAGE_CANDIDATES` list with source tags (and explicit `suspect: related-products section` / `variant: match` / `variant: mismatch` annotations), then `PAGE_TEXT` (`stripHtml` — also strips `<svg>`/`<noscript>`/`<iframe>`/HTML comments — sized to fit the ~40k-char budget). The system prompt instructs the model to return JSON with `image_indices` (NOT URLs — by construction it cannot hallucinate a URL). Indices are normalized: clamped, deduped, non-integers dropped. The JSON parser tolerates ```json fences and prose preamble (strips them, falls back to the largest `{…}`slice).`mergeSelection`(pure, in`parser/index.ts`) fills metadata gaps (Claude's value wins only when og missed); arbitrates price (structured-data first; Claude wins only on same-currency disagreements >5%, an informed correction since Claude saw the structured price in evidence); maps `image_indices`to URLs in Claude's order. If Claude fails or selects nothing,`pickDefaultImages`falls back to the deterministic ranking (positive-score candidates preferred; widens to zero-score only when too few exist; suspect tail is last resort).`docTitle`is the very last fallback for`title`.

5. For each resolved image URL: fetch bytes (concurrency capped at 4), validate content-type against an image allowlist, validate size between 10KB and 10MB, write to R2 under `items/{userId}/{nanoid}`, return a `StoredImage` ref. Failures drop the URL rather than persisting a broken external — except in `storeImage` itself, where a non-OK fetch falls back to `{ kind: 'external', url }` so the user's browser still renders the image with its real fingerprint (the Worker can't fetch e.g. Akamai-gated CDN bytes, but the browser can).

**Bookmarklet path** (`parseProductFromHtml` → `parseHtmlMeta`). When the live URL is bot-blocked beyond what Wayback can rescue, the user clicks a "Save to Tack" bookmarklet on the product page; the frontend POSTs the rendered DOM + URL to the `parseFromHtml` tRPC procedure, which runs the same extract → Claude → image-store pipeline minus the network fetch. The user's browser already passed whatever challenge the site mounted, so the harvested HTML is post-render (every JSON-LD blob, every `srcset` the page would show). Same rate-limit and same Claude budget as `parseUrl`. See `web/CLAUDE.md` → "Bookmarklet drop-zone" for the frontend half.

Claude returns JSON only — the system prompt lives in `services/parser/claude.ts`; the HTTP call is `lib/anthropic.ts:callClaude` (auto-retries 429/5xx with backoff, three attempts). The model ID is pinned: `claude-haiku-4-5-20251001`. Bump intentionally.

If Claude fails after retries, we swallow it and return the deterministic extraction. The user gets a partial card with a `claude_failed` warning rather than a hard failure.

Cap: `MAX_IMAGES = 12` per item, `MAX_CANDIDATES = 20` shown to Claude, `IMAGE_FETCH_CONCURRENCY = 4`.

**Why this shape.** The model is no longer asked to extract image URLs from blind stripped text (it would hallucinate, then a downstream intersection step would drop legitimate candidates and keep invented ones — the historical source of both _missing_ images and _wrong_ images). It picks from a list. The static stage is unit-testable without an API key; the Claude stage is bounded by the candidate pool.

### Statistical model

The deterministic image scorer is structurally a **log-linear binary classifier** over the candidate pool. Naming the model out loud lets us reason about it (calibrate the bias, threshold on probabilities, measure precision/recall) instead of just tweaking weights blindly.

```
score(x) = Σ_i w_i · f_i(x)            // additive contribution per source
p(x is product image) = σ(score(x) - bias)
```

- `f_i(x) ∈ {0, 1}` is a binary feature per discovery source (`jsonld`, `og`, `rebuilt`, `script-samedir`, `img`, `img-offhost`, `img-variant-match`, `img-variant-mismatch`, `img-suspect`, `script`) plus two filename-derived features (`hi_res_hint`, `low_quality_hint`). Hi-res adds +1; low-quality subtracts 2.
- `w_i` is `SCORE_*` in `services/parser/candidates.ts`. Variant-match is the highest single positive (5); variant-mismatch is the strongest negative (-6) and removes the URL entirely when matches exist.
- `bias` (`SCORE_TO_LOGODDS_BIAS = 1.5`) anchors the sigmoid so a single same-host `<img>` (s=1) is _below_ the decision threshold (p≈0.38) while a single og:image (s=2) is _above_ it (p≈0.62).
- Decision rule for the no-Claude fallback (`pickDefaultImages`): take everything with `p ≥ 0.6`; if fewer than `MIN_CONFIDENT_CANDIDATES = 3`, widen to non-negative; last resort, fall back to penalized candidates. This is what stopped the K=12 fallback from padding picks with score=1 cross-sells.

The Claude stage still sees the full top-20 pool, scored and tagged — the probability framing is for the _fallback_, not for what Claude reads.

**Pipeline diagram** (each numbered stage produces the input for the next):

1. `parseHtml(html, variantHint?)` — single HTMLRewriter pass — emits og fields, every `<title>`/JSON-LD script body, and an `imgTagImages` array each tagged `{ suspect, variantMatch: 'match'|'mismatch'|'none' }`.
2. `extractFromJsonLd` / `extractFromMicrodata` / `extractTemplateImageUrls` / `extractRawImageUrls` — each turns raw text into a list of `ImageSource` URLs with a `tag` and `score` weight.
3. `scoreAndRankImages` — for each URL, dedupe by origin+normalized-path, sum source weights, apply hi-res/low-quality bonuses, and rank by score (stable on first-seen). Returns the top `MAX_CANDIDATES = 20`.
4. `extractCandidates` (`services/parser/candidates.ts`) — orchestrates 1-3, then applies a hard variant filter (drop all `img-variant-mismatch` whenever any `img-variant-match` survives) and the placeholder-segment drop.
5. `mergeSelection` (`services/parser/index.ts`) — combines the static extract with the Claude selection (or `null` → falls through to `pickDefaultImages`). Arbitrates price disagreement (Claude wins only on same-currency >5% deltas). Returns up to `MAX_IMAGES = 12` URLs in Claude's order.

**Calibration loop** — `test/parser/fixtures/*.expected.json` carry an `imageLabels: { positives, negatives }` block. `test/parser/score.ts` computes:

- `P@K` (precision @ K) — of the top-K _labeled_ candidates, what fraction are positive.
- `R@K` (recall @ K) — of the labeled positives in the pool, what fraction are in the top-K.
- `AP` (average precision over the labeled-candidate sequence) — the primary ranking-quality metric. Range [0, 1]; 1.0 = every positive precedes every negative.

The static suite prints a per-fixture metrics line on every run and asserts floors via `METRIC_FLOORS` in `score.ts`. Bumping `SCORE_TO_LOGODDS_BIAS` or `KEEP_PROB_THRESHOLD` or any `SCORE_*` weight should be done against this scoreboard, not by eyeballing one URL.

**Parser tests.** `test/parser/fixtures/` holds saved real retailer pages (`<site>.html` + `<site>.expected.json`) — currently Stussy (Shopify w/ full JSON-LD), Noah (Shopify w/o JSON-LD, price in analytics JSON), Everlane (Shopify ProductGroup + hasVariant), END (Next.js Magento — one JSON-LD image, rest in script JSON), Uniqlo (React SPA — no JSON-LD, no microdata, price only in script JSON), California Arts cream shirt (Shopify multi-color `?color=cream` URL — single-word variant hint), California Arts Lyndon Watchcoat (Shopify multi-color `?color=brown+melange` URL — multi-word slug normalization + lazyload `data-src` imgs in the matching container), Outerknown (Shopify with a malformed `"image": "https:files/..."` JSON-LD URL the parser must reject so it doesn't dominate the ranking), Allbirds (custom Shopify storefront — title/brand in og, price SPA-only — and PDP material icons that only Claude can exclude), Thursday Boots (classic Shopify with a double-encoded apostrophe `Men&amp;#39;s` in og:title — exercises the decode-until-stable loop), and Taylor Stitch (Shopify with multiple og:image tags, brand only in og:site_name). Expectations carry `imageMustMatch` (SKU fragments that must appear), `imageMustNotMatch` (related-product SKUs that must NOT appear), `imageLabels` (positive/negative URL substrings labeling the full candidate pool for precision/recall/AP), `structuredPrice` (false → static test skips the price assertion; live eval still checks), `skipStatic` (fields only Claude can produce). `pipeline.test.ts` runs the deterministic stage against every fixture offline; `eval.live.test.ts` runs the full pipeline against the real Anthropic API — `pnpm test:eval` from the worker or root (gated by `EVAL=1` in the script; key from `ANTHROPIC_API_KEY` or `worker/.dev.vars`; never spent on a plain `pnpm test`). When parsing quality regresses on a site, capture the fixture and add expectations rather than hand-testing:

```bash
pnpm parser:capture <name> 'https://...'     # writes fixture HTML + stub .expected.json
# fill in the stub with title/brand/SKU substrings, then:
pnpm test:worker                              # static suite — no API key needed
pnpm parser:eval                              # live Claude pipeline (needs ANTHROPIC_API_KEY in worker/.dev.vars)
```

`pnpm parser:eval` is the continuous eval entry point: it loops every fixture through the full extract → Claude-selection → merge pipeline and prints a per-fixture scorecard, so the test/iterate cycle is one command after each parser change. Add a fixture, run it, fix what regresses, repeat.

Fixtures are read by `vitest.config.ts` under Node and injected as the `PARSER_FIXTURES` binding (the workers pool has no filesystem).

## Validation

Zod 4 for everything crossing the wire. Input schemas (`AddItemBody`, `PatchBoardItemBody`) live in `schemas/`. Procedure inputs are wrapped in `z.object({ ... })` in the router.

Output validation lives in the **service**, not the router. `addBoardItem` parses with `BoardItemRowSchema` before returning; that's the boundary that catches DB-shape drift. The router's `toBoardItemWire` is a pure, total mapping (`StoredImage` → display URL) — no re-parse needed. Don't add a router-side `z.parse` "for safety"; it can't catch anything the service-side parse missed.

## Scripts

All scripts work from the repo root (mirrored as `pnpm <name>`) or from `worker/`. See the root `CLAUDE.md` for the full table.

- `dev` — `wrangler dev` (port 8787)
- `deploy` — `wrangler deploy`
- `lint` — `tsc --noEmit && eslint .`
- `test` / `test:watch` — `vitest`
- `typegen` — regenerate `worker-configuration.d.ts` from `wrangler.toml`
- `db:*` — see Migrations section above
