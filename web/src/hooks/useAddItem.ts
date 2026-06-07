import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addItem } from '../api/boards'
import { parseUrl } from '../api/parse'
import type { BoardItem } from '../lib/trpc'

const SKELETON_PREFIX = '__skeleton__'

type AddItemArgs = {
  url: string
  boardId: string
  x: number
  y: number
}

export function useAddItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ url, boardId, x, y }: AddItemArgs) => {
      const parsed = await parseUrl(url)
      return addItem(boardId, {
        sourceUrl: url,
        title: parsed.title,
        brand: parsed.brand,
        description: parsed.description,
        price: parsed.price,
        images: parsed.images,
        x,
        y,
      })
    },

    onMutate: async ({ url, boardId, x, y }: AddItemArgs) => {
      const queryKey = ['boards', boardId, 'items']
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<BoardItem[]>(queryKey)

      const skeleton: BoardItem = {
        id: `${SKELETON_PREFIX}${Date.now()}`,
        itemId: '',
        title: null,
        brand: null,
        description: null,
        price: null,
        currency: 'USD',
        imageUrls: [],
        sourceUrl: url,
        updatedAt: Math.floor(Date.now() / 1000),
        x,
        y,
        width: 220,
        height: 280,
        zIndex: 0,
      }

      queryClient.setQueryData<BoardItem[]>(queryKey, (old = []) => [...old, skeleton])

      return { previous, skeletonId: skeleton.id, boardId }
    },

    onSuccess: (newItem, _vars, ctx) => {
      if (!ctx) return
      const queryKey = ['boards', ctx.boardId, 'items']
      queryClient.setQueryData<BoardItem[]>(queryKey, (old = []) =>
        old.map((item) => (item.id === ctx.skeletonId ? newItem : item)),
      )
    },

    onError: (_err, _vars, ctx) => {
      if (!ctx) return
      queryClient.setQueryData(['boards', ctx.boardId, 'items'], ctx.previous)
    },
  })
}

export function isSkeleton(id: string) {
  return id.startsWith(SKELETON_PREFIX)
}
