import type { AppRouter } from '@tack/worker/router';
import type { inferRouterInputs } from '@trpc/server';
import { trpc, type Board, type BoardItem } from '../lib/trpc';

export type { Board, BoardItem };

type RouterInputs = inferRouterInputs<AppRouter>;
export type AddItemBody = RouterInputs['boards']['addItem']['item'];
export type AddTextItemBody = RouterInputs['boards']['addTextItem']['item'];
export type TextItemPatch = RouterInputs['boards']['patchTextItem']['patch'];

export function listBoards(): Promise<Board[]> {
  return trpc.boards.list.query();
}

export function createBoard(name: string): Promise<Board> {
  return trpc.boards.create.mutate({ name });
}

export function deleteBoard(id: string): Promise<{ ok: true }> {
  return trpc.boards.delete.mutate({ id });
}

export function renameBoard(id: string, name: string): Promise<Board> {
  return trpc.boards.rename.mutate({ id, name });
}

export function getItems(boardId: string): Promise<BoardItem[]> {
  return trpc.boards.getItems.query({ boardId });
}

export function addItem(
  boardId: string,
  item: AddItemBody,
): Promise<BoardItem> {
  return trpc.boards.addItem.mutate({ boardId, item });
}

export function addTextItem(
  boardId: string,
  item: AddTextItemBody,
): Promise<BoardItem> {
  return trpc.boards.addTextItem.mutate({ boardId, item });
}

export type ItemPatch = Partial<
  Pick<BoardItem, 'x' | 'y' | 'zIndex' | 'width' | 'height'>
>;

export function patchBoardItems(
  patches: Array<{ id: string; patch: ItemPatch }>,
): Promise<{ ok: true }> {
  return trpc.boards.patchItemsMany.mutate({ patches });
}

export function patchTextItem(
  id: string,
  patch: TextItemPatch,
): Promise<{ ok: true }> {
  return trpc.boards.patchTextItem.mutate({ id, patch });
}

export function deleteItems(ids: string[]): Promise<{ ok: true }> {
  return trpc.boards.deleteItemsMany.mutate({ ids });
}

export function listTrash(boardId: string): Promise<BoardItem[]> {
  return trpc.boards.listTrash.query({ boardId });
}

export function restoreItem(id: string): Promise<{ ok: true }> {
  return trpc.boards.restoreItem.mutate({ id });
}

export function purgeItem(id: string): Promise<{ ok: true }> {
  return trpc.boards.purgeItem.mutate({ id });
}

export function emptyTrash(boardId: string): Promise<{ ok: true }> {
  return trpc.boards.emptyTrash.mutate({ boardId });
}

// ---------- collab: invites + membership ----------

// Role granted at invite redemption. Owner is implicit via boards.ownerId
// and is never an invite outcome, hence the narrower type here.
export type InviteRole = 'editor' | 'viewer';

export function inviteToBoard(
  boardId: string,
  role: InviteRole = 'editor',
): Promise<{ token: string; expiresAt: number; role: InviteRole }> {
  return trpc.boards.invite.mutate({ boardId, role });
}

export function acceptInvite(token: string): Promise<{ boardId: string }> {
  return trpc.boards.acceptInvite.mutate({ token });
}

export type BoardMember = {
  userId: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: number;
};

export function listMembers(boardId: string): Promise<BoardMember[]> {
  return trpc.boards.listMembers.query({ boardId });
}

export function removeMember(
  boardId: string,
  userId: string,
): Promise<{ ok: true }> {
  return trpc.boards.removeMember.mutate({ boardId, userId });
}

export function updateMemberRole(
  boardId: string,
  userId: string,
  role: InviteRole,
): Promise<{ ok: true }> {
  return trpc.boards.updateMemberRole.mutate({ boardId, userId, role });
}

export function leaveBoard(boardId: string): Promise<{ ok: true }> {
  return trpc.boards.leave.mutate({ boardId });
}
