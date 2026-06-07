import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db/client';
import { configureLogger } from './lib/log';
import { appRouter } from './router';
import { handleImageRequest } from './routes/images';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', (c, next) => {
  configureLogger(c.env);
  return next();
});
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

export default app;
