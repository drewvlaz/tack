import { create } from 'zustand';
import { getItem, setItem } from '../lib/storage';

const STORAGE_KEY = 'activeBoardId';

type BoardsStore = {
  activeBoardId: string | null;
  setActiveBoardId: (id: string | null) => void;
};

export const useBoardsStore = create<BoardsStore>((set) => ({
  activeBoardId: getItem(STORAGE_KEY),
  setActiveBoardId(activeBoardId) {
    setItem(STORAGE_KEY, activeBoardId);
    set({ activeBoardId });
  },
}));
