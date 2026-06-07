import { useEffect, useState } from 'react'
import { apiFetch } from '../api/client'

export type CanvasItem = {
  id: string
  itemId: string
  title: string | null
  price: number | null
  currency: string
  imageUrl: string | null
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export function useBoardItems(boardId: string) {
  const [items, setItems] = useState<CanvasItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<CanvasItem[]>(`/api/boards/${boardId}/items`)
      .then(setItems)
      .finally(() => setLoading(false))
  }, [boardId])

  return { items, loading }
}
