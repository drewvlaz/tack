# fashion-mood

Personal moodboard web app for assembling clothing purchases on a free-form canvas. Paste a product URL → AI extracts metadata + images → draggable card appears on a pannable/zoomable canvas. Interaction feel (spring physics, expand-to-focus, low-latency drag) is a first-class goal, not a polish item.

See also: `moodboard-spec.md` (original product brief), `web/CLAUDE.md`, `worker/CLAUDE.md`.

## Layout

npm workspaces monorepo.

```
web/      React 19 + Vite frontend
worker/   Hono + tRPC on Cloudflare Workers (D1, R2, Anthropic API)
```

Root scripts (`package.json`):

- `npm run dev` — frontend dev server (Vite, port 5173/5174)
- `npm run dev:worker` — `wrangler dev` for the backend (port 8787)
- `npm run build` — frontend production build
- `npm run lint` — typecheck + ESLint across both workspaces

Frontend talks to the worker via tRPC at `${VITE_API_URL ?? 'http://localhost:8787'}/trpc`. Images are served via the worker's `/api/images/*` proxy (not tRPC).

## Tech stack

| Layer         | Choice                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Frontend      | React 19 + Vite + TypeScript                                                                       |
| Styling       | Tailwind CSS v4 (no config file, `@tailwindcss/vite` plugin, `@import "tailwindcss"` in CSS)       |
| Animation     | Framer Motion (springs, `layoutId` for expand-to-focus)                                            |
| Gesture       | `@use-gesture/react`                                                                               |
| Client state  | Zustand (interaction only — selectedId, zIndices)                                                  |
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
- ESLint runs as `tsc --noEmit && eslint .` per workspace. Pre-commit (husky + lint-staged) runs `eslint --fix --max-warnings=0` on staged `.ts`/`.tsx` files and Prettier on everything else. Don't bypass with `--no-verify`.
- Imports: organized automatically by Prettier plugin — don't hand-sort.
- File naming: components `PascalCase.tsx`, hooks `useCamelCase.ts`, everything else `camelCase.ts`.
- No emojis in code or comments.
- Comments only when the _why_ is non-obvious (hidden constraint, invariant, workaround). Don't restate what the code does.

## Architectural invariants

These are load-bearing — break them and the layering collapses.

**Frontend (see `web/CLAUDE.md` for details):**

- `web/src/api/*.ts` — pure async functions wrapping the tRPC client. No React, no hooks.
- `web/src/hooks/*.ts` — TanStack Query (`useQuery`/`useMutation`) wrapping the api fns. All server state lives here.
- `web/src/store/*.ts` — Zustand, **interaction state only** (selected card, z-index stack). Never server data.
- Position PATCH on drag end is fire-and-forget. Framer Motion already shows the correct position; we don't await the server.
- URL add uses an optimistic skeleton card injected into the query cache in `onMutate`, swapped for the real card in `onSuccess`, rolled back in `onError`. Skeleton IDs are prefixed `__skeleton__` — use `isSkeleton(id)` to guard interactions.

**Backend (see `worker/CLAUDE.md` for details):**

- tRPC routers in `worker/src/routers/` are thin — they parse input and delegate to `worker/src/services/`.
- All non-trivial logic lives in `services/`. Services take `Db` (drizzle) as a parameter — they don't import the request context.
- Image bytes never go through tRPC. They stream from R2 via the Hono route `GET /api/images/*`. The frontend resolves `/api/...` URLs against `VITE_API_URL` in `web/src/lib/api.ts:resolveImageUrl`.
- The `AppRouter` type is imported by the frontend from `../../../worker/src/router` to get end-to-end types — keep that path working.

## Running locally

```bash
# 1. Backend (needs ANTHROPIC_API_KEY)
cd worker
# put ANTHROPIC_API_KEY in .dev.vars (gitignored)
npm run db:migrate:local   # apply migrations to local D1
npm run db:seed:local      # seed board-1 with 3 placeholder items
npm run dev                # wrangler dev → http://localhost:8787

# 2. Frontend
cd web
npm run dev                # vite → http://localhost:5173 (or 5174)
```

The frontend hardcodes `BOARD_ID = 'board-1'` (see `web/src/components/Canvas.tsx`), which matches the seed.

## DB schema (D1, managed by Drizzle)

Defined in `worker/src/db/schema.ts`. Tables:

- `boards` — board metadata.
- `items` — canonical product (title, brand, description, price, source URL). Shared across boards in theory; one row per parsed URL.
- `item_images` — N images per item, ordered by `display_order`. `r2_key` points into R2.
- `board_items` — placement of an item on a board (x, y, width, height, z_index). Unique on `(board_id, item_id)`.

Generate migrations: `cd worker && npm run db:generate`. Apply locally: `npm run db:migrate:local`. Apply to prod: `npm run db:migrate`.

## Testing

`check-app.spec.ts` at the repo root is a Playwright smoke check (loads the canvas, dumps console errors, screenshots, counts cards). Run with `npx playwright test`. There is no broader test suite yet.

## What's done vs. what's not

- Done: canvas interaction (pan/zoom/drag/expand), URL parse → R2 → board item, optimistic add/delete, position sync, end-to-end types via tRPC.
- Not yet: auth, multi-board UI, deploy config (D1 `database_id` is still `placeholder-replace-after-create` in `worker/wrangler.toml`), production `VITE_API_URL`.
