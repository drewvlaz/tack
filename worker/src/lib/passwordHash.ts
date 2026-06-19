// PBKDF2-SHA256. OWASP 2023 guidance is 600k iterations, but the Workers
// runtime hard-caps PBKDF2 at 100k (CPU-exhaustion guard in workerd; no
// compatibility flag to bypass). 100k is still well above the "acceptable"
// floor for password storage given the threat model: invite-only signup
// and per-IP rate-limiting on /login when the AUTH_LIMITER binding is on.
// 16-byte salt, 32-byte derived key. Stored as a PHC-style string so the
// algorithm/cost is rotatable without a schema change — if Workers raises
// the cap, bump this constant and existing hashes still verify (their stored
// iteration count is read from the PHC string).

import { b64uDecode, b64uEncode } from './b64url';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_ALG = 'pbkdf2';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await derive(password, salt);
  return `${PBKDF2_ALG}$${PBKDF2_ITERATIONS}$${b64uEncode(salt)}$${b64uEncode(hash)}`;
}

export async function verifyPassword(
  password: string,
  phc: string,
): Promise<boolean> {
  const parts = phc.split('$');
  if (parts.length !== 4 || parts[0] !== PBKDF2_ALG) {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) {
    return false;
  }
  const salt = b64uDecode(parts[2]);
  const expected = b64uDecode(parts[3]);
  const actual = await derive(password, salt, iterations, expected.length);
  return timingSafeEqual(actual, expected);
}

// Placeholder PHC string used to keep login timing uniform on unknown-email:
// the same PBKDF2 cost runs whether the user exists or not. The salt+hash are
// all-zero bytes — verification will fail (the real password will never match
// an empty digest) so this is safe to ship as a public constant.
export const PLACEHOLDER_PHC = `${PBKDF2_ALG}$${PBKDF2_ITERATIONS}$${b64uEncode(
  new Uint8Array(PBKDF2_SALT_BYTES),
)}$${b64uEncode(new Uint8Array(PBKDF2_KEY_BYTES))}`;

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
  keyBytes: number = PBKDF2_KEY_BYTES,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: PBKDF2_HASH, salt, iterations },
    key,
    keyBytes * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
