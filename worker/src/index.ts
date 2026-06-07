import { asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createDb } from './db'
import * as schema from './schema'

type Bindings = {
  DB: D1Database
  IMAGES: R2Bucket
  ANTHROPIC_API_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/', (c) => c.json({ ok: true }))

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

app.patch('/api/board-items/:id', async (c) => {
  const db = createDb(c.env.DB)
  const { x, y } = await c.req.json<{ x: number; y: number }>()

  await db
    .update(schema.boardItems)
    .set({ x, y, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.boardItems.id, c.req.param('id')))

  return c.json({ ok: true })
})

export default app
