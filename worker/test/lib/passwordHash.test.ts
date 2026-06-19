import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  PLACEHOLDER_PHC,
  verifyPassword,
} from '../../src/lib/passwordHash';

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
    expect(await verifyPassword('anything', 'pbkdf2$abc$salt$hash')).toBe(
      false,
    );
  });

  it('produces a fresh salt every call', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('PLACEHOLDER_PHC never verifies', async () => {
    // Login uses this on unknown-email to keep timing uniform; if anything
    // ever matched it, that'd be a "log in as nobody" bug.
    expect(await verifyPassword('', PLACEHOLDER_PHC)).toBe(false);
    expect(await verifyPassword('anything', PLACEHOLDER_PHC)).toBe(false);
  });
});
