import { Hono, type Context } from 'hono';
import { createDb } from '../../db/client';
import { withTransaction } from '../../db/tx';
import { CredentialsBody, SignupBody } from '../../schemas/auth';
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
  // Optional: free-tier deploys omit the rate-limit binding entirely.
  AUTH_LIMITER?: RateLimit;
  INVITE_EMAILS?: string;
  ENVIRONMENT?: string;
};

// Sessions only exist for one user, so there's no scope to enforce inside the
// auth procedures themselves. Use a sentinel scope; service code doesn't read
// scope for users/sessions tables.
const AUTH_SCOPE = { userId: '__auth__' };

// Keyed by Cloudflare's edge-supplied client IP. Without the header (local
// curl, mis-configured front-door) every caller maps to the same bucket — the
// limiter still works, it just becomes a per-deployment cap rather than
// per-IP. Better that than crashy on a missing header.
// Returns null (= proceed) when the binding is absent — free-tier deploys
// omit it; re-enables transparently when added back to wrangler.toml.
async function checkAuthRateLimit(
  c: Context<{ Bindings: Bindings }>,
): Promise<Response | null> {
  if (!c.env.AUTH_LIMITER) {
    return null;
  }
  const key = c.req.header('cf-connecting-ip') ?? 'anonymous';
  const { success } = await c.env.AUTH_LIMITER.limit({ key });
  if (success) {
    return null;
  }
  return c.json({ error: 'rate_limited' }, 429);
}

export const authRoutes = new Hono<{ Bindings: Bindings }>();

authRoutes.post('/signup', async (c) => {
  const limited = await checkAuthRateLimit(c);
  if (limited) {
    return limited;
  }

  const parsed = SignupBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const allowlist = parseAllowlist(c.env.INVITE_EMAILS);

  try {
    const authOutcome = await withTransaction(
      createDb(c.env.DB),
      c.env.IMAGES,
      AUTH_SCOPE,
      (tx) =>
        signup(tx, parsed.data.email, parsed.data.password, allowlist, {
          inviteToken: parsed.data.inviteToken,
        }),
    );
    setSessionCookie(c, authOutcome.sessionId, c.env.ENVIRONMENT);
    // Pass invitedBoardId through so the frontend can navigate the user
    // directly to the board they were invited to.
    return c.json({
      ...authOutcome.user,
      ...(authOutcome.invitedBoardId !== undefined && {
        invitedBoardId: authOutcome.invitedBoardId,
      }),
    });
  } catch (err) {
    return authErrorResponse(c, err);
  }
});

authRoutes.post('/login', async (c) => {
  const limited = await checkAuthRateLimit(c);
  if (limited) {
    return limited;
  }

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
