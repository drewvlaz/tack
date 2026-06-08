import { Hono } from 'hono';
import { createDb } from '../../db/client';
import { withTransaction } from '../../db/tx';
import { CredentialsBody } from '../../schemas/auth';
import {
  deleteSession,
  login,
  lookupSession,
  parseAllowlist,
  signup,
} from '../../services/auth';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from './cookie';
import { authErrorResponse } from './errors';

type Bindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  INVITE_EMAILS?: string;
  ENVIRONMENT?: string;
};

// Sessions only exist for one user, so there's no scope to enforce inside the
// auth procedures themselves. Use a sentinel scope; service code doesn't read
// scope for users/sessions tables.
const AUTH_SCOPE = { userId: '__auth__' };

export const authRoutes = new Hono<{ Bindings: Bindings }>();

authRoutes.post('/signup', async (c) => {
  const parsed = CredentialsBody.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const allowlist = parseAllowlist(c.env.INVITE_EMAILS);

  try {
    const authOutcome = await withTransaction(
      createDb(c.env.DB),
      c.env.IMAGES,
      AUTH_SCOPE,
      (tx) => signup(tx, parsed.data.email, parsed.data.password, allowlist),
    );
    setSessionCookie(c, authOutcome.sessionId, c.env.ENVIRONMENT);
    return c.json(authOutcome.user);
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
    const authOutcome = await withTransaction(
      createDb(c.env.DB),
      c.env.IMAGES,
      AUTH_SCOPE,
      (tx) => login(tx, parsed.data.email, parsed.data.password),
    );
    setSessionCookie(c, authOutcome.sessionId, c.env.ENVIRONMENT);
    return c.json(authOutcome.user);
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
