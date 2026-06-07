import { create } from 'zustand';

type CanvasStore = {
  selectedId: string | null;
  zIndices: Record<string, number>;
  nextZ: number;
  setSelectedId: (id: string | null) => void;
  bringToFront: (id: string) => void;
};

export const useCanvasStore = create<CanvasStore>((set) => ({
  selectedId: null,
  zIndices: {},
  nextZ: 1,
  setSelectedId: (selectedId) => set({ selectedId }),
  bringToFront: (id) =>
    set((s) => ({
      zIndices: { ...s.zIndices, [id]: s.nextZ },
      nextZ: s.nextZ + 1,
    })),
}));
