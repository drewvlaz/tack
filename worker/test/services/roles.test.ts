import { env } from 'cloudflare:test';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import { P, roleHas } from '../../src/db/schema';
import type { Scope } from '../../src/db/tx';
import { ServiceCtx, withTransaction } from '../../src/db/tx';
import { addBoardItem } from '../../src/services/boardItems';
import {
  acceptInvite,
  createInvite,
  listMembers,
  removeMember,
  updateMemberRole,
} from '../../src/services/boardMembers';
import { createBoard, renameBoard } from '../../src/services/boards';

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
        email: 'a@x',
        passwordHash: 'x',
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: BOB.userId,
        email: 'b@x',
        passwordHash: 'x',
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: CAROL.userId,
        email: 'c@x',
        passwordHash: 'x',
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
}

async function aliceCreatesBoard(): Promise<string> {
  const board = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
    Promise.resolve(createBoard(tx, 'Shared')),
  );
  return board.id;
}

// Share to BOB at the given role via a fresh invite. Returns the resolved
// member row's role for assertions.
async function shareTo(
  boardId: string,
  to: Scope,
  role: 'editor' | 'viewer',
): Promise<void> {
  const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
    createInvite(tx, boardId, role),
  );
  await withTransaction(db(), env.IMAGES, to, (tx) => acceptInvite(tx, token));
}

async function memberRole(
  boardId: string,
  userId: string,
): Promise<string | null> {
  const row = await db().query.boardMembers.findFirst({
    where: and(
      eq(schema.boardMembers.boardId, boardId),
      eq(schema.boardMembers.userId, userId),
      isNull(schema.boardMembers.deletedAt),
    ),
  });
  return row?.role ?? null;
}

describe('permission catalog', () => {
  it('roleHas truth table', () => {
    expect(roleHas('viewer', P.BoardView)).toBe(true);
    expect(roleHas('viewer', P.BoardEdit)).toBe(false);
    expect(roleHas('viewer', P.BoardManage)).toBe(false);

    expect(roleHas('editor', P.BoardView)).toBe(true);
    expect(roleHas('editor', P.BoardEdit)).toBe(true);
    expect(roleHas('editor', P.BoardManage)).toBe(false);

    expect(roleHas('owner', P.BoardView)).toBe(true);
    expect(roleHas('owner', P.BoardEdit)).toBe(true);
    expect(roleHas('owner', P.BoardManage)).toBe(true);
  });
});

describe('boards.require', () => {
  beforeEach(wipe);

  it('owner passes every permission', async () => {
    const boardId = await aliceCreatesBoard();
    const c = ctx(ALICE);
    await expect(c.boards.require(boardId, P.BoardView)).resolves.toBe('owner');
    await expect(c.boards.require(boardId, P.BoardEdit)).resolves.toBe('owner');
    await expect(c.boards.require(boardId, P.BoardManage)).resolves.toBe(
      'owner',
    );
  });

  it('editor passes view+edit, fails manage with FORBIDDEN', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');
    const c = ctx(BOB);
    await expect(c.boards.require(boardId, P.BoardView)).resolves.toBe(
      'editor',
    );
    await expect(c.boards.require(boardId, P.BoardEdit)).resolves.toBe(
      'editor',
    );
    await expect(
      c.boards.require(boardId, P.BoardManage),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('viewer passes view, fails edit and manage with FORBIDDEN', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');
    const c = ctx(BOB);
    await expect(c.boards.require(boardId, P.BoardView)).resolves.toBe(
      'viewer',
    );
    await expect(c.boards.require(boardId, P.BoardEdit)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      c.boards.require(boardId, P.BoardManage),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('non-member gets NOT_FOUND, never FORBIDDEN (existence-leak invariant)', async () => {
    const boardId = await aliceCreatesBoard();
    const c = ctx(CAROL);
    for (const perm of [P.BoardView, P.BoardEdit, P.BoardManage] as const) {
      await expect(c.boards.require(boardId, perm)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    }
  });
});

describe('createInvite: role binding', () => {
  beforeEach(wipe);

  it('persists role=viewer on the invite row', async () => {
    const boardId = await aliceCreatesBoard();
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, boardId, 'viewer'),
    );
    // Recreate the same hash the service uses (raw token → SHA-256 hex). Easier
    // to just look up the invite by boardId since there's only one.
    const invite = await db().query.boardInvites.findFirst({
      where: eq(schema.boardInvites.boardId, boardId),
    });
    expect(invite?.role).toBe('viewer');
    expect(token).toBeTruthy();
  });

  it('default still works for callers that omit role via router default', async () => {
    // The service requires a role explicitly; the router-layer default
    // applies before the service is called. Here we exercise both legal
    // values.
    const boardId = await aliceCreatesBoard();
    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, boardId, 'editor'),
    );
    const invite = await db().query.boardInvites.findFirst({
      where: eq(schema.boardInvites.boardId, boardId),
    });
    expect(invite?.role).toBe('editor');
  });
});

describe('acceptInvite: role honored, edit gating', () => {
  beforeEach(wipe);

  it('viewer invite creates a viewer member row', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');
    expect(await memberRole(boardId, BOB.userId)).toBe('viewer');
  });

  it('viewer cannot addBoardItem (FORBIDDEN, not NOT_FOUND)', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');

    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        addBoardItem(tx, boardId, {
          sourceUrl: 'https://example.com',
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
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('editor invite still permits addBoardItem', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');

    const item = await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      addBoardItem(tx, boardId, {
        sourceUrl: 'https://example.com',
        title: 'T',
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
    expect(item.id).toBeTruthy();
  });
});

describe('re-invite at a different role', () => {
  beforeEach(wipe);

  it('editor → removed → re-invite as viewer restores row with role=viewer', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');
    expect(await memberRole(boardId, BOB.userId)).toBe('editor');

    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      removeMember(tx, boardId, BOB.userId),
    );
    expect(await memberRole(boardId, BOB.userId)).toBeNull();

    await shareTo(boardId, BOB, 'viewer');
    expect(await memberRole(boardId, BOB.userId)).toBe('viewer');
  });
});

describe('self-redeem: promote-only', () => {
  beforeEach(wipe);

  it('viewer redeeming editor-link → promotes to editor', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');
    expect(await memberRole(boardId, BOB.userId)).toBe('viewer');

    // Alice issues an editor link, Bob (the existing viewer member) redeems it.
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, boardId, 'editor'),
    );
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      acceptInvite(tx, token),
    );
    expect(await memberRole(boardId, BOB.userId)).toBe('editor');
  });

  it('editor redeeming viewer-link → consumes token, role stays editor (no demotion)', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');
    expect(await memberRole(boardId, BOB.userId)).toBe('editor');

    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, boardId, 'viewer'),
    );
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      acceptInvite(tx, token),
    );
    expect(await memberRole(boardId, BOB.userId)).toBe('editor');
  });

  it('owner redeeming any link → consume-and-no-op', async () => {
    const boardId = await aliceCreatesBoard();
    const { token } = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      createInvite(tx, boardId, 'viewer'),
    );
    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      acceptInvite(tx, token),
    );
    // No member row created for the owner.
    expect(await memberRole(boardId, ALICE.userId)).toBeNull();
    // The token was consumed (a second redeem rejects).
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) => acceptInvite(tx, token)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('updateMemberRole', () => {
  beforeEach(wipe);

  it('owner promotes viewer → editor and rejects further edits accordingly', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');

    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      updateMemberRole(tx, boardId, BOB.userId, 'editor'),
    );
    expect(await memberRole(boardId, BOB.userId)).toBe('editor');

    // Bob can now add items.
    const item = await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      addBoardItem(tx, boardId, {
        sourceUrl: 'https://example.com',
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
    expect(item.id).toBeTruthy();
  });

  it('owner demotes editor → viewer; subsequent addBoardItem is FORBIDDEN', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');

    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      updateMemberRole(tx, boardId, BOB.userId, 'viewer'),
    );
    expect(await memberRole(boardId, BOB.userId)).toBe('viewer');

    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        addBoardItem(tx, boardId, {
          sourceUrl: 'https://example.com',
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
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('non-owner caller is FORBIDDEN', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');

    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        updateMemberRole(tx, boardId, BOB.userId, 'viewer'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('owner editing their own role is BAD_REQUEST', async () => {
    const boardId = await aliceCreatesBoard();
    await expect(
      withTransaction(db(), env.IMAGES, ALICE, (tx) =>
        updateMemberRole(tx, boardId, ALICE.userId, 'editor'),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('target is not a member → NOT_FOUND', async () => {
    const boardId = await aliceCreatesBoard();
    await expect(
      withTransaction(db(), env.IMAGES, ALICE, (tx) =>
        updateMemberRole(tx, boardId, CAROL.userId, 'editor'),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('listMembers: accessible to viewers, role per row reflects DB', () => {
  beforeEach(wipe);

  it('viewer can list members and sees mixed roles', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');
    await shareTo(boardId, CAROL, 'viewer');

    const asCarol = await listMembers(ctx(CAROL), boardId);
    const rolesByEmail = Object.fromEntries(
      asCarol.map((m) => [m.email, m.role]),
    );
    expect(rolesByEmail).toEqual({
      'a@x': 'owner',
      'b@x': 'editor',
      'c@x': 'viewer',
    });
  });
});

describe('boards.manage gated behind P.BoardManage', () => {
  beforeEach(wipe);

  it('editor cannot rename the board (FORBIDDEN)', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'editor');
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        renameBoard(tx, boardId, 'Renamed'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('viewer cannot rename the board (FORBIDDEN)', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        renameBoard(tx, boardId, 'Renamed'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('viewer cannot createInvite (FORBIDDEN)', async () => {
    const boardId = await aliceCreatesBoard();
    await shareTo(boardId, BOB, 'viewer');
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        createInvite(tx, boardId, 'viewer'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
