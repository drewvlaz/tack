import {
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { boards } from './boards';
import { items } from './items';

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
