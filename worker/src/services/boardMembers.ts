import { TRPCError } from '@trpc/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import { BOARD_ROLES, P, roleHas, type BoardRole } from '../db/schema';
import type { ServiceCtx, Tx } from '../db/tx';
import { b64uEncode } from '../lib/b64url';
import { genId } from '../lib/id';
import { nowSec } from '../lib/time';
import type { InviteRole } from '../schemas/board';

// Like `services/auth.ts`, this file reaches `tx.db` / `ctx.db` directly:
// board_members and board_invites don't fit the standard owned-table scoping
// pattern (their access rules are role-based and route-specific), so wiring
// them through the auto-scoped repo machinery would just hide the explicit
// permission checks that already live here.

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type MemberView = {
  userId: string;
  email: string;
  role: BoardRole;
  joinedAt: number;
};

// Stored role strings are TEXT — guard the cast. An unknown value falls
// back to 'viewer' (most restrictive) rather than crashing the request.
function readStoredRole(stored: string): BoardRole {
  return (BOARD_ROLES as readonly string[]).includes(stored)
    ? (stored as BoardRole)
    : 'viewer';
}

// Raw form is only ever surfaced to the inviter through the share URL —
// the DB stores the hash (see hashInviteToken below).
function genToken(): string {
  return b64uEncode(crypto.getRandomValues(new Uint8Array(INVITE_TOKEN_BYTES)));
}

// SHA-256 hex of the raw token. Used both at issuance (to derive the value
// we store) and at redemption (to look up by). The raw input is 32 random
// bytes — a single SHA-256 round is plenty; no salt or KDF stretching.
// Hex (not base64) for easy eyeballing in db:studio.
async function hashInviteToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(rawToken),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------- reads ----------

export async function listMembers(
  ctx: ServiceCtx,
  boardId: string,
): Promise<MemberView[]> {
  // P.BoardView gated by the caller (the router runs the require check).
  // Returns the owner + all active members with their emails joined from
  // users.
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
      role: schema.boardMembers.role,
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
      role: readStoredRole(m.role),
      joinedAt: m.joinedAt,
    })),
  ];
}

// ---------- invites ----------

export async function createInvite(
  tx: Tx,
  boardId: string,
  role: InviteRole,
): Promise<{ token: string; expiresAt: number; role: InviteRole }> {
  // P.BoardManage. Generates a fresh unguessable token; multiple outstanding
  // invites per board are allowed (e.g. owner shares link, then realizes
  // they want a new one and lets the old expire). Idempotency isn't useful
  // here — each token is single-use.
  //
  // `role` is bound to the token at creation time. The redeemer accepts at
  // exactly the role the inviter chose; if the owner wants to share a board
  // read-only, they generate a viewer link.
  await tx.boards.require(boardId, P.BoardManage);

  const now = nowSec();
  const token = genToken();
  const tokenHash = await hashInviteToken(token);
  const expiresAt = now + INVITE_TTL_SECONDS;
  tx.stage(
    tx.db.insert(schema.boardInvites).values({
      id: genId(),
      boardId,
      tokenHash,
      createdBy: tx.scope.userId,
      expiresAt,
      role,
      createdAt: now,
      updatedAt: now,
    }),
  );
  // Raw token returned to the caller — it's the one and only time the
  // cleartext value is surfaced. The DB only ever holds the hash.
  return { token, expiresAt, role };
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
  // The DB only knows the hash. Hash the presented raw token and look it
  // up — same one-pass SHA-256 used at issuance, so the digests match.
  const tokenHash = await hashInviteToken(token);
  const invite = await tx.db.query.boardInvites.findFirst({
    where: eq(schema.boardInvites.tokenHash, tokenHash),
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
  // here. Resolve the redeemer's current role on the board.
  const inviteRole = readStoredRole(invite.role) as BoardRole; // 'editor' | 'viewer'
  const currentRole = await tx.boards.roleFor(invite.boardId);

  if (currentRole !== null) {
    // Already a member (or the owner). Promote-only semantics: if the
    // invite carries strictly more permissions than the current role,
    // upgrade the row; otherwise just consume the token. Owner is always
    // at max → consume-and-no-op.
    if (shouldPromote(currentRole, inviteRole)) {
      // Owner can never appear here as a target — owners have no row in
      // board_members — so this UPDATE is safe even for `currentRole === 'owner'`
      // (the WHERE matches zero rows). But we already short-circuit above.
      tx.stage(
        tx.db
          .update(schema.boardMembers)
          .set({ role: inviteRole, updatedAt: now })
          .where(
            and(
              eq(schema.boardMembers.boardId, invite.boardId),
              eq(schema.boardMembers.userId, userId),
              isNull(schema.boardMembers.deletedAt),
            ),
          ),
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

  // Not currently a member. Look for a previously-removed row to restore
  // (UNIQUE(board_id, user_id) means re-inserting would conflict). On
  // restore, the new invite's role wins — re-sharing at a different level
  // is the explicit way to change a returning member's role.
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
          role: inviteRole,
        })
        .where(eq(schema.boardMembers.id, existing.id)),
    );
  } else {
    tx.stage(
      tx.db.insert(schema.boardMembers).values({
        id: genId(),
        boardId: invite.boardId,
        userId,
        role: inviteRole,
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

// Self-redeem promotion check: the invite upgrades the member iff the
// invite's role has permissions the current role lacks. Expressed as
// "exists a permission the invite grants that the current role doesn't"
// — works for any future permission set without re-encoding the ranking.
function shouldPromote(current: BoardRole, invite: BoardRole): boolean {
  return roleHas(invite, P.BoardEdit) && !roleHas(current, P.BoardEdit);
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
  // P.BoardManage. Soft-remove the membership; restoring (e.g. re-invite
  // later) clears deletedAt rather than re-inserting, preserving join
  // history.
  await tx.boards.require(boardId, P.BoardManage);

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

// Change an active member's role on a board. P.BoardManage. The target
// must currently be a non-owner member (owners have no row in
// board_members — ownership transfer is a separate future flow).
//
// TODO: ownership transfer. When that lands, it'll touch boards.ownerId
// + board_members atomically and is a distinct operation from this one.
export async function updateMemberRole(
  tx: Tx,
  boardId: string,
  userId: string,
  role: InviteRole,
): Promise<void> {
  await tx.boards.require(boardId, P.BoardManage);

  if (userId === tx.scope.userId) {
    // Owner editing their own row would be a no-op (no row exists) — give
    // a clear message instead of NOT_FOUND.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        "Owners can't change their own role; ownership transfer is not yet supported.",
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
      .set({ role, updatedAt: now })
      .where(eq(schema.boardMembers.id, member.id)),
  );
}

export async function leaveBoard(tx: Tx, boardId: string): Promise<void> {
  // Self-removal. The "owners can't leave" rule is an IDENTITY check, not a
  // permission check — owner here means "boards.ownerId === caller", the
  // unique creator slot, not "has manage permission" (which a future admin
  // role would also satisfy). Read the board (which throws NOT_FOUND if the
  // caller isn't a member) and compare ownerId directly.
  const board = await tx.boards.byIdOrThrow(boardId);
  if (board.ownerId === tx.scope.userId) {
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
    // Shouldn't happen given byIdOrThrow succeeded (caller is a member), but
    // guard anyway against a concurrent removeMember.
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
