import { api } from './client'
import type { BoardItem } from './types'

export function getItems(boardId: string): Promise<BoardItem[]> {
  return api.get(`api/boards/${boardId}/items`).json<BoardItem[]>()
}

export function patchBoardItem(id: string, patch: Partial<Pick<BoardItem, 'x' | 'y' | 'zIndex' | 'width' | 'height'>>): Promise<void> {
  return api.patch(`api/board-items/${id}`, { json: patch }).json<void>()
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

export function addItem(boardId: string, body: AddItemBody): Promise<BoardItem> {
  return api.post(`api/boards/${boardId}/items`, { json: body }).json<BoardItem>()
}

export function deleteItem(id: string): Promise<void> {
  return api.delete(`api/board-items/${id}`).json<void>()
}
