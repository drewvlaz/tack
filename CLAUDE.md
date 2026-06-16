# Tack

Personal moodboard web app for assembling clothing purchases on a free-form canvas. Paste a product URL → AI extracts metadata + images → draggable card appears on a pannable/zoomable canvas. Interaction feel (spring physics, expand-to-focus, low-latency drag) is a first-class goal, not a polish item.

See also: `web/CLAUDE.md`, `worker/CLAUDE.md`.

## Layout

pnpm workspaces monorepo. Workspaces listed in `pnpm-workspace.yaml`.

```
web/      React 19 + Vite frontend
worker/   Hono + tRPC on Cloudflare Workers (D1, R2, Anthropic API)
```

## Package manager

pnpm, activated via corepack (`packageManager` field pins the version). `.npmrc` sets:

- `minimum-release-age=4320` — never install a package version <3 days old. Supply-chain guard against compromised-then-yanked publishes. `pnpm-workspace.yaml` carries a `minimumReleaseAgeExclude` list for versions that were already locked when the policy was introduced (e.g. `@cloudflare/workers-types@4.20260607.1`).
- `pnpm-workspace.yaml` `allowBuilds` allowlists postinstall scripts that are actually needed (`esbuild`, `sharp`, `workerd`). pnpm blocks all build scripts by default; add new entries here when adding a dep that legitimately needs install-time native compilation.

## Scripts

Every command runs from the repo root **or** from inside a workspace — the root mirrors each workspace script via `pnpm --filter`. From root, bare names hit the natural target (web for `build`, both for `dev`/`lint`/`test`); `:web` / `:worker` suffixes pin a workspace.

| Script                                          | Root (`pnpm <name>`)                              | Web (`web/`) | Worker (`worker/`) |
| ----------------------------------------------- | ------------------------------------------------- | ------------ | ------------------ |
| `dev`                                           | both, concurrently (`concurrently`)               | Vite         | `wrangler dev`     |
| `dev:web`                                       | web only                                          | —            | —                  |
| `dev:worker`                                    | worker only                                       | —            | —                  |
| `build` / `build:web`                           | web prod build                                    | ✓            | —                  |
| `preview`                                       | Vite preview                                      | ✓            | —                  |
| `lint` / `:web` / `:worker`                     | typecheck + ESLint per workspace                  | ✓            | ✓                  |
| `test` / `:web` / `:worker`                     | vitest                                            | ✓            | ✓                  |
| `parser:eval`                                   | live Claude pipeline against every fixture        | —            | ✓                  |
| `parser:capture`                                | snapshot a real retailer page as a fixture        | —            | ✓                  |
| `deploy:staging` / `:production`                | typegen + migrate + `wrangler deploy --env <env>` | —            | ✓                  |
| `deploy:pages:staging` / `:production`          | build SPA + `wrangler pages deploy` per branch    | ✓ (build)    | ✓ (deploy)         |
| `typegen`                                       | `wrangler types`                                  | —            | ✓                  |
| `db:generate`                                   | `drizzle-kit generate` (pass `-- --name <desc>`)  | —            | ✓                  |
| `db:migrate:local` / `:staging` / `:production` | apply migrations to that D1                       | —            | ✓                  |
| `db:seed:local`                                 | apply `seed.sql` to local D1                      | —            | ✓                  |
| `db:studio`                                     | drizzle-kit studio UI                             | —            | ✓                  |

**Adding a new script:** add it to the owning workspace's `package.json`, then mirror at root as `"<name>": "pnpm --filter @tack/<workspace> run <name>"`. Cross-workspace scripts that should fan out (lint/test) use `pnpm -r --if-present run <name>`. Pass args directly: `pnpm <name> <args>`.

Frontend talks to the worker via tRPC at `${VITE_API_URL ?? 'http://localhost:8787'}/trpc`. Images are served via the worker's `/api/images/*` proxy (not tRPC).

## Tech stack

| Layer         | Choice                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Frontend      | React 19 + Vite + TypeScript                                                                       |
| Styling       | Tailwind CSS v4 (no config file, `@tailwindcss/vite` plugin, `@import "tailwindcss"` in CSS)       |
| Animation     | Framer Motion (springs, `layoutId` for expand-to-focus)                                            |
| Gesture       | `@use-gesture/react`                                                                               |
| Client state  | Zustand (interaction only — `useSelectionStore` (ids/primaryId), `useCanvasStore` (zIndices))      |
| Server state  | TanStack Query v5                                                                                  |
| API client    | tRPC client (`@trpc/client`) — end-to-end typed via shared `AppRouter` import                      |
| Backend       | Hono on Cloudflare Workers                                                                         |
| API surface   | tRPC (`@trpc/server`) for everything except image streaming                                        |
| DB            | Cloudflare D1 (SQLite) + Drizzle ORM                                                               |
| Image storage | Cloudflare R2                                                                                      |
| AI            | Anthropic Claude Haiku `claude-haiku-4-5-20251001` (direct `fetch` to `api.anthropic.com`, no SDK) |
| Validation    | Zod 4                                                                                              |
| IDs           | `nanoid`                                                                                           |

## Conventions

- TypeScript everywhere, strict mode.
- Prettier: single quotes, 2-space indent, semicolons, with `prettier-plugin-organize-imports` and `prettier-plugin-tailwindcss`.
- Lint runs as `tsc -b && eslint .` in the web workspace and `tsc --noEmit && eslint .` in the worker. (Web uses TS project references with a "solution" root tsconfig — `"files": []` plus references — so `tsc --noEmit` would silently typecheck nothing; build mode is required to walk references. Worker is a single project; either form works.) Pre-commit (husky + lint-staged) only runs `eslint --fix --max-warnings=0` on staged `.ts`/`.tsx` files and Prettier on the rest — note that ESLint does NOT typecheck, so a missing identifier still won't be caught by the hook; rely on `pnpm lint` (and CI) for that. Don't bypass with `--no-verify`.
- Imports: organized automatically by Prettier plugin — don't hand-sort.
- File naming: components `PascalCase.tsx`, hooks `useCamelCase.ts`, everything else `camelCase.ts`.
- No emojis in code or comments.
- Comments only when the _why_ is non-obvious (hidden constraint, invariant, workaround). Don't restate what the code does.
- **Logging.** Always use the configured `consola` logger — `web/src/lib/log.ts` exports `log` for the frontend, `worker/src/lib/log.ts` exports `log` (and `configureLogger(env)`) for the worker. Never `console.log` / `console.warn` / `console.error` — those bypass the level filter and the production bundle keeps them. Use `log.debug` for diagnostic traces (DCE'd in prod via the level), `log.info`/`log.warn`/`log.error` for normal runtime messages. Pass structured context as a second argument (`log.warn('parse warnings', { warnings, url })`), not as a string-interpolated message.

## Dev flow

Tickets live in Kan.bn — workspace `drewvlaz`, board **Tack** (publicId `dqx7as85uc30`, card prefix `TAC`). **One card = one PR.** Cards and PRs are 1:1; if a card grows past a single PR's worth of work, file a sibling card with a "Depends on TAC-N" line — never let one card own multiple merged PRs.

The five lists ARE the workflow state — moving the card is the status update:

`Backlog` → `Todo` (committed for this stretch) → `In Progress` (branched) → `In Review` (PR open) → `Done` (PR merged).

Every piece of work follows the same loop:

1. **Pick or file a card.** New work → file in `Backlog`. Existing card → move it to `Todo` when you commit to it this stretch.
2. **Start.** Move to `In Progress`. `git checkout -b <slug>` off `main` — never commit on `main` directly.
3. **Commit** with `tag: desc` (`feat:`, `fix:`, `refactor:`, `dev:`, `chore:`). Match the existing history — `tag: short description`, not `[scope] tag: description`.
4. **Push.** `git push -u origin <branch>`.
5. **Open PR.** `gh pr create` with a short title and a body containing **Summary** + **Test plan** + a `Tracking: <kan.bn card url>` line. Move the card to `In Review` and paste the PR URL into the card.
6. **Merge.** Move the card to `Done`.

Stage only files belonging to the current change — pre-existing dirty files in the working tree stay uncommitted. Don't amend, don't force-push, don't push to `main`.

**Card shape** (when filing — skip the template for one-liners):

```
Title:   <imperative, ≤70 chars>           e.g. "Add text kind to board_items schema"
Body:
  Why    — one sentence on what this unlocks (link parent card if there is one)
  What   — bullets: schema/file pointers, "user can ___", "API now ___"
  Out    — deliberate scope cuts a reviewer might assume
  Done   — observable criteria, not "implementation complete"
Labels:  phase-N + scope (web / worker / schema / infra) + risk (load-bearing-schema / breaking-change / migration) as applicable
```

**Hotfix exception.** Trivial fixes (typo, one-line config, dead code) can ship without a pre-filed card — but file the card retroactively in `Done` with the PR URL so the planning history stays consistent.

**WIP cap.** Soft rule: no more than two cards in `In Progress` at a time. Forces finishing before starting.

**Never Linear.** The Linear MCP is wired up in some environments — don't use it for tack. Kan.bn or GitHub Issues only; Kan.bn is the source of truth here.

## Keeping the docs honest

Treat `CLAUDE.md` (this file), `web/CLAUDE.md`, `worker/CLAUDE.md`, and `README.md` as **part of the design** — not commentary on it. When you change anything they describe, update them in the same change:

- **Trigger.** A new architectural rule, layering invariant, atomicity boundary, deployment script, env binding, table relationship, parsing-pipeline stage/scoring source, or any other behavior the docs already spell out. Renames of files/functions/types referenced in the docs count too.
- **What to do.** Find the section that names the thing you changed (`rg -n '<symbol>' CLAUDE.md web/CLAUDE.md worker/CLAUDE.md README.md`) and edit it. If a numbered/bulleted list is now wrong, fix the right bullet — don't tack on a "Note:" at the bottom. New behavior usually goes inside an existing section; only add a new section when the existing structure has no home for it.
- **What NOT to do.** Don't leave dead pointers (renamed functions, deleted scopes, removed scripts). Don't restate what the code already shows ("`foo(bar)` calls `bar`") — the docs are for the WHY, the invariants, and the non-obvious load-bearing details. Don't write a CHANGELOG entry; the doc reflects current state.
- **Where each lives.** Architectural invariants and cross-workspace concerns → this file. Frontend layering, store/api/hook split, design tokens → `web/CLAUDE.md`. Service rules, atomicity boundaries, parsing flow, DB/migrations → `worker/CLAUDE.md`. Public-facing summary → `README.md`. When a fact lives in two places (e.g. "Anthropic Claude Haiku" model id), update both.
- **Verification.** After the doc edit, search for the thing's old name — if anything still references it, fix that too.

If you're about to ship a refactor or a new feature and the docs above haven't been touched, pause and ask whether they should be — the answer is usually yes.

## Architectural invariants

These are load-bearing — break them and the layering collapses.

**Frontend (see `web/CLAUDE.md` for details):**

- `web/src/api/*.ts` — pure async functions wrapping the tRPC client. No React, no hooks.
- `web/src/hooks/*.ts` — TanStack Query (`useQuery`/`useMutation`) wrapping the api fns. All server state lives here.
- `web/src/store/*.ts` — Zustand, **interaction state only**. `useSelectionStore` owns the multi-select set (`ids: ReadonlySet<string>`, `primaryId` for SidePanel focus); `useCanvasStore` owns the per-card z-index stack. Never server data.
- Selection is multi-card via a drag-to-create marquee (containment, not intersection). Plain drag on empty canvas draws the box; **hold Space to pan**; Shift+drag adds, Alt+drag subtracts. Shift+click adds, Cmd/Ctrl+click toggles. Cmd/Ctrl+A selects all on the active board.
- Position PATCH on drag end is fire-and-forget. Framer Motion already shows the correct position; we don't await the server. Group drag uses `boards.patchItemsMany` (one atomic batch); group delete uses `boards.deleteItemsMany`.
- URL add uses an optimistic skeleton card injected into the query cache in `onMutate`, swapped for the real card in `onSuccess`, rolled back in `onError`. Skeleton IDs are prefixed `__skeleton__` — use `isSkeleton(id)` to guard interactions.

**Backend (see `worker/CLAUDE.md` for details):**

- tRPC routers in `worker/src/routers/` are thin — they parse input and delegate to `worker/src/services/`.
- All non-trivial logic lives in `services/`. Services take `Db` (drizzle) as a parameter — they don't import the request context.
- Image bytes never go through tRPC. They stream from R2 via the Hono route `GET /api/images/*`. The frontend resolves `/api/...` URLs against `VITE_API_URL` in `web/src/lib/api.ts:resolveImageUrl`.
- The `AppRouter` type is imported by the frontend from `../../../worker/src/router` to get end-to-end types — keep that path working.

## Portability / cloud lock-in

The stack binds to Cloudflare (Workers, D1, R2, rate-limit bindings, Durable Objects in Phase 2). Pre-DO lock-in is low — a weekend of work to move to a container + Postgres + S3-compat. Once the DO transport ships, the live-updates layer becomes a rewrite to leave. Keep that gradient in mind when adding code:

- **Don't import CF bindings into services.** Services see `Tx` / `Db` / typed adapters (e.g. `images`) — never `env`, never `c.env.IMAGES.put()`, never `env.PARSE_LIMITER.limit()`. CF-specific APIs (`R2Bucket`, `RateLimit`, `ctx.waitUntil`, `DurableObjectNamespace`) live at the router or Hono-route boundary. This invariant doubles as portability insurance — services drop onto Node/Postgres unchanged.
- **Don't assume interactive transactions exist.** D1 doesn't have them — the `Tx` accumulator (`tx.stage(...)` + `withTransaction`) is the workaround. Every mutating endpoint (tRPC procedure or Hono route) wraps in `withTransaction`; one block is the atomicity unit. Side effects outside the accumulators (Anthropic calls, R2 uploads, rate-limit tokens, cross-request flows) are NOT rolled back — see `worker/CLAUDE.md` "Atomicity boundaries" for the full enumeration. The same `Tx` shape wraps `db.transaction(cb)` on Postgres or `state.storage.transaction(cb)` on a DO; never reach for a `BEGIN`-style API.
- **Defer Durable Objects until the feature truly needs single-broadcaster-per-board semantics.** Counters, queues, KV-style state, simple coordination all have portable alternatives. Phase 2's live-updates broadcaster is the one component with no off-CF equivalent — adopting a DO for anything else commits that subsystem to CF for no payoff.
- **Portable as-is:** Drizzle (multi-dialect), tRPC, Hono (multi-runtime), the cookie-session auth scheme, the `/api/images/*` proxy route. Don't sprinkle CF idioms into these.

## Running locally

```bash
# Put ANTHROPIC_API_KEY in worker/.dev.vars (gitignored), then from the repo root:
pnpm db:migrate:local   # apply migrations to local D1
pnpm db:seed:local      # seed board-1 with 3 placeholder items
pnpm dev                # web (5173/5174) + worker (8787) concurrently
```

Run `pnpm dev:web` or `pnpm dev:worker` to start only one. Anything that works at root also works inside `web/` or `worker/`.

The frontend reads the active board from `localStorage` via `useBoardsStore` (key `activeBoardId`). The seed creates `board-1`, which the boards sidebar will list and the user can select.

## Deploying

Two backend environments (`staging` and `production` in `worker/wrangler.toml`), each with its own Worker, D1, R2, secrets, and `FRONTEND_ORIGIN`. The frontend is **one** Cloudflare Pages project (named `tack`; its assigned subdomain is `tack-cxk.pages.dev` since `tack.pages.dev` was taken) using branch environments, git-flow style:

| Env        | Worker                | Pages branch | URL                               |
| ---------- | --------------------- | ------------ | --------------------------------- |
| staging    | `tack-worker-staging` | `main`       | `https://main.tack-cxk.pages.dev` |
| production | `tack-worker`         | `production` | `https://tack-cxk.pages.dev`      |

`production` is the Pages project's production branch; `main` deploys land as the stable branch-alias preview. Promote by deploying with `--branch production` (or merging `main` → `production` if the repo is connected for CI builds). The rate-limit bindings are commented out in `worker/wrangler.toml` (re-enable when on Workers Paid; code already handles missing bindings).

**One-time setup per worker env** (replace `<env>` with `staging` or `production`):

```bash
wrangler login                                                      # once per machine
wrangler d1 create tack-<env>                                       # paste the ID into worker/wrangler.toml under [[env.<env>.d1_databases]]
wrangler r2 bucket create tack-<env>-images
wrangler secret put ANTHROPIC_API_KEY --env <env>                   # paste the key when prompted
pnpm deploy:<env>                                                   # regenerates types, applies migrations, deploys the worker
```

**One-time Pages setup** (once, not per env — run from `worker/` so wrangler resolves):

```bash
pnpm --filter @tack/worker exec wrangler pages project create tack --production-branch production
```

If the Pages URLs differ from the table above (custom domain, taken project name), update `FRONTEND_ORIGIN` in `worker/wrangler.toml` per env and redeploy the worker.

**Routine deploys:**

```bash
pnpm deploy:staging          # typegen + db:migrate:staging + wrangler deploy --env staging
pnpm deploy:pages:staging    # build SPA against staging API, deploy to branch `main`

pnpm deploy:production       # typegen + db:migrate:production + wrangler deploy --env production
pnpm deploy:pages:production # build SPA against prod API, deploy to branch `production`
```

`deploy:<env>` chains `typegen` → `db:migrate:<env>` → `wrangler deploy --env <env>`, so types and the remote D1 are in sync with the worker that's about to ship. Any step failing fails the chain — a broken migration won't be followed by a deploy that references the new schema. The migration step calls into Drizzle; read the destructive-migration rules in `worker/CLAUDE.md` before running any migration in production.

**CI/CD.** `.github/workflows/deploy-staging.yml` runs on every push to `main` (and via `workflow_dispatch`): lint + test → `pnpm deploy:staging` → `pnpm deploy:pages:staging`. Concurrency group `deploy-staging` with `cancel-in-progress: false` serializes runs so a half-applied D1 migration can't be interrupted. To avoid wasted deploys when several commits land on `main` in a burst, the job's first step compares `GITHUB_SHA` to current `origin/main` HEAD; if a newer commit has already landed, the run fast-exits (every later step is gated on the stale flag) so only the actual tip ends up deploying. Required repo secrets: `CLOUDFLARE_API_TOKEN` (Workers + Pages edit scope) and `CLOUDFLARE_ACCOUNT_ID`. The worker's `ANTHROPIC_API_KEY` lives as a wrangler secret on the deployed worker, not in GitHub. Production deploys are still manual (`pnpm deploy:production` + `pnpm deploy:pages:production`); add a mirror workflow keyed to the `production` branch when you want automated promotion.

## DB schema (D1, managed by Drizzle)

Defined in `worker/src/db/schema.ts`. Tables:

- `boards` — board metadata.
- `items` — canonical product (title, brand, description, price, source URL). Shared across boards in theory; one row per parsed URL.
- `item_images` — N images per item, ordered by `display_order`. `r2_key` points into R2.
- `board_items` — placement of an item on a board (x, y, width, height, z_index). Unique on `(board_id, item_id)`.

Generate migrations: `pnpm db:generate --name <description>`. Apply locally: `pnpm db:migrate:local`. Apply to staging/prod: `pnpm db:migrate:staging` / `pnpm db:migrate:production`. All work from root or `worker/`.

## Testing

`check-app.spec.ts` at the repo root is a Playwright smoke check (loads the canvas, dumps console errors, screenshots, counts cards). Run with `pnpm exec playwright test`.

Worker has a vitest suite under `worker/test/` (`pnpm test:worker` or root `pnpm test`). The parser has a fixture-driven suite at `worker/test/parser/fixtures/` — `pipeline.test.ts` asserts the deterministic stage offline against saved retailer pages; `eval.live.test.ts` runs the full Claude-included pipeline against the real Anthropic API via `pnpm test:eval` (key from `ANTHROPIC_API_KEY` or `worker/.dev.vars`; never spent on a plain `pnpm test`). See `worker/CLAUDE.md` → "URL parsing flow" for the design and how to add a fixture.

## What's done vs. what's not

- Done: canvas interaction (pan/zoom/drag/expand), URL parse → R2 → board item, optimistic add/delete, position sync, end-to-end types via tRPC.
- Done: auth, deploy scaffolding (staging + production envs in `worker/wrangler.toml` and `web/.env.*`, deploy scripts).
- Not yet: multi-board UI, real-time collab (Phase 2 DOs — see `docs/architecture-live.html`), rate-limit bindings re-enabled (require Workers Paid; bindings commented out in `wrangler.toml`).
