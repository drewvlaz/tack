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
  PARSE_LIMITER: RateLimit;
  AUTH_LIMITER: RateLimit;
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

app.all('/trpc/*', handleTrpcRequest);

app.get('/api/images/*', handleImageRequest);

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
