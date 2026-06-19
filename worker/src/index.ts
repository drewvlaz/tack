import { Hono } from 'hono';
import { corsMiddleware, csrfMiddleware, loggerMiddleware } from './middleware';
import { authRoutes } from './routes/auth';
import { handleImageRequest } from './routes/images';
import { handleScheduled } from './scheduled';
import { handleTrpcRequest } from './trpc/handler';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
  INVITE_EMAILS?: string;
  // Deployed-env CORS allowlist entry. Set per env in wrangler.toml's
  // `[env.<name>.vars]` to the matching Pages URL. Unset locally — dev
  // origins (5173/5174) are hardcoded below.
  FRONTEND_ORIGIN?: string;
  // Optional: free-tier deploys omit the rate-limit bindings entirely. Code
  // paths that consume these (routers/parser.ts, routes/auth/index.ts) skip
  // the .limit() call when the binding is absent.
  PARSE_LIMITER?: RateLimit;
  AUTH_LIMITER?: RateLimit;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', loggerMiddleware<Bindings>());
app.use('*', corsMiddleware<Bindings>());
app.use('*', csrfMiddleware<Bindings>());

app.route('/api/auth', authRoutes);

app.all('/trpc/*', handleTrpcRequest);

app.get('/api/images/*', handleImageRequest);

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};
