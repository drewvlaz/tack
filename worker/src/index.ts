import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDb } from './db'
import { fetchAndParseMeta } from './parser'
import * as schema from './schema'

type Bindings = {
  DB: D1Database
  IMAGES: R2Bucket
  ANTHROPIC_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/', (c) => c.json({ ok: true }))

// GET /api/boards/:boardId/items
app.get('/api/boards/:boardId/items', async (c) => {
  const db = createDb(c.env.DB)
  const results = await db.query.boardItems.findMany({
    where: eq(schema.boardItems.boardId, c.req.param('boardId')),
    with: {
      item: {
        with: {
          images: { orderBy: asc(schema.itemImages.displayOrder), limit: 1 },
        },
      },
    },
  })

  return c.json(
    results.map((bi) => ({
      id: bi.id,
      itemId: bi.itemId,
      title: bi.item.title,
      price: bi.item.price,
      currency: bi.item.currency,
      imageUrl: bi.item.images[0]?.sourceUrl ?? null,
      x: bi.x,
      y: bi.y,
      width: bi.width,
      height: bi.height,
      zIndex: bi.zIndex,
    })),
  )
})

// PATCH /api/board-items/:id
app.patch('/api/board-items/:id', async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json<Partial<{ x: number; y: number; zIndex: number; width: number; height: number }>>()

  const patch: Record<string, number> = { updatedAt: Math.floor(Date.now() / 1000) }
  if (body.x !== undefined) patch.x = body.x
  if (body.y !== undefined) patch.y = body.y
  if (body.zIndex !== undefined) patch.zIndex = body.zIndex
  if (body.width !== undefined) patch.width = body.width
  if (body.height !== undefined) patch.height = body.height

  await db
    .update(schema.boardItems)
    .set(patch)
    .where(eq(schema.boardItems.id, c.req.param('id')))

  return c.json({ ok: true })
})

// DELETE /api/board-items/:id
app.delete('/api/board-items/:id', async (c) => {
  const db = createDb(c.env.DB)
  await db.delete(schema.boardItems).where(eq(schema.boardItems.id, c.req.param('id')))
  return c.json({ ok: true })
})

// POST /api/parse-url
app.post('/api/parse-url', async (c) => {
  const { url } = await c.req.json<{ url: string }>()

  const meta = await fetchAndParseMeta(url, c.env.ANTHROPIC_API_KEY)

  let imageUrl: string | null = null
  if (meta.primaryImageUrl) {
    try {
      const imgRes = await fetch(meta.primaryImageUrl)
      if (imgRes.ok) {
        const key = `items/${crypto.randomUUID()}`
        const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
        await c.env.IMAGES.put(key, imgRes.body!, { httpMetadata: { contentType } })
        const origin = new URL(c.req.url).origin
        imageUrl = `${origin}/api/images/${key}`
      }
    } catch {
      imageUrl = meta.primaryImageUrl
    }
  }

  return c.json({
    title: meta.title,
    brand: meta.brand,
    price: meta.price,
    imageUrl,
  })
})

// POST /api/boards/:boardId/items
app.post('/api/boards/:boardId/items', async (c) => {
  const db = createDb(c.env.DB)
  const boardId = c.req.param('boardId')
  const body = await c.req.json<{
    sourceUrl: string
    title: string | null
    brand: string | null
    price: number | null
    imageUrl: string | null
    x: number
    y: number
  }>()

  const now = Math.floor(Date.now() / 1000)
  const itemId = crypto.randomUUID()
  const boardItemId = crypto.randomUUID()

  await db.insert(schema.items).values({
    id: itemId,
    sourceUrl: body.sourceUrl,
    title: body.title,
    brand: body.brand,
    price: body.price,
    createdAt: now,
    updatedAt: now,
  })

  if (body.imageUrl) {
    await db.insert(schema.itemImages).values({
      id: crypto.randomUUID(),
      itemId,
      r2Key: body.imageUrl,
      sourceUrl: body.imageUrl,
      displayOrder: 0,
      createdAt: now,
    })
  }

  await db.insert(schema.boardItems).values({
    id: boardItemId,
    boardId,
    itemId,
    x: body.x,
    y: body.y,
    width: 220,
    height: 400,
    zIndex: 0,
    createdAt: now,
    updatedAt: now,
  })

  return c.json({
    id: boardItemId,
    itemId,
    title: body.title,
    price: body.price,
    currency: 'USD',
    imageUrl: body.imageUrl,
    x: body.x,
    y: body.y,
    width: 220,
    height: 400,
    zIndex: 0,
  })
})

// GET /api/images/:key — serve image from R2
app.get('/api/images/*', async (c) => {
  const key = c.req.path.replace('/api/images/', '')
  const obj = await c.env.IMAGES.get(key)
  if (!obj) return c.notFound()
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg'
  return new Response(obj.body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
})

export default app
