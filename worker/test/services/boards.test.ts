import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import type { Scope } from '../../src/db/tx';
import { ServiceCtx, withTransaction } from '../../src/db/tx';
import { addBoardItem, listBoardItems } from '../../src/services/boardItems';
import {
  createBoard,
  deleteBoard,
  listBoards,
} from '../../src/services/boards';

const USER_ID = 'user-test';
const SCOPE: Scope = { userId: USER_ID };

function db() {
  return createDb(env.DB);
}

function ctx(): ServiceCtx {
  return new ServiceCtx(db(), env.IMAGES, SCOPE);
}

async function wipe() {
  // FK cascades from boards → board_items, items → item_images, so order matters.
  // Sessions cascade from users, so we wipe sessions first to keep order safe
  // when we re-seed the fixture user.
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM boards');
  await env.DB.exec('DELETE FROM sessions');
  await env.DB.exec('DELETE FROM users');
  await db().insert(schema.users).values({
    id: USER_ID,
    email: 'test@local',
    passwordHash: 'unused-in-tests',
    createdAt: 0,
    updatedAt: 0,
  });
}

describe('boards service', () => {
  beforeEach(async () => {
    await wipe();
  });

  it('listBoards returns empty when no boards exist', async () => {
    expect(await listBoards(ctx())).toEqual([]);
  });

  it('createBoard inserts and returns a Board', async () => {
    const created = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'My Moodboard')),
    );
    expect(created.name).toBe('My Moodboard');
    expect(created.id).toMatch(/^[A-Za-z0-9]{21}$/);
    expect(typeof created.createdAt).toBe('number');
    // Verify it actually committed.
    expect(await listBoards(ctx())).toHaveLength(1);
  });

  it('listBoards returns boards ordered by createdAt ascending', async () => {
    const first = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'First')),
    );
    await env.DB.prepare('UPDATE boards SET created_at = 100 WHERE id = ?1')
      .bind(first.id)
      .run();
    const second = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'Second')),
    );
    await env.DB.prepare('UPDATE boards SET created_at = 200 WHERE id = ?1')
      .bind(second.id)
      .run();

    const boards = await listBoards(ctx());
    expect(boards.map((b) => b.name)).toEqual(['First', 'Second']);
  });

  it('deleteBoard hard-purges board, placements, and orphan items+blobs', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'To delete')),
    );
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addBoardItem(tx, board.id, {
        sourceUrl: 'https://example.com/p',
        title: 'Test',
        brand: null,
        description: null,
        price: null,
        currency: null,
        details: [],
        images: [
          {
            kind: 'r2',
            key: 'items/user-test/del-1',
            sourceUrl: 'https://cdn/a.jpg',
          },
        ],
        x: 0,
        y: 0,
      }),
    );
    await env.IMAGES.put('items/user-test/del-1', new Uint8Array([1, 2, 3]));
    expect(await listBoardItems(ctx(), board.id)).toHaveLength(1);

    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      deleteBoard(tx, board.id),
    );

    expect(await listBoards(ctx())).toEqual([]);
    expect(await listBoardItems(ctx(), board.id)).toEqual([]);
    expect(
      await db().query.boardItems.findMany({
        where: (bi, { eq }) => eq(bi.boardId, board.id),
      }),
    ).toEqual([]);
    expect(await db().query.boardItemImages.findMany()).toEqual([]);
    expect(await env.IMAGES.get('items/user-test/del-1')).toBeNull();
  });

  it('deleteBoard rolls the entire batch back if any statement fails', async () => {
    // Atomicity proof: if we slip a guaranteed-to-fail statement into the
    // same Tx the service uses, NOTHING should commit — the board, its
    // placement, and the item all survive.
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'Will not delete')),
    );
    const placement = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addBoardItem(tx, board.id, {
        sourceUrl: 'https://example.com/atomic',
        title: 'Atomic',
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
      withTransaction(db(), env.IMAGES, SCOPE, async (tx) => {
        // Stage a duplicate-PK insert FIRST so it runs before the deleteBoard
        // deletes — guaranteed UNIQUE constraint failure since the board
        // already exists. D1's batch is transactional, so the deletes that
        // follow must roll back.
        tx.stage(
          tx.db.insert(schema.boards).values({
            id: board.id,
            ownerId: USER_ID,
            name: 'duplicate',
            createdAt: 1,
            updatedAt: 1,
          }),
        );
        await deleteBoard(tx, board.id);
      }),
    ).rejects.toThrow();

    expect(await listBoards(ctx())).toHaveLength(1);
    expect(await listBoardItems(ctx(), board.id)).toHaveLength(1);
    // placement is referenced just to make sure it survived
    expect(
      await db().query.boardItems.findMany({
        where: (bi, { eq }) => eq(bi.id, placement.id),
      }),
    ).toHaveLength(1);
  });
});

describe('addBoardItem', () => {
  beforeEach(async () => {
    await wipe();
  });

  it('inserts item, images, and a placement; returns hydrated BoardItem', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );
    const item = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addBoardItem(tx, board.id, {
        sourceUrl: 'https://lemaire.fr/x',
        title: 'Blouson',
        brand: 'LEMAIRE',
        description: 'A soft leather blouson.',
        price: 2450,
        currency: 'EUR',
        details: [
          { label: 'Materials', value: '100% lambskin' },
          { label: 'Care', value: 'Specialist leather clean' },
        ],
        images: [
          {
            kind: 'r2',
            key: 'items/user-test/abc',
            sourceUrl: 'https://cdn/a.jpg',
          },
          {
            kind: 'r2',
            key: 'items/user-test/def',
            sourceUrl: 'https://cdn/b.jpg',
          },
        ],
        x: 10,
        y: 20,
      }),
    );

    expect(item.title).toBe('Blouson');
    expect(item.brand).toBe('LEMAIRE');
    expect(item.details).toEqual([
      { label: 'Materials', value: '100% lambskin' },
      { label: 'Care', value: 'Specialist leather clean' },
    ]);
    expect(item.images.map((img) => img.image)).toEqual([
      {
        kind: 'r2',
        key: 'items/user-test/abc',
        sourceUrl: 'https://cdn/a.jpg',
      },
      {
        kind: 'r2',
        key: 'items/user-test/def',
        sourceUrl: 'https://cdn/b.jpg',
      },
    ]);
    expect(item.images[0].id).toMatch(/^[A-Za-z0-9]{21}$/);
    expect(item.images[1].id).toMatch(/^[A-Za-z0-9]{21}$/);
    expect(item.x).toBe(10);
    expect(item.y).toBe(20);

    const images = await db().query.boardItemImages.findMany({
      where: (img, { eq }) => eq(img.boardItemId, item.id),
    });
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.displayOrder).sort()).toEqual([0, 1]);
  });

  it('handles an item with zero images without erroring', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );
    const item = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addBoardItem(tx, board.id, {
        sourceUrl: 'https://example.com/empty',
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
    expect(item.images).toEqual([]);
    const images = await db().query.boardItemImages.findMany({
      where: (img, { eq }) => eq(img.boardItemId, item.id),
    });
    expect(images).toEqual([]);
  });

  it('rolls back the entire batch when the board_items insert FK-fails', async () => {
    // FK to a non-existent board — board ownership check now fails first, but
    // the contract is the same: nothing persists.
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        addBoardItem(tx, 'no-such-board', {
          sourceUrl: 'https://example.com/atomic',
          title: 'Should not persist',
          brand: null,
          description: null,
          price: null,
          currency: null,
          details: [],
          images: [
            {
              kind: 'r2',
              key: 'items/user-test/x',
              sourceUrl: 'https://cdn/x.jpg',
            },
          ],
          x: 0,
          y: 0,
        }),
      ),
    ).rejects.toThrow();

    expect(await db().query.boardItemImages.findMany()).toEqual([]);
    expect(await db().query.boardItems.findMany()).toEqual([]);
  });

  it('rejects an r2 image key owned by a different user', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        addBoardItem(tx, board.id, {
          sourceUrl: 'https://example.com/cross-user',
          title: null,
          brand: null,
          description: null,
          price: null,
          currency: null,
          details: [],
          images: [
            {
              kind: 'r2',
              key: 'items/someone-else/abc',
              sourceUrl: 'https://cdn/a.jpg',
            },
          ],
          x: 0,
          y: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await db().query.boardItems.findMany()).toEqual([]);
  });
});
