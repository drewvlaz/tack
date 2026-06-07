import { trpc, type BoardItem } from '../lib/trpc'

export type { BoardItem }

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
  price: number | null
  imageUrl: string | null
  x: number
  y: number
}

export function addItem(boardId: string, item: AddItemBody): Promise<BoardItem> {
  return trpc.boards.addItem.mutate({ boardId, item })
}

export function deleteItem(id: string): Promise<{ ok: true }> {
  return trpc.boards.deleteItem.mutate({ id })
}
