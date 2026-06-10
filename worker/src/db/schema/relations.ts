import { relations } from 'drizzle-orm';
import { boardInvites } from './boardInvites';
import { boardItemImages } from './boardItemImages';
import { boardItems } from './boardItems';
import { boardMembers } from './boardMembers';
import { boards } from './boards';
import { sessions } from './sessions';
import { users } from './users';

export const usersRelations = relations(users, ({ many }) => ({
  boards: many(boards),
  sessions: many(sessions),
  memberships: many(boardMembers),
  // No items relation — items folded into board_items in migration 0009.
  // `boardItems.addedBy` is informational attribution, not a strong link.
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

export const boardItemsRelations = relations(boardItems, ({ one, many }) => ({
  board: one(boards, { fields: [boardItems.boardId], references: [boards.id] }),
  addedByUser: one(users, {
    fields: [boardItems.addedBy],
    references: [users.id],
  }),
  images: many(boardItemImages),
}));

export const boardItemImagesRelations = relations(
  boardItemImages,
  ({ one }) => ({
    boardItem: one(boardItems, {
      fields: [boardItemImages.boardItemId],
      references: [boardItems.id],
    }),
  }),
);
