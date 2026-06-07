import { useMutation } from '@tanstack/react-query'
import { patchBoardItem } from '../api/boards'

type Patch = { x?: number; y?: number; width?: number; height?: number }

export function useSyncPosition() {
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Patch) =>
      patchBoardItem(id, patch),
  })
}
