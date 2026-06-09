import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import type { Scope } from '../../src/db/tx';
import { withTransaction } from '../../src/db/tx';
import {
  addBoardItem,
  purgeBoardItem,
  restoreBoardItem,
} from '../../src/services/boardItems';
import { createBoard } from '../../src/services/boards';

const USER_ID = 'user-test';
const SCOPE: Scope = { userId: USER_ID };

function db() {
  return createDb(env.DB);
}

async function wipe() {
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM item_images');
  await env.DB.exec('DELETE FROM items');
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

describe('purgeBoardItem', () => {
  beforeEach(wipe);

  it('deletes the placement, the orphan item row, and the R2 blob', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'Solo')),
    );
    const item = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addBoardItem(tx, board.id, {
        sourceUrl: 'https://example.com/solo',
        title: 'Solo',
        brand: null,
        description: null,
        price: null,
        currency: null,
        details: [],
        images: [
          {
            kind: 'r2',
            key: 'items/user-test/purge-1',
            sourceUrl: 'https://cdn/a.jpg',
          },
        ],
        x: 0,
        y: 0,
      }),
    );
    await env.IMAGES.put('items/user-test/purge-1', new Uint8Array([1, 2, 3]));

    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      purgeBoardItem(tx, item.id),
    );

    expect(
      await db().query.boardItems.findMany({
        where: (bi, { eq }) => eq(bi.boardId, board.id),
      }),
    ).toEqual([]);
    expect(await db().query.items.findMany()).toEqual([]);
    expect(await db().query.itemImages.findMany()).toEqual([]);
    expect(await env.IMAGES.get('items/user-test/purge-1')).toBeNull();
  });

  it('throws NOT_FOUND for an unknown placement id', async () => {
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        purgeBoardItem(tx, 'does-not-exist'),
      ),
    ).rejects.toThrow();
  });

  it('restoreBoardItem clears deletedAt so the placement lists again', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'Restorable')),
    );
    const item = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addBoardItem(tx, board.id, {
        sourceUrl: 'https://example.com/restore',
        title: 'R',
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
    await env.DB.prepare(`UPDATE board_items SET deleted_at = ?2 WHERE id = ?1`)
      .bind(item.id, 100)
      .run();

    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      restoreBoardItem(tx, item.id),
    );

    const [row] = await db().query.boardItems.findMany({
      where: (bi, { eq }) => eq(bi.id, item.id),
    });
    expect(row.deletedAt).toBeNull();
  });
});
