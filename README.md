# Tack

Personal moodboard web app for assembling clothing purchases on a free-form canvas.

## Product

Paste a product URL, an LLM extracts the title, brand, price, and images, and a draggable card lands on a pannable, zoomable canvas. Items snap into place with spring physics, expand to focus when clicked, and drag at near-native latency. The point is to think about a wardrobe spatially — group outfits, compare alternatives, sit with a purchase before pulling the trigger — instead of juggling browser tabs.

Interaction feel is treated as a first-class goal, not polish. Optimistic UI everywhere: cards appear immediately on add, drags commit fire-and-forget, deletes roll back on failure.

**Current state:** canvas (pan/zoom/drag/expand), URL parse → R2 → board item, optimistic add/delete, position sync, end-to-end types via tRPC. No auth, no multi-board UI, no production deploy yet.

## Stack

| Layer         | Choice                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| Frontend      | React 19, Vite, TypeScript                                                  |
| Styling       | Tailwind v4 (`@tailwindcss/vite`, no config file)                           |
| Animation     | Framer Motion (springs, `layoutId` for expand-to-focus)                     |
| Gesture       | `@use-gesture/react`                                                        |
| Client state  | Zustand (interaction only — multi-select ids/primaryId, z-indices)          |
| Server state  | TanStack Query v5                                                           |
| API           | tRPC over Hono on Cloudflare Workers                                        |
| DB            | Cloudflare D1 (SQLite) + Drizzle ORM                                        |
| Image storage | Cloudflare R2, streamed via `GET /api/images/*` (not tRPC)                  |
| AI            | Anthropic Claude Haiku `claude-haiku-4-5-20251001` (direct `fetch`, no SDK) |
| Validation    | Zod 4                                                                       |

## Layout

pnpm workspaces monorepo.

```
web/      React frontend
worker/   Hono + tRPC backend on Cloudflare Workers
```

The frontend imports `AppRouter` from `worker/src/router` for end-to-end types — keep that path working. Each workspace has its own `CLAUDE.md` with layering rules and conventions; `CLAUDE.md` at the root has the architectural invariants.

## Running locally

Requires Node, [pnpm via corepack](https://pnpm.io/installation#using-corepack), and an Anthropic API key.

```bash
# 1. Put ANTHROPIC_API_KEY in worker/.dev.vars (gitignored)
# 2. From the repo root:
pnpm install
pnpm db:migrate:local   # apply migrations to local D1
pnpm db:seed:local      # seed board-1 with 3 placeholder items
pnpm dev                # web (5173) + worker (8787) concurrently
```

Then open the Vite URL printed in the terminal. The frontend reads the active board from `localStorage` (`activeBoardId`) — the seed creates `board-1`.

Run `pnpm dev:web` or `pnpm dev:worker` to start only one.

## Scripts

All scripts work from the repo root or from inside a workspace. Bare names hit the natural target; `:web` / `:worker` suffixes pin a workspace.

| Script             | What it does                               |
| ------------------ | ------------------------------------------ |
| `dev`              | web + worker, concurrently                 |
| `build`            | web production build                       |
| `preview`          | serve the built frontend                   |
| `lint`             | typecheck + ESLint across workspaces       |
| `test`             | vitest across workspaces                   |
| `deploy`           | `wrangler deploy` (worker)                 |
| `db:generate`      | new Drizzle migration (`-- --name <desc>`) |
| `db:migrate`       | apply migrations to remote D1              |
| `db:migrate:local` | apply migrations to local D1               |
| `db:seed:local`    | apply `seed.sql` to local D1               |
| `db:studio`        | drizzle-kit studio UI                      |

`check-app.spec.ts` at the repo root is a Playwright smoke check (loads the canvas, screenshots, counts cards). Run with `pnpm exec playwright test`.

## Conventions

- TypeScript strict mode everywhere.
- Prettier with `prettier-plugin-organize-imports` and `prettier-plugin-tailwindcss` — don't hand-sort imports.
- Husky + lint-staged run `eslint --fix --max-warnings=0` on staged `.ts`/`.tsx` and Prettier on the rest. Don't bypass with `--no-verify`.
- File naming: components `PascalCase.tsx`, hooks `useCamelCase.ts`, everything else `camelCase.ts`.
- Comments only when the _why_ is non-obvious; no emojis in code.
- `.npmrc` enforces `minimum-release-age=4320` (3 days) as a supply-chain guard. New deps that need install-time native compilation must be added to `pnpm-workspace.yaml`'s `allowBuilds`.

## Architectural invariants

These are load-bearing — see the per-workspace `CLAUDE.md` files for the long form.

**Frontend**

- `web/src/api/*.ts` — pure async wrappers around the tRPC client. No React.
- `web/src/hooks/*.ts` — TanStack Query hooks. All server state lives here.
- `web/src/store/*.ts` — Zustand, **interaction state only**. Never server data.
- Position PATCH on drag end is fire-and-forget; Framer Motion already shows the right position.
- URL add uses an optimistic skeleton card (id prefix `__skeleton__`) injected in `onMutate`, swapped in `onSuccess`, rolled back in `onError`.

**Backend**

- tRPC routers in `worker/src/routers/` are thin — parse input, delegate to `worker/src/services/`.
- Services take `Db` (drizzle) as a parameter, not the request context.
- Image bytes never go through tRPC — they stream from R2 via `GET /api/images/*`.
- URL parsing is two-stage: a deterministic extractor (`parser/candidates.ts`) builds a scored, numbered image-candidate pool from og tags, JSON-LD, microdata, raw script-JSON scans, and `<img>` tags (with related/recommendation containers penalized); Claude Haiku then reads a structured evidence document and **selects candidate indices** rather than emitting URLs, so it cannot hallucinate. Static stage works without the API; failures are covered by a fixture-driven test suite (`pnpm test:eval` runs the Claude path against real pages). See `worker/CLAUDE.md` for the spec.
