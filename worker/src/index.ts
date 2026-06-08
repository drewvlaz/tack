import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createDb } from './db/client';
import { configureLogger, log } from './lib/log';
import { appRouter } from './router';
import { authRoutes, readSessionCookie } from './routes/auth';
import { handleImageRequest } from './routes/images';
import { lookupSession } from './services/auth';
import { sweepOrphanR2Blobs } from './services/gc';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  PARSE_LIMITER: RateLimit;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
  INVITE_EMAILS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Dev-only origins. Production deploys will need an explicit allowlist here
// (the production frontend URL) — leaving CORS at `*` would nullify the auth
// cookie, and `credentials: true` requires an explicit origin anyway.
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
    credentials: true,
  }),
);

app.route('/api/auth', authRoutes);

app.all('/trpc/*', async (c) => {
  const db = createDb(c.env.DB);
  const sessionId = readSessionCookie(c.req.header('cookie'));
  const session = sessionId ? await lookupSession(db, sessionId) : null;

  return fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({
      db,
      images: c.env.IMAGES,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      parseLimiter: c.env.PARSE_LIMITER,
      // CF-Connecting-IP is set by Cloudflare's edge and is the client's
      // public IP. Fall back to "anonymous" so a missing header behaves like
      // a single shared bucket (rate-limited, but not crashy).
      clientIp: c.req.header('cf-connecting-ip') ?? 'anonymous',
      userId: session?.user.id ?? null,
      sessionId: session?.sessionId ?? null,
    }),
  });
});

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
