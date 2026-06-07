import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db/client';
import { appRouter } from './router';
import { handleImageRequest } from './routes/images';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.all('/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({
      db: createDb(c.env.DB),
      images: c.env.IMAGES,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
    }),
  }),
);

app.get('/api/images/*', handleImageRequest);

app.get('/_debug/fetch', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.text('missing ?url=', 400);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Moodboard/1.0)' },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});

export default app;
