import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import { withTransaction } from '../../src/db/tx';
import {
  AuthError,
  hashPassword,
  login,
  lookupSession,
  parseAllowlist,
  signup,
  verifyPassword,
} from '../../src/services/auth';

const SCOPE = { userId: '__auth__' };

function db() {
  return createDb(env.DB);
}

async function wipe() {
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM boards');
  await env.DB.exec('DELETE FROM sessions');
  await env.DB.exec('DELETE FROM users');
}

describe('hashPassword + verifyPassword', () => {
  it('round-trips a correct password', async () => {
    const phc = await hashPassword('correct horse battery staple');
    expect(phc.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', phc)).toBe(
      true,
    );
  });

  it('rejects an incorrect password', async () => {
    const phc = await hashPassword('tackdev123');
    expect(await verifyPassword('tackdev124', phc)).toBe(false);
  });

  it('rejects a malformed PHC string', async () => {
    expect(await verifyPassword('anything', 'not-a-phc')).toBe(false);
    expect(await verifyPassword('anything', 'pbkdf2$x$y')).toBe(false);
  });
});

describe('parseAllowlist', () => {
  it('parses comma-separated emails, lowercasing', async () => {
    const set = parseAllowlist('Drew@example.com, second@example.com');
    expect(set.has('drew@example.com')).toBe(true);
    expect(set.has('second@example.com')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('returns empty set for undefined or empty input', async () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist('').size).toBe(0);
  });
});

describe('signup', () => {
  beforeEach(wipe);

  it('rejects an email not on the allowlist', async () => {
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        signup(
          tx,
          'stranger@example.com',
          'tackdev123',
          new Set(['allowed@x']),
        ),
      ),
    ).rejects.toThrow(AuthError);
  });

  it('rejects a short password', async () => {
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        signup(tx, 'a@b.co', 'short', new Set(['a@b.co'])),
      ),
    ).rejects.toThrow(AuthError);
  });

  it('creates a user and a session on success', async () => {
    const allow = new Set(['drew@example.com']);
    const out = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      signup(tx, 'drew@example.com', 'tackdev123', allow),
    );
    expect(out.user.email).toBe('drew@example.com');
    expect(out.sessionId.length).toBeGreaterThan(20);

    const session = await lookupSession(db(), out.sessionId);
    expect(session?.user.id).toBe(out.user.id);
  });

  it('rejects a duplicate email', async () => {
    const allow = new Set(['drew@example.com']);
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      signup(tx, 'drew@example.com', 'tackdev123', allow),
    );
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        signup(tx, 'drew@example.com', 'tackdev123', allow),
      ),
    ).rejects.toThrow(AuthError);
  });
});

describe('login', () => {
  beforeEach(wipe);

  it('returns a session for valid credentials', async () => {
    const allow = new Set(['drew@example.com']);
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      signup(tx, 'drew@example.com', 'tackdev123', allow),
    );

    const out = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      login(tx, 'drew@example.com', 'tackdev123'),
    );
    expect(out.user.email).toBe('drew@example.com');

    const session = await lookupSession(db(), out.sessionId);
    expect(session?.user.email).toBe('drew@example.com');
  });

  it('rejects a wrong password', async () => {
    const allow = new Set(['drew@example.com']);
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      signup(tx, 'drew@example.com', 'tackdev123', allow),
    );
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        login(tx, 'drew@example.com', 'wrong-password'),
      ),
    ).rejects.toThrow(AuthError);
  });

  it('rejects an unknown email with the same error as wrong password', async () => {
    // Uniform error prevents email enumeration.
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        login(tx, 'unknown@example.com', 'whatever'),
      ),
    ).rejects.toThrow(AuthError);
  });
});

describe('lookupSession', () => {
  beforeEach(wipe);

  it('returns null for an unknown session id', async () => {
    expect(await lookupSession(db(), 'no-such-session')).toBeNull();
  });

  it('returns null for an expired session', async () => {
    const allow = new Set(['drew@example.com']);
    const out = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      signup(tx, 'drew@example.com', 'tackdev123', allow),
    );
    await env.DB.prepare('UPDATE sessions SET expires_at = 0 WHERE id = ?1')
      .bind(out.sessionId)
      .run();
    expect(await lookupSession(db(), out.sessionId)).toBeNull();
  });
});
