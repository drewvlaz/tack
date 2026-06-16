import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import type { Scope } from '../../src/db/tx';
import { ServiceCtx, withTransaction } from '../../src/db/tx';
import {
  addTextItem,
  deleteBoardItem,
  listBoardItems,
  patchTextItem,
} from '../../src/services/boardItems';
import { createBoard } from '../../src/services/boards';

const USER_ID = 'user-text';
const SCOPE: Scope = { userId: USER_ID };

function db() {
  return createDb(env.DB);
}

function ctx(): ServiceCtx {
  return new ServiceCtx(db(), env.IMAGES, SCOPE);
}

async function wipe() {
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM boards');
  await env.DB.exec('DELETE FROM sessions');
  await env.DB.exec('DELETE FROM users');
  await db().insert(schema.users).values({
    id: USER_ID,
    email: 'text@local',
    passwordHash: 'unused-in-tests',
    createdAt: 0,
    updatedAt: 0,
  });
}

describe('text-kind board items', () => {
  beforeEach(async () => {
    await wipe();
  });

  it('addTextItem inserts a text row; listBoardItems surfaces it with kind=text', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );

    const created = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTextItem(tx, board.id, {
        content: 'hello canvas',
        fontSize: 18,
        weight: 600,
        colorToken: 'fg',
        align: 'center',
        x: 5,
        y: 7,
      }),
    );
    expect(created.kind).toBe('text');

    const rows = await listBoardItems(ctx(), board.id);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row.kind !== 'text') {
      throw new Error('expected text');
    }
    expect(row.id).toBe(created.id);
    expect(row.textContent).toBe('hello canvas');
    expect(row.textFontSize).toBe(18);
    expect(row.textWeight).toBe(600);
    expect(row.textColorToken).toBe('fg');
    expect(row.textAlign).toBe('center');
    expect(row.x).toBe(5);
    expect(row.y).toBe(7);
  });

  it('patchTextItem updates content + style; non-listed fields untouched', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );
    const created = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTextItem(tx, board.id, {
        content: 'before',
        fontSize: 16,
        weight: 400,
        x: 0,
        y: 0,
      }),
    );

    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      patchTextItem(tx, created.id, { content: 'after', align: 'right' }),
    );

    const row = (await listBoardItems(ctx(), board.id))[0];
    if (row.kind !== 'text') {
      throw new Error('expected text');
    }
    expect(row.textContent).toBe('after');
    expect(row.textAlign).toBe('right');
    // Untouched values survived the patch.
    expect(row.textFontSize).toBe(16);
    expect(row.textWeight).toBe(400);
  });

  it('patchTextItem rejects a product row with BAD_REQUEST', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );
    // Insert a product row directly so we don't depend on addBoardItem here.
    const productId = 'prod-1';
    const now = Math.floor(Date.now() / 1000);
    await db().insert(schema.boardItems).values({
      id: productId,
      boardId: board.id,
      addedBy: USER_ID,
      kind: 'product',
      sourceUrl: 'https://example.com/p',
      title: 'P',
      x: 0,
      y: 0,
      width: 220,
      height: 400,
      zIndex: 1,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        patchTextItem(tx, productId, { content: 'nope' }),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('deleteBoardItem soft-deletes a text row (verb reuse)', async () => {
    const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      Promise.resolve(createBoard(tx, 'B')),
    );
    const created = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTextItem(tx, board.id, { content: 'gone', x: 0, y: 0 }),
    );

    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      deleteBoardItem(tx, created.id),
    );

    expect(await listBoardItems(ctx(), board.id)).toEqual([]);
  });
});
