import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { configureLogger } from './lib/log';
import { authRoutes } from './routes/auth';
import { handleImageRequest } from './routes/images';
import { handleScheduled } from './scheduled';
import { handleTrpcRequest } from './trpc/handler';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  // Optional: free-tier deploys omit the rate-limit bindings entirely. Code
  // paths that consume these (routers/parser.ts, routes/auth/index.ts) skip
  // the .limit() call when the binding is absent.
  PARSE_LIMITER?: RateLimit;
  AUTH_LIMITER?: RateLimit;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
  INVITE_EMAILS?: string;
  // Deployed-env CORS allowlist entry. Set per env in wrangler.toml's
  // `[env.<name>.vars]` to the matching Pages URL. Unset locally — dev
  // origins (5173/5174) are hardcoded below.
  FRONTEND_ORIGIN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Local-dev origins. Deployed envs add their FRONTEND_ORIGIN var on top of
// these; `credentials: true` requires an explicit origin (never `*`) so the
// auth cookie can ride along.
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
    origin: (origin, c) => {
      if (DEV_ORIGINS.has(origin)) {
        return origin;
      }
      const env = c.env as Bindings;
      if (env.FRONTEND_ORIGIN && origin === env.FRONTEND_ORIGIN) {
        return origin;
      }
      return null;
    },
    credentials: true,
  }),
);

app.route('/api/auth', authRoutes);

app.all('/trpc/*', handleTrpcRequest);

app.get('/api/images/*', handleImageRequest);

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
