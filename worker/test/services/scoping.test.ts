import { TRPCError } from '@trpc/server';
import { env } from 'cloudflare:test';
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
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
} from '../../src/services/boards';

const ALICE: Scope = { userId: 'user-alice' };
const BOB: Scope = { userId: 'user-bob' };

function db() {
  return createDb(env.DB);
}

function ctx(scope: Scope): ServiceCtx {
  return new ServiceCtx(db(), env.IMAGES, scope);
}

async function wipe() {
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM item_images');
  await env.DB.exec('DELETE FROM items');
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
    ]);
}

describe('cross-user scoping', () => {
  beforeEach(wipe);

  it('listBoards only returns boards owned by the caller', async () => {
    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, "Alice's board")),
    );
    await withTransaction(db(), env.IMAGES, BOB, (tx) =>
      Promise.resolve(createBoard(tx, "Bob's board")),
    );

    const aliceBoards = await listBoards(ctx(ALICE));
    const bobBoards = await listBoards(ctx(BOB));
    expect(aliceBoards.map((b) => b.name)).toEqual(["Alice's board"]);
    expect(bobBoards.map((b) => b.name)).toEqual(["Bob's board"]);
  });

  it("renameBoard NOT_FOUND when targeting another user's board", async () => {
    const aliceBoard = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, "Alice's board")),
    );
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        renameBoard(tx, aliceBoard.id, 'hacked'),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // And the row is unchanged.
    const fresh = await db().query.boards.findFirst({
      where: (b, { eq }) => eq(b.id, aliceBoard.id),
    });
    expect(fresh?.name).toBe("Alice's board");
  });

  it("deleteBoard NOT_FOUND when targeting another user's board", async () => {
    const aliceBoard = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, "Alice's board")),
    );
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        deleteBoard(tx, aliceBoard.id),
      ),
    ).rejects.toBeInstanceOf(TRPCError);
    expect((await listBoards(ctx(ALICE))).map((b) => b.id)).toContain(
      aliceBoard.id,
    );
  });

  it("listBoardItems returns empty for another user's board id", async () => {
    const aliceBoard = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, "Alice's board")),
    );
    await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      addBoardItem(tx, aliceBoard.id, {
        sourceUrl: 'https://example.com/x',
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

    expect(await listBoardItems(ctx(BOB), aliceBoard.id)).toEqual([]);
    expect(await listBoardItems(ctx(ALICE), aliceBoard.id)).toHaveLength(1);
  });

  it("addBoardItem NOT_FOUND on another user's board", async () => {
    const aliceBoard = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, "Alice's board")),
    );
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        addBoardItem(tx, aliceBoard.id, {
          sourceUrl: 'https://example.com/x',
          title: 'Bob trying',
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

  it('patch/delete placement NOT_FOUND across users', async () => {
    const aliceBoard = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      Promise.resolve(createBoard(tx, "Alice's board")),
    );
    const placement = await withTransaction(db(), env.IMAGES, ALICE, (tx) =>
      addBoardItem(tx, aliceBoard.id, {
        sourceUrl: 'https://example.com/x',
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

    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        patchBoardItem(tx, placement.id, { x: 999 }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      withTransaction(db(), env.IMAGES, BOB, (tx) =>
        deleteBoardItem(tx, placement.id),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
