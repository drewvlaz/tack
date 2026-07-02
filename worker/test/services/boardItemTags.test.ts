import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import type { Scope } from '../../src/db/tx';
import { ServiceCtx, withTransaction } from '../../src/db/tx';
import {
  addTags,
  listBoardTags,
  normalizeTagName,
  removeTags,
} from '../../src/services/boardItemTags';
import {
  addTextItem,
  deleteBoardItem,
  listBoardItems,
} from '../../src/services/boardItems';
import { createBoard } from '../../src/services/boards';

const USER_ID = 'user-tag';
const SCOPE: Scope = { userId: USER_ID };

function db() {
  return createDb(env.DB);
}
function ctx(): ServiceCtx {
  return new ServiceCtx(db(), env.IMAGES, SCOPE);
}

async function wipe() {
  await env.DB.exec('DELETE FROM board_item_tags');
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM boards');
  await env.DB.exec('DELETE FROM sessions');
  await env.DB.exec('DELETE FROM users');
  await db().insert(schema.users).values({
    id: USER_ID,
    email: 'tag@local',
    passwordHash: 'unused',
    createdAt: 0,
    updatedAt: 0,
  });
}

async function makeBoardWithItem(): Promise<{
  boardId: string;
  itemId: string;
}> {
  const board = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
    Promise.resolve(createBoard(tx, 'B')),
  );
  const item = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
    addTextItem(tx, board.id, { content: 't', x: 0, y: 0 }),
  );
  return { boardId: board.id, itemId: item.id };
}

describe('board item tags', () => {
  beforeEach(wipe);

  it('normalizeTagName trims, collapses whitespace, lowercases', () => {
    expect(normalizeTagName('  Summer  ')).toBe('summer');
    expect(normalizeTagName('SeAsOn: Summer')).toBe('season: summer');
    expect(normalizeTagName('  multi   space ')).toBe('multi space');
  });

  it('addTags hydrates into listBoardItems; idempotent on conflict', async () => {
    const { boardId, itemId } = await makeBoardWithItem();
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId], ['Summer', 'beige', '  summer ']),
    );
    // Second call with overlap — should not duplicate.
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId], ['beige', 'gorpcore']),
    );

    const rows = await listBoardItems(ctx(), boardId);
    expect(rows).toHaveLength(1);
    expect(rows[0].tags).toEqual(['beige', 'gorpcore', 'summer']);
  });

  it('removeTags drops specific names only', async () => {
    const { boardId, itemId } = await makeBoardWithItem();
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId], ['summer', 'beige', 'gorpcore']),
    );
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      removeTags(tx, [itemId], ['beige']),
    );
    const rows = await listBoardItems(ctx(), boardId);
    expect(rows[0].tags).toEqual(['gorpcore', 'summer']);
  });

  it('listBoardTags returns distinct names with counts', async () => {
    const { boardId, itemId } = await makeBoardWithItem();
    const second = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTextItem(tx, boardId, { content: 't2', x: 0, y: 0 }),
    );
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId, second.id], ['summer']),
    );
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId], ['beige']),
    );
    const tags = await listBoardTags(ctx(), boardId);
    const byName = Object.fromEntries(tags.map((t) => [t.name, t.count]));
    expect(byName).toEqual({ summer: 2, beige: 1 });
  });

  it('soft-delete: listBoardTags excludes tags on trashed placements', async () => {
    const { boardId, itemId } = await makeBoardWithItem();
    const second = await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTextItem(tx, boardId, { content: 't2', x: 0, y: 0 }),
    );
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId, second.id], ['summer']),
    );
    // Sanity: both active.
    expect(await listBoardTags(ctx(), boardId)).toEqual([
      { name: 'summer', count: 2 },
    ]);
    // Trash one — count should drop, not stay at 2.
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      deleteBoardItem(tx, itemId),
    );
    expect(await listBoardTags(ctx(), boardId)).toEqual([
      { name: 'summer', count: 1 },
    ]);
  });

  it('addTags rejects a trashed placement (NOT_FOUND)', async () => {
    const { itemId } = await makeBoardWithItem();
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      deleteBoardItem(tx, itemId),
    );
    await expect(
      withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
        addTags(tx, [itemId], ['summer']),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('cascade delete: tags vanish when the placement is hard-deleted', async () => {
    const { boardId, itemId } = await makeBoardWithItem();
    await withTransaction(db(), env.IMAGES, SCOPE, (tx) =>
      addTags(tx, [itemId], ['summer']),
    );
    await env.DB.prepare('DELETE FROM board_items WHERE id = ?')
      .bind(itemId)
      .run();
    expect(await listBoardTags(ctx(), boardId)).toEqual([]);
  });

  it('cross-user access: a non-member cannot tag', async () => {
    const { itemId } = await makeBoardWithItem();
    const OTHER: Scope = { userId: 'other-user' };
    await db().insert(schema.users).values({
      id: OTHER.userId,
      email: 'other@local',
      passwordHash: 'unused',
      createdAt: 0,
      updatedAt: 0,
    });
    await expect(
      withTransaction(db(), env.IMAGES, OTHER, (tx) =>
        addTags(tx, [itemId], ['hostile']),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
