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

export function buildSessionCookie(
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
  //   Partitioned (CHIPS) is required for privacy Chromium forks
  //        (Helium, Brave, ungoogled-chromium) and Chrome Incognito /
  //        Tracking Protection: unpartitioned SameSite=None cookies are
  //        third-party on this topology and those browsers drop them by
  //        default. Stock Chrome still accepts the unpartitioned cookie,
  //        which is why boards load there. Firefox already partitions
  //        automatically. Must also be present on the Max-Age=0 clear so
  //        logout expires the partitioned cookie, not a different
  //        unpartitioned one.
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${isDev ? 'Lax' : 'None'}`,
    `Max-Age=${maxAge}`,
  ];
  if (!isDev) {
    parts.push('Secure', 'Partitioned');
  }
  return parts.join('; ');
}
