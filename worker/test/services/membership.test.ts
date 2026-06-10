import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import type { Scope } from '../../src/db/tx';
import { ServiceCtx, withTransaction } from '../../src/db/tx';
import {
  addBoardItem,
  deleteBoardItem,
  listBoardItems,
  patchBoardItem,
} from '../../src/services/boardItems';
import {
  acceptInvite,
  createInvite,
  leaveBoard,
  listMembers,
  removeMember,
} from '../../src/services/boardMembers';
import {
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
} from '../../src/services/boards';

const ALICE: Scope = { userId: 'user-alice' };
const BOB: Scope = { userId: 'user-bob' };
const CAROL: Scope = { userId: 'user-carol' };

function db() {
  return createDb(env.DB);
}

function ctx(scope: Scope): ServiceCtx {
  return new ServiceCtx(db(), env.IMAGES, scope);
}

async function wipe() {
  await env.DB.exec('DELETE FROM board_invites');
  await env.DB.exec('DELETE FROM board_members');
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM boards');
  await env.DB.exec('DELETE FROM sessions');
  await env.DB.exec('DELETE FROM users');
  await db()
    .insert(schema.users)
    .values([
      {
        id: ALICE.userId,
        email: 'alice@local',
        passwordHash: 'x',
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: BOB.userId,
        email: 'bob@local',
        passwordHash: 'x',
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: CAROL.userId,
        email: 'carol@local',
        passwordHash: 'x',
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
}

// Helper: Alice creates a board, generates an invite, Bob accepts. Returns
// the resulting boardId so tests can drive operations against it.
async function shareBoardAliceToBob(): Promise<{ boardId: string }> {
  const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
    Promise.resolve(createBoard(tx, 'Shared')),
  );
  const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
    createInvite(tx, board.id),
  );
  await withTransaction(db(), env.IMAGES, BOB, (tx) => acceptInvite(tx, token));
  return { boardId: board.id };
}

describe('membership: editor access', () => {
  beforeEach(wipe);

  it("listBoards surfaces shared boards under the member's account", async () => {
    const { boardId } = await shareBoardAliceToBob();

    const aliceBoards = await listBoards(ctx(ALICE));
    const bobBoards = await listBoards(ctx(BOB));
    const carolBoards = await listBoards(ctx(CAROL));

    expect(aliceBoards.map((b) => b.id)).toEqual([boardId]);
    expect(aliceBoards[0].role).toBe('owner');
    expect(bobBoards.map((b) => b.id)).toEqual([boardId]);
    expect(bobBoards[0].role).toBe('editor');
    expect(carolBoards).toEqual([]);
  });

  it('editor can list, add, patch, delete placements on a shared board', async () => {
    const { boardId } = await shareBoardAliceToBob();

    const placement = await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      addBoardItem(tx, boardId, {
        sourceUrl: 'https://example.com/bob',
        title: 'Bob added',
        brand: null,
        description: null,
        price: null,
        currency: null,
        details: [],
        images: [],
        x: 10,
        y: 20,
      }),
    );

    expect(
      (await listBoardItems(ctx(ALICE), boardId)).map((b) => b.title),
    ).toContain('Bob added');
    expect(
      (await listBoardItems(ctx(BOB), boardId)).map((b) => b.title),
    ).toContain('Bob added');

    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      patchBoardItem(tx, placement.id, { x: 999 }),
    );
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      deleteBoardItem(tx, placement.id),
    );
    expect(await listBoardItems(ctx(BOB), boardId)).toHaveLength(0);
  });

  it('editor can move placements added by the owner', async () => {
    const { boardId } = await shareBoardAliceToBob();
    const alicePlacement = await withTransaction(
      db(),
      env.IMAGES,
      ALICE,
      (tx) =>
        addBoardItem(tx, boardId, {
          sourceUrl: 'https://example.com/alice',
          title: 'Alice item',
          brand: null,
          description: null,
          price: null,
          currency: null,
          details: [],
          images: [],
          x: 0,
          y: 0,
        }),
    );

    // Bob (editor) repositions Alice's item.
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      patchBoardItem(tx, alicePlacement.id, { x: 42, y: 84 }),
    );

    const [row] = await db().query.boardItems.findMany({
      where: (bi, { eq }) => eq(bi.id, alicePlacement.id),
    });
    expect(row.x).toBe(42);
    expect(row.y).toBe(84);
  });

  it('editor cannot rename or delete the shared board', async () => {
    const { boardId } = await shareBoardAliceToBob();
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        renameBoard(tx, boardId, 'Hijacked'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) => deleteBoard(tx, boardId)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('editor cannot invite or remove members or list members', async () => {
    const { boardId } = await shareBoardAliceToBob();
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) => createInvite(tx, boardId)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        removeMember(tx, boardId, ALICE.userId),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(ctx(BOB).boards.requireOwner(boardId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('membership: removal and leave', () => {
  beforeEach(wipe);

  it('removeMember soft-deletes membership; member loses access', async () => {
    const { boardId } = await shareBoardAliceToBob();

    expect(await listBoardItems(ctx(BOB), boardId)).toEqual([]); // baseline access

    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      removeMember(tx, boardId, BOB.userId),
    );

    expect(await listBoards(ctx(BOB))).toEqual([]);
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        addBoardItem(tx, boardId, {
          sourceUrl: 'https://example.com/x',
          title: null,
          brand: null,
          description: null,
          price: null,
          currency: null,
          details: [],
          images: [],
          x: 0,
          y: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('re-invite restores soft-removed membership instead of re-inserting', async () => {
    const { boardId } = await shareBoardAliceToBob();
    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      removeMember(tx, boardId, BOB.userId),
    );

    // Fresh invite to the same person.
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, boardId),
    );
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      acceptInvite(tx, token),
    );

    // Exactly one membership row exists for (board, bob).
    const rows = await db().query.boardMembers.findMany({
      where: (m, { and, eq }) =>
        and(eq(m.boardId, boardId), eq(m.userId, BOB.userId)),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).toBeNull();
    expect((await listBoards(ctx(BOB))).map((b) => b.id)).toEqual([boardId]);
  });

  it('leave removes self; owner cannot leave their own board', async () => {
    const { boardId } = await shareBoardAliceToBob();

    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      leaveBoard(tx, boardId),
    );
    expect(await listBoards(ctx(BOB))).toEqual([]);

    // Alice (owner) can't leave.
    const aliceBoard = (await listBoards(ctx(ALICE)))[0];
    await expect(
      withTransaction(db(), env.IMAGES, ALICE, (tx) =>
        leaveBoard(tx, aliceBoard.id),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('owner cannot remove themselves via removeMember', async () => {
    const { boardId } = await shareBoardAliceToBob();
    await expect(
      withTransaction(db(), env.IMAGES, ALICE, (tx) =>
        removeMember(tx, boardId, ALICE.userId),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('invites', () => {
  beforeEach(wipe);

  it('a redeemed token cannot be redeemed again', async () => {
    const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, 'Once')),
    );
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, board.id),
    );
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      acceptInvite(tx, token),
    );

    await expect(
      withTransaction(db(), env.IMAGES, CAROL, (tx) => acceptInvite(tx, token)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('an expired token cannot be redeemed', async () => {
    const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, 'Stale')),
    );
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, board.id),
    );
    // Force expiry. expiresAt is unix seconds.
    await env.DB.prepare(
      'UPDATE board_invites SET expires_at = ?1 WHERE token = ?2',
    )
      .bind(0, token)
      .run();

    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) => acceptInvite(tx, token)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('owner accepting their own invite is a no-op (consumes token, no member row)', async () => {
    const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, 'Self')),
    );
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, board.id),
    );
    const result = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      acceptInvite(tx, token),
    );
    expect(result.boardId).toBe(board.id);
    // No board_members row was inserted.
    const members = await db().query.boardMembers.findMany();
    expect(members).toEqual([]);
    // Token is consumed.
    const [invite] = await db().query.boardInvites.findMany({
      where: (i, { eq }) => eq(i.token, token),
    });
    expect(invite.redeemedAt).not.toBeNull();
  });

  it('listMembers includes owner + active editors with emails', async () => {
    const { boardId } = await shareBoardAliceToBob();
    const members = await listMembers(ctx(ALICE), boardId);
    expect(members.map((m) => ({ email: m.email, role: m.role }))).toEqual([
      { email: 'alice@local', role: 'owner' },
      { email: 'bob@local', role: 'editor' },
    ]);
  });
});

describe('membership: r2 image scope still enforced', () => {
  beforeEach(wipe);

  it("editor's added items only accept their own r2 keys, not the owner's", async () => {
    const { boardId } = await shareBoardAliceToBob();

    // Bob can attach his own r2 keys.
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      addBoardItem(tx, boardId, {
        sourceUrl: 'https://example.com/ok',
        title: null,
        brand: null,
        description: null,
        price: null,
        currency: null,
        details: [],
        images: [
          {
            kind: 'r2',
            key: `items/${BOB.userId}/abc`,
            sourceUrl: 'https://cdn/a.jpg',
          },
        ],
        x: 0,
        y: 0,
      }),
    );

    // Bob CANNOT attach Alice's r2 keys, even on a board Alice owns.
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        addBoardItem(tx, boardId, {
          sourceUrl: 'https://example.com/bad',
          title: null,
          brand: null,
          description: null,
          price: null,
          currency: null,
          details: [],
          images: [
            {
              kind: 'r2',
              key: `items/${ALICE.userId}/abc`,
              sourceUrl: 'https://cdn/b.jpg',
            },
          ],
          x: 0,
          y: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('cross-user scoping still holds for non-members', () => {
  beforeEach(wipe);

  it("non-member's listBoards excludes the shared board", async () => {
    await shareBoardAliceToBob();
    expect(await listBoards(ctx(CAROL))).toEqual([]);
  });

  it('non-member cannot patch a placement on the shared board', async () => {
    const { boardId } = await shareBoardAliceToBob();
    const placement = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      addBoardItem(tx, boardId, {
        sourceUrl: 'https://example.com/x',
        title: null,
        brand: null,
        description: null,
        price: null,
        currency: null,
        details: [],
        images: [],
        x: 0,
        y: 0,
      }),
    );
    await expect(
      withTransaction(db(), env.IMAGES, CAROL, (tx) =>
        patchBoardItem(tx, placement.id, { x: 999 }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('invite token bypasses INVITE_EMAILS allowlist at signup', () => {
  // The signup service takes the allowlist as a parameter, so we can test
  // the bypass directly without spinning up the Hono route.
  beforeEach(wipe);

  it('signup with a valid invite token succeeds for an email not on the allowlist', async () => {
    const { signup } = await import('../../src/services/auth');
    // Pre-create Alice and her invite.
    const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, 'Inviting')),
    );
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, board.id),
    );

    // Signup as a brand-new user (Diana) who is NOT on the allowlist.
    const empty = new Set<string>();
    const outcome = await withTransaction(
      db(),
      env.IMAGES,
      { userId: '__auth__' },
      (tx) =>
        signup(tx, 'diana@example.com', 'a-strong-password', empty, {
          inviteToken: token,
        }),
    );
    expect(outcome.user.email).toBe('diana@example.com');
    expect(outcome.invitedBoardId).toBe(board.id);

    // Diana now has access via membership.
    const dianaCtx = ctx({ userId: outcome.user.id });
    expect((await listBoards(dianaCtx)).map((b) => b.id)).toEqual([board.id]);
  });

  it('signup WITHOUT invite token fails for an email not on the allowlist', async () => {
    const { signup } = await import('../../src/services/auth');
    const empty = new Set<string>();
    await expect(
      withTransaction(db(), env.IMAGES, { userId: '__auth__' }, (tx) =>
        signup(tx, 'eve@example.com', 'a-strong-password', empty),
      ),
    ).rejects.toMatchObject({ code: 'not_allowlisted' });
  });

  it('signup with a stale invite token fails atomically (no user, no member)', async () => {
    const { signup } = await import('../../src/services/auth');
    const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, 'Stale')),
    );
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, board.id),
    );
    await env.DB.prepare(
      'UPDATE board_invites SET expires_at = ?1 WHERE token = ?2',
    )
      .bind(0, token)
      .run();

    await expect(
      withTransaction(db(), env.IMAGES, { userId: '__auth__' }, (tx) =>
        signup(
          tx,
          'frank@example.com',
          'a-strong-password',
          new Set<string>(),
          { inviteToken: token },
        ),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // No user was inserted (signup rolled back).
    const frank = await db().query.users.findFirst({
      where: eq(schema.users.email, 'frank@example.com'),
    });
    expect(frank).toBeUndefined();
  });
});
