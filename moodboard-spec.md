# Moodboard App — Claude Code Kickoff

## Project Overview

A personal moodboard web app for assembling and visualizing potential clothing purchases on a free-form canvas. Core experience: paste a product URL, AI extracts metadata and image, item appears on canvas as a draggable card. The canvas should feel lightweight, springy, and joyful to interact with.

## Tech Stack

| Layer         | Choice                                      |
| ------------- | ------------------------------------------- |
| Framework     | React + Vite (TypeScript)                   |
| Gesture       | `@use-gesture/react`                        |
| Animation     | Framer Motion                               |
| Styling       | Tailwind CSS v4                             |
| State         | Zustand                                     |
| Backend       | Hono on Cloudflare Workers                  |
| Image storage | Cloudflare R2                               |
| DB            | Cloudflare D1 (SQLite)                      |
| AI parsing    | Anthropic Claude Haiku (`claude-haiku-4-5`) |

## Phase 1 Goal: Canvas Skeleton (frontend only)

Build a canvas with hardcoded items to validate interaction feel before any backend work.

### What to build

1. **Pannable canvas** — drag on empty space pans the viewport; should feel smooth with spring easing
2. **Draggable cards** — spring-physics drag using `useSpring` + `useMotionValue` from Framer Motion, gesture handling via `@use-gesture/react`
3. **Card micro-interactions** — `whileHover` subtle scale up, `whileTap` press-down feel
4. **Click to expand** — clicking a card expands it to a focused view using Framer Motion `layoutId` (shared layout animation between canvas position and expanded state)
5. **Zustand store** — manages canvas item state

### Zustand store shape

```ts
type Item = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // placeholder fields for later
  title: string;
  price: number | null;
  imageUrl: string;
  sourceUrl: string;
};

type CanvasStore = {
  items: Item[];
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  moveItem: (id: string, x: number, y: number) => void;
  bringToFront: (id: string) => void;
};
```

### Interaction feel targets

- Drag should feel **light and fast** — low spring stiffness, low damping, slight overshoot on release
- Pan should feel **smooth** — spring-eased, not 1:1 with cursor
- Card expand/collapse should be **seamless** — Framer Motion `layoutId` handles the position-to-modal transition
- Everything should feel **tactile** — cards respond visually to every interaction

### Hardcoded seed data

Use 3–4 placeholder cards with:

- A clothing image (use `https://picsum.photos/300/400` or similar)
- A fake title and price
- Spread around the canvas at different positions

---

## Phase 2 (implement after Phase 1 feel is validated)

### Backend: Cloudflare Workers (Hono)

**Endpoints:**

```
POST /api/parse-url
  body: { url: string }
  returns: { title, price, imageUrl, brand }

POST /api/items
  body: Item
  returns: saved Item with id

GET /api/boards/:boardId/items
  returns: Item[]

PUT /api/items/:id
  body: Partial<Item> (x, y, width, height, zIndex)
```

**URL parsing flow:**

```
1. Fetch HTML from product URL (Workers can do this server-side, bypassing CORS)
2. Extract <head> og: tags first (og:image, og:title, og:description)
3. If price missing from og tags, pass stripped HTML body to Claude Haiku
4. Claude returns structured JSON: { title, price, imageUrl, brand }
5. Fetch image and store in R2, return R2 URL to client
```

**Claude Haiku prompt for metadata extraction:**

```
Extract product metadata from this HTML. Return only JSON, no prose, no markdown.

{
  "title": "product name",
  "brand": "brand name or null",
  "price": 99.99,  // numeric USD, sale price if present, null if not found
  "primary_image_url": "highest res image URL found"
}

If a field cannot be determined, use null. Return the currently displayed/sale price if both sale and original prices exist.
```

**Token reduction before Claude call:**

- Always try og: tags first — covers ~80% of cases without needing Claude
- Strip scripts, styles, nav, footer before sending body to Claude
- Target < 10k tokens per request

### D1 Schema

```sql
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  title TEXT,
  brand TEXT,
  price REAL,
  image_r2_key TEXT,
  source_url TEXT,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 300,
  height REAL NOT NULL DEFAULT 400,
  z_index INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

---

## File Structure (target)

```
moodboard/
├── src/
│   ├── components/
│   │   ├── Canvas.tsx         # pannable canvas container
│   │   ├── Card.tsx           # individual moodboard item
│   │   └── CardExpanded.tsx   # expanded/focused card view
│   ├── store/
│   │   └── canvas.ts          # Zustand store
│   ├── hooks/
│   │   └── useCanvasPan.ts    # pan gesture hook
│   ├── App.tsx
│   └── main.tsx
├── worker/
│   ├── index.ts               # Hono app, routes
│   ├── parser.ts              # URL fetch + og tag extraction
│   ├── claude.ts              # Haiku API call + JSON parsing
│   └── wrangler.toml
└── vite.config.ts
```

---

## Setup Commands

```bash
npm create vite@latest moodboard -- --template react-ts
cd moodboard
npm install framer-motion @use-gesture/react zustand
npm install -D tailwindcss @tailwindcss/vite
```

Tailwind v4 config: add `@tailwindcss/vite` plugin to `vite.config.ts`, add `@import "tailwindcss"` to `src/index.css`. No `tailwind.config.js` needed.

---

## Notes

- **Start with Phase 1 only.** Get the canvas feel right before touching backend.
- **Image hotlinking will break** — retailer image URLs expire. R2 proxying is required before shipping.
- **Validate Claude output** — always check that `price` is a parseable number before saving; Claude will hallucinate if HTML contains multiple price values.
- **Canvas state persistence** — debounce save on item move (don't fire PUT on every animation frame).
