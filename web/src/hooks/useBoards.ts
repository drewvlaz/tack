import { useQuery } from '@tanstack/react-query'
import { listBoards } from '../api/boards'
import type { Board } from '../lib/trpc'

export type { Board }

export const BOARDS_QUERY_KEY = ['boards'] as const

export function useBoards() {
  const { data, isLoading, error } = useQuery({
    queryKey: BOARDS_QUERY_KEY,
    queryFn: () => listBoards(),
    staleTime: Infinity,
  })

  return { boards: data ?? [], isLoading, error }
}
