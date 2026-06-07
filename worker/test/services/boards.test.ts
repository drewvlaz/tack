import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client';
import * as schema from '../../src/db/schema';
import {
  addBoardItem,
  createBoard,
  deleteBoard,
  listBoardItems,
  listBoards,
} from '../../src/services/boards';

function db() {
  return createDb(env.DB);
}

async function wipe() {
  // FK cascades from boards → board_items, items → item_images, so order matters.
  await env.DB.exec('DELETE FROM board_items');
  await env.DB.exec('DELETE FROM item_images');
  await env.DB.exec('DELETE FROM items');
  await env.DB.exec('DELETE FROM boards');
}

describe('boards service', () => {
  beforeEach(async () => {
    await wipe();
  });

  it('listBoards returns empty when no boards exist', async () => {
    expect(await listBoards(db())).toEqual([]);
  });

  it('createBoard inserts and returns a Board', async () => {
    const created = await createBoard(db(), 'My Moodboard');
    expect(created.name).toBe('My Moodboard');
    expect(created.id).toMatch(/^[A-Za-z0-9]{21}$/); // nanoid alphanumeric, length 21
    expect(typeof created.createdAt).toBe('number');
  });

  it('listBoards returns boards ordered by createdAt ascending', async () => {
    const first = await createBoard(db(), 'First');
    // Ensure non-equal timestamps even at second-precision.
    await env.DB.prepare('UPDATE boards SET created_at = 100 WHERE id = ?1')
      .bind(first.id)
      .run();
    const second = await createBoard(db(), 'Second');
    await env.DB.prepare('UPDATE boards SET created_at = 200 WHERE id = ?1')
      .bind(second.id)
      .run();

    const boards = await listBoards(db());
    expect(boards.map((b) => b.name)).toEqual(['First', 'Second']);
  });

  it('deleteBoard soft-deletes the board and its placements', async () => {
    const board = await createBoard(db(), 'To delete');
    await addBoardItem(db(), board.id, {
      sourceUrl: 'https://example.com/p',
      title: 'Test',
      brand: null,
      description: null,
      price: null,
      details: [],
      images: [],
      x: 0,
      y: 0,
    });
    expect(await listBoardItems(db(), board.id)).toHaveLength(1);

    await deleteBoard(db(), board.id);

    expect(await listBoards(db())).toEqual([]);
    expect(await listBoardItems(db(), board.id)).toEqual([]);
    // Soft-delete: rows remain but are marked with deletedAt.
    const placements = await db().query.boardItems.findMany({
      where: (bi, { eq }) => eq(bi.boardId, board.id),
    });
    expect(placements).toHaveLength(1);
    expect(placements[0].deletedAt).not.toBeNull();
  });
});

describe('addBoardItem', () => {
  beforeEach(async () => {
    await wipe();
  });

  it('inserts item, images, and a placement; returns hydrated BoardItem', async () => {
    const board = await createBoard(db(), 'B');
    const item = await addBoardItem(db(), board.id, {
      sourceUrl: 'https://lemaire.fr/x',
      title: 'Blouson',
      brand: 'LEMAIRE',
      description: 'A soft leather blouson.',
      price: 2450,
      details: [
        { label: 'Materials', value: '100% lambskin' },
        { label: 'Care', value: 'Specialist leather clean' },
      ],
      images: [
        { kind: 'r2', key: 'items/abc', sourceUrl: 'https://cdn/a.jpg' },
        { kind: 'r2', key: 'items/def', sourceUrl: 'https://cdn/b.jpg' },
      ],
      x: 10,
      y: 20,
    });

    expect(item.title).toBe('Blouson');
    expect(item.brand).toBe('LEMAIRE');
    expect(item.details).toEqual([
      { label: 'Materials', value: '100% lambskin' },
      { label: 'Care', value: 'Specialist leather clean' },
    ]);
    expect(item.images.map((img) => img.url)).toEqual([
      '/api/images/items/abc',
      '/api/images/items/def',
    ]);
    expect(item.images[0].id).toMatch(/^[A-Za-z0-9]{21}$/);
    expect(item.images[1].id).toMatch(/^[A-Za-z0-9]{21}$/);
    expect(item.x).toBe(10);
    expect(item.y).toBe(20);

    const images = await db().query.itemImages.findMany({
      where: (img, { eq }) => eq(img.itemId, item.itemId),
    });
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.displayOrder).sort()).toEqual([0, 1]);
  });

  it('handles an item with zero images without erroring', async () => {
    const board = await createBoard(db(), 'B');
    const item = await addBoardItem(db(), board.id, {
      sourceUrl: 'https://example.com/empty',
      title: null,
      brand: null,
      description: null,
      price: null,
      details: [],
      images: [],
      x: 0,
      y: 0,
    });
    expect(item.images).toEqual([]);
    const images = await db().query.itemImages.findMany({
      where: (img, { eq }) => eq(img.itemId, item.itemId),
    });
    expect(images).toEqual([]);
  });

  it('rolls back the entire batch when the board_items insert FK-fails', async () => {
    // Pass a board_id that does not exist; board_items has FK to boards.
    // If db.batch is atomic, the items + item_images inserts must roll back.
    await expect(
      addBoardItem(db(), 'no-such-board', {
        sourceUrl: 'https://example.com/atomic',
        title: 'Should not persist',
        brand: null,
        description: null,
        price: null,
        details: [],
        images: [
          { kind: 'r2', key: 'items/x', sourceUrl: 'https://cdn/x.jpg' },
        ],
        x: 0,
        y: 0,
      }),
    ).rejects.toThrow();

    expect(await db().query.items.findMany()).toEqual([]);
    expect(await db().query.itemImages.findMany()).toEqual([]);
    expect(await db().query.boardItems.findMany()).toEqual([]);
  });
});

// Silence unused-import warning for the schema barrel — Drizzle picks up tables at runtime
// via the relational query API, but TypeScript flags the import as unused.
void schema;
