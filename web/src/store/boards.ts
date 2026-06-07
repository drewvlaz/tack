import { create } from 'zustand'

const STORAGE_KEY = 'activeBoardId'

function readInitial(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

type BoardsStore = {
  activeBoardId: string | null
  setActiveBoardId: (id: string | null) => void
}

export const useBoardsStore = create<BoardsStore>((set) => ({
  activeBoardId: readInitial(),
  setActiveBoardId(activeBoardId) {
    try {
      if (activeBoardId) localStorage.setItem(STORAGE_KEY, activeBoardId)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore storage failures
    }
    set({ activeBoardId })
  },
}))
