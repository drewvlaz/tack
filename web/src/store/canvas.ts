import { create } from 'zustand';

type ZIndexedItem = { id: string; zIndex: number };

type CanvasStore = {
  zIndices: Record<string, number>;
  bringToFront: (
    id: string,
    items: ReadonlyArray<ZIndexedItem>,
  ) => number | null;
};

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  zIndices: {},
  bringToFront: (id, items) => {
    const { zIndices } = get();
    const self = items.find((i) => i.id === id);
    if (!self) {
      return null;
    }
    const currentZ = zIndices[id] ?? self.zIndex;
    const othersMax = items.reduce(
      (acc, i) =>
        i.id === id ? acc : Math.max(acc, zIndices[i.id] ?? i.zIndex),
      0,
    );
    if (currentZ > othersMax) {
      return null;
    }
    const newZ = othersMax + 1;
    set({ zIndices: { ...zIndices, [id]: newZ } });
    return newZ;
  },
}));
