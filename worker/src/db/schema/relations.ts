import { relations } from 'drizzle-orm';
import { boardItems } from './boardItems';
import { boards } from './boards';
import { itemImages } from './itemImages';
import { items } from './items';
import { sessions } from './sessions';
import { users } from './users';

export const usersRelations = relations(users, ({ many }) => ({
  boards: many(boards),
  items: many(items),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const boardsRelations = relations(boards, ({ many, one }) => ({
  boardItems: many(boardItems),
  owner: one(users, { fields: [boards.ownerId], references: [users.id] }),
}));

export const itemsRelations = relations(items, ({ many, one }) => ({
  images: many(itemImages),
  owner: one(users, { fields: [items.ownerId], references: [users.id] }),
}));

export const itemImagesRelations = relations(itemImages, ({ one }) => ({
  item: one(items, { fields: [itemImages.itemId], references: [items.id] }),
}));

export const boardItemsRelations = relations(boardItems, ({ one }) => ({
  board: one(boards, { fields: [boardItems.boardId], references: [boards.id] }),
  item: one(items, { fields: [boardItems.itemId], references: [items.id] }),
}));
