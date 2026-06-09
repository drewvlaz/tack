import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';

// Like `services/auth.ts`, this file reaches `tx.db` / `ctx.db` directly:
// board_members and board_invites don't fit the standard owned-table scoping
// pattern (their access rules are role-based and route-specific), so wiring
// them through the auto-scoped repo machinery would just hide the explicit
// `requireOwner` / `requireEditor` checks that already live here.

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type MemberRole = 'owner' | 'editor';

export type MemberView = {
  userId: string;
  email: string;
  role: MemberRole;
  joinedAt: number;
};

// base64url, no padding. Same encoding as session ids.
function genToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_TOKEN_BYTES));
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- reads ----------

export async function listMembers(
  ctx: ServiceCtx,
  boardId: string,
): Promise<MemberView[]> {
  // Owner-only — callers must check before invoking. Returns the owner + all
  // active members with their emails joined from users.
  const board = await ctx.boards.byIdOrThrow(boardId);

  const ownerRow = await ctx.db.query.users.findFirst({
    where: eq(schema.users.id, board.ownerId),
    columns: { id: true, email: true },
  });
  if (!ownerRow) {
    // Shouldn't be reachable given FK constraints; defensive.
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
  }

  const memberRows = await ctx.db
    .select({
      userId: schema.boardMembers.userId,
      email: schema.users.email,
      joinedAt: schema.boardMembers.createdAt,
    })
    .from(schema.boardMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.boardMembers.userId))
    .where(
      and(
        eq(schema.boardMembers.boardId, boardId),
        isNull(schema.boardMembers.deletedAt),
      ),
    )
    .orderBy(asc(schema.boardMembers.createdAt));

  return [
    {
      userId: ownerRow.id,
      email: ownerRow.email,
      role: 'owner',
      joinedAt: board.createdAt,
    },
    ...memberRows.map((m) => ({
      userId: m.userId,
      email: m.email,
      role: 'editor' as const,
      joinedAt: m.joinedAt,
    })),
  ];
}

// ---------- invites ----------

export async function createInvite(
  tx: Tx,
  boardId: string,
): Promise<{ token: string; expiresAt: number }> {
  // Owner-only. Generates a fresh unguessable token; multiple outstanding
  // invites per board are allowed (e.g. owner shares link, then realizes
  // they want a new one and lets the old expire). Idempotency isn't useful
  // here — each token is single-use.
  await tx.boards.requireOwner(boardId);

  const now = nowSec();
  const token = genToken();
  const expiresAt = now + INVITE_TTL_SECONDS;
  tx.stage(
    tx.db.insert(schema.boardInvites).values({
      id: genId(),
      boardId,
      token,
      createdBy: tx.scope.userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { token, expiresAt };
}

// Outcome of redeeming an invite. The boardId lets the caller (signup OR
// acceptInvite) navigate the user to the board immediately.
export type InviteRedemption = { boardId: string };

// Redeem a token: validate it, create the membership, mark the invite
// redeemed. Used by both the signup flow (atomic with user creation) and the
// post-login acceptInvite flow. Throws BAD_REQUEST for any failure mode
// the caller could surface as "this link doesn't work".
export async function redeemInvite(
  tx: Tx,
  token: string,
  userId: string,
): Promise<InviteRedemption> {
  const invite = await tx.db.query.boardInvites.findFirst({
    where: eq(schema.boardInvites.token, token),
  });
  if (!invite) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invite link is invalid.',
    });
  }
  if (invite.redeemedAt !== null) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invite link has already been used.',
    });
  }
  const now = nowSec();
  if (invite.expiresAt < now) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invite link has expired.',
    });
  }

  // boardInvites.boardId is FK-cascaded, so the board necessarily exists
  // here. Resolve the redeemer's role using the scoped helper — `tx.scope`
  // is the redeemer (passed in via `userId`, which matches `tx.scope.userId`
  // for both signup and acceptInvite paths). If the redeemer is the owner
  // OR already an active member, consume the token and return; otherwise
  // create or restore the editor membership.
  const role = await tx.boards.roleFor(invite.boardId);
  if (role !== null) {
    // Owner or active member — just consume the token.
    tx.stage(
      tx.db
        .update(schema.boardInvites)
        .set({ redeemedAt: now, redeemedBy: userId, updatedAt: now })
        .where(eq(schema.boardInvites.id, invite.id)),
    );
    return { boardId: invite.boardId };
  }

  // Not currently a member. Look for a previously-removed row to restore
  // (UNIQUE(board_id, user_id) means re-inserting would conflict).
  const existing = await tx.db.query.boardMembers.findFirst({
    where: and(
      eq(schema.boardMembers.boardId, invite.boardId),
      eq(schema.boardMembers.userId, userId),
    ),
  });
  if (existing) {
    tx.stage(
      tx.db
        .update(schema.boardMembers)
        .set({
          deletedAt: null,
          updatedAt: now,
          invitedBy: invite.createdBy,
        })
        .where(eq(schema.boardMembers.id, existing.id)),
    );
  } else {
    tx.stage(
      tx.db.insert(schema.boardMembers).values({
        id: genId(),
        boardId: invite.boardId,
        userId,
        role: 'editor',
        invitedBy: invite.createdBy,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  tx.stage(
    tx.db
      .update(schema.boardInvites)
      .set({ redeemedAt: now, redeemedBy: userId, updatedAt: now })
      .where(eq(schema.boardInvites.id, invite.id)),
  );

  return { boardId: invite.boardId };
}

// Public wrapper for redeemInvite — used by the tRPC acceptInvite procedure.
// The signup flow calls redeemInvite directly with a freshly-created userId.
export async function acceptInvite(
  tx: Tx,
  token: string,
): Promise<InviteRedemption> {
  return redeemInvite(tx, token, tx.scope.userId);
}

// ---------- membership management ----------

export async function removeMember(
  tx: Tx,
  boardId: string,
  userId: string,
): Promise<void> {
  // Owner-only. Soft-remove the membership; restoring (e.g. re-invite later)
  // clears deletedAt rather than re-inserting, preserving join history.
  await tx.boards.requireOwner(boardId);

  if (userId === tx.scope.userId) {
    // Owner can't remove themselves via this path (they'd lose the board).
    // Use deleteBoard instead.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Owners cannot remove themselves; delete the board instead.',
    });
  }

  const member = await tx.db.query.boardMembers.findFirst({
    where: and(
      eq(schema.boardMembers.boardId, boardId),
      eq(schema.boardMembers.userId, userId),
      isNull(schema.boardMembers.deletedAt),
    ),
  });
  if (!member) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }

  const now = nowSec();
  tx.stage(
    tx.db
      .update(schema.boardMembers)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.boardMembers.id, member.id)),
  );
}

export async function leaveBoard(tx: Tx, boardId: string): Promise<void> {
  // Self-removal. Owner can't leave their own board (the action is
  // meaningless; either delete the board or transfer ownership — the latter
  // isn't implemented yet).
  const role = await tx.boards.roleFor(boardId);
  if (role === null) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  if (role === 'owner') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Owners cannot leave; delete the board instead.',
    });
  }

  const member = await tx.db.query.boardMembers.findFirst({
    where: and(
      eq(schema.boardMembers.boardId, boardId),
      eq(schema.boardMembers.userId, tx.scope.userId),
      isNull(schema.boardMembers.deletedAt),
    ),
  });
  if (!member) {
    // Shouldn't happen given the role check, but guard anyway.
    throw new TRPCError({ code: 'NOT_FOUND' });
  }

  const now = nowSec();
  tx.stage(
    tx.db
      .update(schema.boardMembers)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.boardMembers.id, member.id)),
  );
}
