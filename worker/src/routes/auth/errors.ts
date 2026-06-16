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
    // Bad-credential and not-allowlisted attempts are the security signal
    // worth a log line; email_taken / invalid_email / invalid_password are
    // routine user input mistakes.
    if (err.code === 'invalid_credentials' || err.code === 'not_allowlisted') {
      log.warn('auth rejected', {
        code: err.code,
        ip: c.req.header('cf-connecting-ip') ?? 'anonymous',
      });
    }
    return c.json({ error: err.code, message: err.message }, status);
  }
  log.error('auth route failure', err);
  return c.json({ error: 'internal_error' }, 500);
}
