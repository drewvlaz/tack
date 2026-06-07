import { relations } from 'drizzle-orm';
import { boardItems } from './boardItems';
import { boards } from './boards';
import { itemImages } from './itemImages';
import { items } from './items';

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
