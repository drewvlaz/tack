import type { Context } from 'hono';
import { log } from '../../lib/log';
import { AuthError } from '../../services/auth';

export function authErrorResponse(c: Context, err: unknown): Response {
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
