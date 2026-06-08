import type { Context as HonoContext } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db/client';
import { withTransaction } from '../db/tx';
import { log } from '../lib/log';
import {
  AuthError,
  deleteSession,
  login,
  lookupSession,
  parseAllowlist,
  signup,
} from '../services/auth';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  INVITE_EMAILS?: string;
  ENVIRONMENT?: string;
};

const SESSION_COOKIE = 'tack_sess';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches services/auth.ts

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export const authRoutes = new Hono<{ Bindings: Bindings }>();

const CredentialsBody = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

// Sessions only exist for one user, so there's no scope to enforce inside the
// auth procedures themselves. Use a sentinel scope; service code doesn't read
// scope for users/sessions tables.
const AUTH_SCOPE = { userId: '__auth__' };

authRoutes.post('/signup', async (c) => {
  const parsed = CredentialsBody.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const allowlist = parseAllowlist(c.env.INVITE_EMAILS);
  try {
    const out = await withTransaction(
      createDb(c.env.DB),
      c.env.IMAGES,
      AUTH_SCOPE,
      (tx) => signup(tx, parsed.data.email, parsed.data.password, allowlist),
    );
    setSessionCookie(c, out.sessionId, c.env.ENVIRONMENT);
    return c.json(out.user);
  } catch (err) {
    return authErrorResponse(c, err);
  }
});

authRoutes.post('/login', async (c) => {
  const parsed = CredentialsBody.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: 'invalid_body' }, 400);
  }
  try {
    const out = await withTransaction(
      createDb(c.env.DB),
      c.env.IMAGES,
      AUTH_SCOPE,
      (tx) => login(tx, parsed.data.email, parsed.data.password),
    );
    setSessionCookie(c, out.sessionId, c.env.ENVIRONMENT);
    return c.json(out.user);
  } catch (err) {
    return authErrorResponse(c, err);
  }
});

authRoutes.post('/logout', async (c) => {
  const sessionId = readSessionCookie(c.req.header('cookie'));
  if (sessionId) {
    await withTransaction(
      createDb(c.env.DB),
      c.env.IMAGES,
      AUTH_SCOPE,
      async (tx) => {
        deleteSession(tx, sessionId);
      },
    );
  }
  clearSessionCookie(c, c.env.ENVIRONMENT);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const sessionId = readSessionCookie(c.req.header('cookie'));
  if (!sessionId) {
    return c.json({ error: 'unauthenticated' }, 401);
  }
  const session = await lookupSession(createDb(c.env.DB), sessionId);
  if (!session) {
    clearSessionCookie(c, c.env.ENVIRONMENT);
    return c.json({ error: 'unauthenticated' }, 401);
  }
  return c.json(session.user);
});

// ---------- helpers ----------

export function readSessionCookie(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  // Tolerate `name=value; name2=value2` with leading whitespace between pairs.
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

type AuthCtx = HonoContext<{ Bindings: Bindings }>;

function setSessionCookie(
  c: AuthCtx,
  sessionId: string,
  environment: string | undefined,
): void {
  c.header('set-cookie', buildSessionCookie(sessionId, environment));
}

function clearSessionCookie(c: AuthCtx, environment: string | undefined): void {
  c.header('set-cookie', buildSessionCookie('', environment, 0));
}

function buildSessionCookie(
  value: string,
  environment: string | undefined,
  maxAge: number = SESSION_MAX_AGE,
): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (environment !== 'development') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function authErrorResponse(c: AuthCtx, err: unknown): Response {
  if (err instanceof AuthError) {
    const status =
      err.code === 'email_taken'
        ? 409
        : err.code === 'invalid_credentials'
          ? 401
          : 400;
    return c.json({ error: err.code, message: err.message }, status);
  }
  log.error('auth route failure', err);
  return c.json({ error: 'internal_error' }, 500);
}
