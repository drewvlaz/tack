import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import type { Tx } from '../db/tx';
import { b64uEncode } from '../lib/b64url';
import { genId } from '../lib/id';
import {
  hashPassword,
  PLACEHOLDER_PHC,
  verifyPassword,
} from '../lib/passwordHash';
import { nowSec } from '../lib/time';
import { redeemInvite } from './boardMembers';

const SESSION_ID_BYTES = 32;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const MIN_PASSWORD_LENGTH = 8;

export type PublicUser = { id: string; email: string };

export class AuthError extends Error {
  constructor(
    public readonly code:
      | 'invalid_email'
      | 'invalid_password'
      | 'email_taken'
      | 'not_allowlisted'
      | 'invalid_credentials',
    message: string,
  ) {
    super(message);
  }
}

// ---------- sessions ----------

export type SessionLookup = {
  sessionId: string;
  user: PublicUser;
  expiresAt: number;
};

export async function lookupSession(
  db: Db,
  sessionId: string,
): Promise<SessionLookup | null> {
  const row = await db.query.sessions.findFirst({
    where: and(
      eq(schema.sessions.id, sessionId),
      gt(schema.sessions.expiresAt, nowSec()),
    ),
    with: {
      user: { columns: { id: true, email: true, deletedAt: true } },
    },
  });
  if (!row || row.user.deletedAt !== null) {
    return null;
  }
  return {
    sessionId: row.id,
    user: { id: row.user.id, email: row.user.email },
    expiresAt: row.expiresAt,
  };
}

// Used by the auth Hono routes (not services-from-services). Generates the
// session id, stages the INSERT, and returns the new id so the caller can
// drop it on the cookie.
export function createSession(tx: Tx, userId: string): string {
  const now = nowSec();
  const sessionId = b64uEncode(
    crypto.getRandomValues(new Uint8Array(SESSION_ID_BYTES)),
  );
  tx.stage(
    tx.db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      expiresAt: now + SESSION_TTL_SECONDS,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return sessionId;
}

export function deleteSession(tx: Tx, sessionId: string): void {
  tx.stage(
    tx.db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)),
  );
}

// ---------- signup / login ----------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): void {
  // Loose check — the real source of truth is the allowlist. Reject
  // obvious garbage early.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('invalid_email', 'Enter a valid email address.');
  }
}

function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      'invalid_password',
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
}

export type AuthOutcome = { user: PublicUser; sessionId: string };

export type SignupOptions = {
  inviteToken?: string;
};

export async function signup(
  tx: Tx,
  rawEmail: string,
  password: string,
  allowlist: ReadonlySet<string>,
  options: SignupOptions = {},
): Promise<AuthOutcome & { invitedBoardId?: string }> {
  const email = normalizeEmail(rawEmail);
  validateEmail(email);
  validatePassword(password);

  // A valid invite token bypasses the global INVITE_EMAILS allowlist: it's
  // a stronger signal (someone explicitly invited you to a specific board)
  // and the whole point of invites is that the inviter shouldn't also need
  // to be a deployment admin. The token is validated below inside the same
  // Tx so a forged token can't bypass the allowlist.
  const hasInvite = options.inviteToken !== undefined;
  if (!hasInvite && !allowlist.has(email)) {
    throw new AuthError(
      'not_allowlisted',
      'This email is not invited to sign up.',
    );
  }

  const existing = await tx.db.query.users.findFirst({
    where: eq(schema.users.email, email),
    columns: { id: true },
  });
  if (existing) {
    throw new AuthError('email_taken', 'An account with that email exists.');
  }

  const now = nowSec();
  const userId = genId();
  const passwordHash = await hashPassword(password);
  tx.stage(
    tx.db.insert(schema.users).values({
      id: userId,
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    }),
  );

  // Redeem the invite atomically with user creation: same Tx, same batch.
  // If the token turns out to be invalid the whole signup unwinds.
  let invitedBoardId: string | undefined;
  if (options.inviteToken !== undefined) {
    const redemption = await redeemInvite(tx, options.inviteToken, userId);
    invitedBoardId = redemption.boardId;
  }

  const sessionId = createSession(tx, userId);
  return {
    user: { id: userId, email },
    sessionId,
    ...(invitedBoardId !== undefined && { invitedBoardId }),
  };
}

export async function login(
  tx: Tx,
  rawEmail: string,
  password: string,
): Promise<AuthOutcome> {
  const email = normalizeEmail(rawEmail);
  const row = await tx.db.query.users.findFirst({
    where: eq(schema.users.email, email),
    columns: { id: true, email: true, passwordHash: true, deletedAt: true },
  });
  // Run verifyPassword even on miss to keep timing uniform — same call path
  // either way, no fast "user not found" return.
  const phc = row?.passwordHash ?? PLACEHOLDER_PHC;
  const ok = await verifyPassword(password, phc);
  if (!row || row.deletedAt !== null || !ok) {
    throw new AuthError('invalid_credentials', 'Invalid email or password.');
  }
  const sessionId = createSession(tx, row.id);
  return { user: { id: row.id, email: row.email }, sessionId };
}

// ---------- allowlist ----------

export function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}
