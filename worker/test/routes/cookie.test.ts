import { describe, expect, it } from 'vitest';
import {
  buildSessionCookie,
  readSessionCookie,
} from '../../src/routes/auth/cookie';

describe('buildSessionCookie', () => {
  it('uses Lax without Secure on localhost', () => {
    const cookie = buildSessionCookie('sess-1', 'development');
    expect(cookie).toContain('tack_sess=sess-1');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Partitioned');
  });

  it('uses None + Secure + Partitioned on staging/prod', () => {
    for (const env of ['staging', 'production'] as const) {
      const cookie = buildSessionCookie('sess-1', env);
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('Partitioned');
    }
  });

  it('clears with the same CHIPS attrs so Chromium expires the partitioned cookie', () => {
    const cookie = buildSessionCookie('', 'production', 0);
    expect(cookie).toContain('tack_sess=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Partitioned');
  });
});

describe('readSessionCookie', () => {
  it('reads the session id from a cookie header', () => {
    expect(readSessionCookie('tack_sess=abc; other=1')).toBe('abc');
    expect(readSessionCookie('other=1; tack_sess=abc')).toBe('abc');
    expect(readSessionCookie(undefined)).toBeNull();
  });
});
