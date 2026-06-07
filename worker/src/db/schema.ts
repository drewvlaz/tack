import { relations } from 'drizzle-orm';
import {
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  sourceUrl: text('source_url').notNull(),
  title: text('title'),
  brand: text('brand'),
  description: text('description'),
  price: real('price'),
  currency: text('currency').notNull().default('USD'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const itemImages = sqliteTable('item_images', {
  id: text('id').primaryKey(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  sourceUrl: text('source_url'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const boardItems = sqliteTable(
  'board_items',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    x: real('x').notNull().default(0),
    y: real('y').notNull().default(0),
    width: real('width').notNull().default(220),
    height: real('height').notNull().default(400),
    zIndex: integer('z_index').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [unique().on(t.boardId, t.itemId)],
);

export const boardsRelations = relations(boards, ({ many }) => ({
  boardItems: many(boardItems),
}));

export const itemsRelations = relations(items, ({ many }) => ({
  images: many(itemImages),
}));

export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, { fields: [itemImages.itemId], references: [items.id] }),
}));

export const boardItemsRelations = relations(boardItems, ({ one }) => ({
  board: one(boards, { fields: [boardItems.boardId], references: [boards.id] }),
  item: one(items, { fields: [boardItems.itemId], references: [items.id] }),
}));
