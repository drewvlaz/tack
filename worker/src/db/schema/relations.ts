import { relations } from 'drizzle-orm';
import { boardInvites } from './boardInvites';
import { boardItems } from './boardItems';
import { boardMembers } from './boardMembers';
import { boards } from './boards';
import { itemImages } from './itemImages';
import { items } from './items';
import { sessions } from './sessions';
import { users } from './users';

export const usersRelations = relations(users, ({ many }) => ({
  boards: many(boards),
  items: many(items),
  sessions: many(sessions),
  memberships: many(boardMembers),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const boardsRelations = relations(boards, ({ many, one }) => ({
  boardItems: many(boardItems),
  owner: one(users, { fields: [boards.ownerId], references: [users.id] }),
  members: many(boardMembers),
  invites: many(boardInvites),
}));

export const boardMembersRelations = relations(boardMembers, ({ one }) => ({
  board: one(boards, {
    fields: [boardMembers.boardId],
    references: [boards.id],
  }),
  user: one(users, { fields: [boardMembers.userId], references: [users.id] }),
  inviter: one(users, {
    fields: [boardMembers.invitedBy],
    references: [users.id],
  }),
}));

export const boardInvitesRelations = relations(boardInvites, ({ one }) => ({
  board: one(boards, {
    fields: [boardInvites.boardId],
    references: [boards.id],
  }),
  creator: one(users, {
    fields: [boardInvites.createdBy],
    references: [users.id],
  }),
  redeemer: one(users, {
    fields: [boardInvites.redeemedBy],
    references: [users.id],
  }),
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
