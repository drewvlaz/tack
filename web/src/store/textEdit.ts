import { create } from 'zustand';

// Tracks which text item should mount in edit mode — used by the spawn
// affordances ('T' hotkey + TopBar button) to flag a freshly-created item
// so its TextCard opens its textarea on mount, ready to type.
//
// Each TextCard reads `pendingEditId` from this store. When its own id
// matches, it consumes (clears the flag) and starts in edit mode. Setting
// the flag from outside is a request; the card decides whether to honor it
// the next time it mounts. Lives outside the query cache because it's
// purely interaction state.
type TextEditStore = {
  pendingEditId: string | null;
  request: (id: string) => void;
  consume: (id: string) => void;
};

export const useTextEditStore = create<TextEditStore>((set) => ({
  pendingEditId: null,
  request: (id) => set({ pendingEditId: id }),
  consume: (id) =>
    set((s) => (s.pendingEditId === id ? { pendingEditId: null } : s)),
}));
