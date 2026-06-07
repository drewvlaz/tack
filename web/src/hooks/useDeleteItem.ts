import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteItem } from '../api/boards'
import type { BoardItem } from '../lib/trpc'

export function useDeleteItem(boardId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['boards', boardId, 'items']

  return useMutation({
    mutationFn: (id: string) => deleteItem(id),

    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<BoardItem[]>(queryKey)
      queryClient.setQueryData<BoardItem[]>(queryKey, (old = []) => old.filter((i) => i.id !== id))
      return { previous }
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous)
    },
  })
}
