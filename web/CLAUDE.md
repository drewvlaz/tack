# web/

React 19 + Vite frontend. Renders the canvas, talks to the worker via tRPC, owns interaction state. See root `CLAUDE.md` for product context and stack.

## Directory map

```
src/
├── api/           Pure async fns wrapping tRPC client. No React, no hooks.
│   ├── boards.ts  getItems, patchBoardItem, addItem, deleteItem
│   └── parse.ts   parseUrl
├── components/    PascalCase.tsx. View layer. Subcomponents nest under their parent folder.
│   ├── AppUI.tsx            Screen-space overlay (BoardsSidebar + SidePanel)
│   ├── BoardsSidebar.tsx    Left rail: list, create, rename, delete boards
│   ├── Canvas/
│   │   ├── Canvas.tsx       Pan/zoom container; renders Cards + UrlBar + ZoomBar
│   │   ├── Card.tsx         Draggable card on the canvas
│   │   ├── UrlBar.tsx       URL input → useAddItem
│   │   └── ZoomBar.tsx      Zoom controls bound to canvas zoom MV
│   ├── SidePanel/
│   │   ├── SidePanel.tsx    Right rail: details for the selected item
│   │   ├── TopBar.tsx       Close + re-parse buttons
│   │   ├── Hero.tsx         Hero image + thumbnail strip
│   │   ├── ImageLightbox.tsx  Full-bleed image overlay
│   │   ├── Details.tsx      Title/brand/price/description/metadata
│   │   └── RemoveButton.tsx Delete-with-confirm
│   └── shared/
│       ├── ConfirmDialog.tsx
│       └── Rail.tsx         Resizable left/right rail container
├── hooks/
│   ├── server/         TanStack Query — server state (boards + items)
│   │   ├── useBoards.ts, useCreateBoard.ts, useDeleteBoard.ts, useRenameBoard.ts
│   │   ├── useBoardItems.ts   useQuery — items on a board
│   │   ├── useAddItem.ts      useMutation — parseUrl → addItem with optimistic skeleton
│   │   ├── useDeleteItem.ts   useMutation — optimistic removal
│   │   ├── useReparseItem.ts  useMutation — re-fetch item from source URL
│   │   └── useSyncPosition.ts useMutation — PATCH x/y on drag end (fire-and-forget)
│   └── interaction/    Gesture hooks (Framer Motion + use-gesture)
│       ├── useCanvasGesture.ts Pan + zoom wiring (returns refs + motion values)
│       ├── useCardGesture.ts   Per-card drag gesture
│       └── useCardResize.ts    Per-card resize gesture
├── store/         Zustand. INTERACTION STATE ONLY.
│   ├── canvas.ts  selectedId, zIndices, bringToFront, setSelectedId
│   └── theme.ts
├── lib/
│   ├── trpc.ts    tRPC client + exported types from AppRouter
│   └── api.ts     resolveImageUrl — rewrites /api/* to absolute URL
├── api/, config.ts, index.css, main.tsx, App.tsx
```

## State ownership (do not blur)

| Concern                                            | Owner                                         |
| -------------------------------------------------- | --------------------------------------------- |
| List of items on a board, their persisted position | TanStack Query (`useBoardItems`)              |
| Currently selected card (for expand)               | Zustand (`useCanvasStore.selectedId`)         |
| Per-card z-index stack from user clicks            | Zustand (`useCanvasStore.zIndices`)           |
| Drag/pan/zoom in-flight values                     | Framer Motion `MotionValue` (not React state) |
| Canvas viewport (panX, panY, zoom)                 | `useCanvasGesture` motion values              |

If you find yourself putting items into Zustand or selectedId into the query cache, stop. The split is deliberate — server data invalidates separately from interaction state, and motion values bypass React renders during drag.

## tRPC client

`src/lib/trpc.ts` creates a single `trpc` client and exports inferred types:

```ts
import { trpc, type BoardItem, type ParseResult } from './lib/trpc';
```

`BoardItem` and `ParseResult` come from `inferRouterOutputs<AppRouter>` — the source of truth is `worker/src/router.ts`. If you change a procedure's return shape, the frontend types update automatically.

`api/*.ts` wraps every call. **Do not call `trpc.x.y.query()` from components or hooks** — go through `api/`. This keeps the indirection so we could swap transports without touching consumers.

## Mutation patterns

All mutations follow the same shape (see `useAddItem.ts` as the canonical example):

1. `onMutate` — cancel in-flight queries, snapshot previous data, write optimistic value, return rollback context.
2. `onSuccess` — replace optimistic value with server response (do not invalidate — we already have the data).
3. `onError` — restore previous snapshot from context.

For position sync (`useSyncPosition`) the mutation is fire-and-forget — Framer Motion is already showing the final position, so we don't even need optimistic update logic; we just persist.

## Skeleton cards

`useAddItem` injects a skeleton item into the query cache while `parseUrl` is running. Skeleton IDs are `__skeleton__${Date.now()}`. Use `isSkeleton(id)` from `hooks/useAddItem.ts` to guard:

- Don't open the expanded view on a skeleton (no real id yet).
- Don't PATCH position on a skeleton (no row exists).

Skeleton drag during load: the user can move the skeleton card before the real item arrives. `Canvas.tsx` passes `onDragEnd` to the skeleton Card that writes the new x/y back onto the cached `SkeletonItem`. `useAddItem.onSuccess` reads the cached position when swapping in the real item; if it differs from the server-returned coords, it also fires a follow-up `patchBoardItem` so the server learns where the card ended up. Without this, the swap snaps the card back to the original drop point.

## Bookmarklet drop-zone (`/import`)

When a site bot-blocks the worker beyond what the Wayback fallback can rescue (luxury retailers on Akamai BM / DataDome), the user clicks a "Save to Tack" bookmarklet on the product page. The bookmarklet (`lib/bookmarklet.ts`) opens `/import` in a new tab, then `postMessage`s `{ type: 'tack:import', url, html }` after we ack `tack:ready` from the receiver. `App.tsx` routes `/import` → `Import/ImportScreen.tsx` (inside `AuthGate`), which shows a board picker and runs `useAddItem` with the harvested `html` — that flag routes the mutation through `api/parse.ts:parseFromHtml` instead of `parseUrl`, and the worker skips the live fetch. `BookmarkletLink` in `AddUrlModal` lets the user drag the generated bookmarklet onto their bookmark bar. Origin is baked in at generation time (`window.location.origin`) so a dev-grabbed bookmarklet returns to localhost.

## Images

Backend returns image URLs like `/api/images/items/{uuid}`. Resolve them with `resolveImageUrl()` from `lib/api.ts` before passing to `<img src>` — it prepends `VITE_API_URL` for dev and leaves absolute URLs alone.

Canvas cards lazy-load their image. `Card.tsx` gates the `<img>` mount on `useInView` (`react-intersection-observer`, 300px rootMargin, triggerOnce) so off-screen cards don't fetch on first paint. `Canvas.tsx` seeds `initiallyVisible` by intersecting each item's rect against `getVisibleCanvasRect(...)` (`lib/canvasMath.ts`) so on-screen cards mount their `<img>` synchronously — also raising those to `fetchpriority="high"`. Status is a tiny FSM (`'idle' | 'requested' | 'loaded'`) — sticky once promoted, so panning a loaded card off-screen never unsets its src. Side-panel thumbnails (`Hero.tsx`) live in a normal scroller and use native `loading="lazy"`. (We tried `content-visibility: auto` on the card div to also skip layout/paint of off-screen cards; it implies `contain: paint`, which clipped the resize handles that protrude outside the card box. Skip until the card can be restructured so handles live outside the contained subtree.)

## Canvas coordinate math

Cards live in canvas space; pan/zoom live in screen space. To place a new card at the viewport center:

```ts
const x = (-panX.get() + window.innerWidth / 2 - cardWidth / 2) / zoom;
const y = (-panY.get() + window.innerHeight / 2 - 200) / zoom;
```

This is in `Canvas.tsx:handleAddUrl` — copy that pattern if you add another "drop at center" affordance.

## Design system

Visual consistency lives in two files and a `shared/` directory — load the `frontend-design` skill (`.claude/skills/frontend-design/SKILL.md`) before any UI change.

- **Tokens (CSS):** `src/index.css` — colors, radius, focus ring, dark-mode pairs. Registered with Tailwind v4 via `@theme inline`, so use Tailwind classes (`bg-surface`, `text-fg-muted`, `ring-border`, `rounded-md`, etc.). Add new tokens here BEFORE reaching for `text-[Npx]` or hex literals in components.
- **Tokens (TS):** `src/config.ts` — spring physics, zoom/card/canvas constants. Consumed by Framer Motion and gesture math.
- **Primitives:** `src/components/shared/`
  - `Button` (variants: primary / secondary / ghost / destructive; sizes: sm / md; `loading`, `leading`, `trailing`, `block`)
  - `IconButton` (variants: ghost / raised; `aria-label` required by type)
  - `TextField` (label + input + error + trailing slot; wires `aria-invalid`/`aria-describedby`)
  - `ConfirmDialog`, `Rail`, `UrlInputRow`, `Pulse`

If you're about to write a second one-off `bg-fg text-surface rounded-md …` button, you're drifting — extend `Button` instead.

A11y rules every component must satisfy: focus-visible ring, `aria-label` on icon-only buttons, associated labels on inputs, WCAG-AA contrast, no color-only state, semantic HTML, reduced-motion respected. Full checklist in the skill.

## Feel targets (don't regress)

- Drag: low stiffness, low damping, slight overshoot on release.
- Pan: spring-eased, not 1:1 with cursor.
- Expand/collapse: seamless via Framer Motion `layoutId`.
- Cards respond visually to every interaction (`whileHover`, `whileTap`).

## Scripts

All scripts work from the repo root (mirrored as `pnpm <name>` or `<name>:web`) or from `web/`. See the root `CLAUDE.md` for the full table.

- `dev` — Vite dev server
- `build` — `tsc -b && vite build`
- `preview` — Vite preview of the production build
- `lint` — `tsc --noEmit && eslint .`
