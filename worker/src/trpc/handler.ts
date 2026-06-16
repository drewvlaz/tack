import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Context as HonoContext } from 'hono';
import { createDb } from '../db/client';
import { log } from '../lib/log';
import { appRouter } from '../router';
import { readSessionCookie } from '../routes/auth/cookie';
import { lookupSession } from '../services/auth';

type TrpcBindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ANTHROPIC_API_KEY: string;
  // Optional: free-tier deploys omit the rate-limit binding entirely.
  PARSE_LIMITER?: RateLimit;
};

export async function handleTrpcRequest(
  c: HonoContext<{ Bindings: TrpcBindings }>,
): Promise<Response> {
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
      parseLimiter: c.env.PARSE_LIMITER ?? null,
      // CF-Connecting-IP is set by Cloudflare's edge and is the client's
      // public IP. Fall back to "anonymous" so a missing header behaves like
      // a single shared bucket (rate-limited, but not crashy).
      clientIp: c.req.header('cf-connecting-ip') ?? 'anonymous',
      userId: session?.user.id ?? null,
      sessionId: session?.sessionId ?? null,
    }),
    // Surface only unexpected throws — expected 4xx (BAD_REQUEST, UNAUTHORIZED,
    // NOT_FOUND, TOO_MANY_REQUESTS) are part of the API contract, not bugs.
    onError: ({ error, path, type }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        log.error('trpc unhandled', {
          path,
          type,
          message: error.message,
          cause: error.cause,
        });
      }
    },
  });
}
