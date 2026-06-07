import { trpc, type Board, type BoardItem } from '../lib/trpc'

export type { Board, BoardItem }

export function listBoards(): Promise<Board[]> {
  return trpc.boards.list.query()
}

export function createBoard(name: string): Promise<Board> {
  return trpc.boards.create.mutate({ name })
}

export function deleteBoard(id: string): Promise<{ ok: true }> {
  return trpc.boards.delete.mutate({ id })
}

export function renameBoard(id: string, name: string): Promise<Board> {
  return trpc.boards.rename.mutate({ id, name })
}

export function getItems(boardId: string): Promise<BoardItem[]> {
  return trpc.boards.getItems.query({ boardId })
}

export function patchBoardItem(
  id: string,
  patch: Partial<Pick<BoardItem, 'x' | 'y' | 'zIndex' | 'width' | 'height'>>,
): Promise<{ ok: true }> {
  return trpc.boards.patchItem.mutate({ id, patch })
}

export type AddItemBody = {
  sourceUrl: string
  title: string | null
  brand: string | null
  description: string | null
  price: number | null
  images: Array<{ r2Key: string; sourceUrl: string }>
  x: number
  y: number
}

export function addItem(boardId: string, item: AddItemBody): Promise<BoardItem> {
  return trpc.boards.addItem.mutate({ boardId, item })
}

export function deleteItem(id: string): Promise<{ ok: true }> {
  return trpc.boards.deleteItem.mutate({ id })
}
