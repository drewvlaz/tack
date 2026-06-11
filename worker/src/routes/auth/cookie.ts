import type { Context } from 'hono';

const SESSION_COOKIE = 'tack_sess';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches services/auth.ts

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

export function setSessionCookie(
  c: Context,
  sessionId: string,
  environment: string | undefined,
): void {
  c.header('set-cookie', buildSessionCookie(sessionId, environment));
}

export function clearSessionCookie(
  c: Context,
  environment: string | undefined,
): void {
  c.header('set-cookie', buildSessionCookie('', environment, 0));
}

function buildSessionCookie(
  value: string,
  environment: string | undefined,
  maxAge: number = SESSION_MAX_AGE,
): string {
  const isDev = environment === 'development';
  // SameSite policy is driven by the deployment topology:
  //   Dev: frontend and worker both run on `localhost` → same-site → Lax is
  //        fine (and avoids needing Secure on http).
  //   Staging/prod: frontend on *.pages.dev, worker on *.workers.dev →
  //        cross-site. Browsers refuse to send SameSite=Lax cookies on
  //        cross-site fetch/XHR, so signup looks fine but the very next
  //        request lands without the cookie. Need SameSite=None + Secure
  //        (Secure is mandatory for None per spec).
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${isDev ? 'Lax' : 'None'}`,
    `Max-Age=${maxAge}`,
  ];
  if (!isDev) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
