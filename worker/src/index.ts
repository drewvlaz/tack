import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db/client';
import { configureLogger, log } from './lib/log';
import { appRouter } from './router';
import { handleImageRequest } from './routes/images';
import { sweepOrphanR2Blobs } from './services/gc';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  PARSE_LIMITER: RateLimit;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Dev-only origins. Production deploys will need an explicit allowlist here
// (the production frontend URL) once we add auth — leaving CORS at `*` would
// nullify whatever auth we add.
// TODO(auth): add auth + lock CORS to the deployed frontend origin.
const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);

app.use('*', (c, next) => {
  configureLogger(c.env);
  return next();
});
app.use(
  '*',
  cors({
    origin: (origin) => (DEV_ORIGINS.has(origin) ? origin : null),
  }),
);

app.all('/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({
      db: createDb(c.env.DB),
      images: c.env.IMAGES,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      parseLimiter: c.env.PARSE_LIMITER,
      // CF-Connecting-IP is set by Cloudflare's edge and is the client's
      // public IP. Fall back to "anonymous" so a missing header behaves like
      // a single shared bucket (rate-limited, but not crashy).
      clientIp: c.req.header('cf-connecting-ip') ?? 'anonymous',
    }),
  }),
);

app.get('/api/images/*', handleImageRequest);

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    configureLogger(env);
    ctx.waitUntil(
      sweepOrphanR2Blobs(createDb(env.DB), env.IMAGES, new Date()).catch(
        (err) => {
          log.error('R2 GC sweep failed:', err);
        },
      ),
    );
  },
};
