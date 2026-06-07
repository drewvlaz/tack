import { create } from 'zustand'
import { type CanvasItem } from '../hooks/useBoardItems'

type CanvasStore = {
  items: CanvasItem[]
  selectedId: string | null
  zIndices: Record<string, number>
  nextZ: number
  setItems: (items: CanvasItem[]) => void
  setSelectedId: (id: string | null) => void
  bringToFront: (id: string) => void
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  items: [],
  selectedId: null,
  zIndices: {},
  nextZ: 1,
  setItems: (items) => set({ items }),
  setSelectedId: (selectedId) => set({ selectedId }),
  bringToFront: (id) =>
    set((s) => ({
      zIndices: { ...s.zIndices, [id]: s.nextZ },
      nextZ: s.nextZ + 1,
    })),
}))
