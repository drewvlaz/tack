import type { AppRouter } from '@fashion-mood/worker/router';
import type { inferRouterInputs } from '@trpc/server';
import { trpc, type Board, type BoardItem } from '../lib/trpc';

export type { Board, BoardItem };

type RouterInputs = inferRouterInputs<AppRouter>;
export type AddItemBody = RouterInputs['boards']['addItem']['item'];

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

export function patchBoardItem(
  id: string,
  patch: Partial<Pick<BoardItem, 'x' | 'y' | 'zIndex' | 'width' | 'height'>>,
): Promise<{ ok: true }> {
  return trpc.boards.patchItem.mutate({ id, patch });
}

export function addItem(
  boardId: string,
  item: AddItemBody,
): Promise<BoardItem> {
  return trpc.boards.addItem.mutate({ boardId, item });
}

export function deleteItem(id: string): Promise<{ ok: true }> {
  return trpc.boards.deleteItem.mutate({ id });
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
