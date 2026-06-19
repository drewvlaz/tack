import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { HttpMethod } from './lib/http';
import { configureLogger, type LoggerEnv } from './lib/log';
import { isAllowedOrigin } from './lib/origins';

type OriginEnv = { FRONTEND_ORIGIN?: string };

export function loggerMiddleware<B extends LoggerEnv>(): MiddlewareHandler<{
  Bindings: B;
}> {
  return (c, next) => {
    configureLogger(c.env);
    return next();
  };
}

// Response-side CORS allowlist using the shared predicate. `credentials: true`
// requires an explicit echoed origin (never `*`) so the auth cookie can ride.
export function corsMiddleware<B extends OriginEnv>(): MiddlewareHandler<{
  Bindings: B;
}> {
  return cors({
    origin: (origin, c) =>
      isAllowedOrigin(origin, c.env as OriginEnv) ? origin : null,
    credentials: true,
  });
}

// Request-side CSRF defense-in-depth. The session cookie is SameSite=None on
// staging/prod (cross-site frontend↔worker), so browsers will attach it to any
// request the attacker can cause — including ones CORS allows through (e.g.
// simple GETs, or any POST if FRONTEND_ORIGIN ever gets misconfigured). For
// state-changing methods we additionally require the request's Origin header
// to match the allowlist; the cookie only "works" when both checks agree.
//
// Origin is set by every modern browser on non-GET requests. An absent Origin
// means the caller isn't a browser (curl, server-to-server) — which can only
// hold the cookie if the user explicitly handed it over, so there's no CSRF
// risk there; allow through.
const SAFE_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
] satisfies HttpMethod[]);

export function csrfMiddleware<B extends OriginEnv>(): MiddlewareHandler<{
  Bindings: B;
}> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      return next();
    }
    const origin = c.req.header('origin');
    if (origin && !isAllowedOrigin(origin, c.env)) {
      return c.json({ error: 'forbidden_origin' }, 403);
    }
    return next();
  };
}
