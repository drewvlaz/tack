import { useMutation } from '@tanstack/react-query'
import { patchBoardItem } from '../api/boards'

export function useSyncPosition() {
  return useMutation({
    mutationFn: ({ id, x, y }: { id: string; x: number; y: number }) =>
      patchBoardItem(id, { x, y }),
  })
}
