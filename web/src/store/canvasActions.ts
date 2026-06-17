import { create } from 'zustand';

// One-way bridge for screen-space chrome (AppUI's TopBar) to invoke imperative
// canvas-scoped actions that need access to pan/zoom motion values. The
// canvas registers its current handlers on mount; null when no board is
// active or the canvas hasn't rendered. Add new fields as more screen-space
// triggers need to talk to the canvas (avoids threading callbacks through
// the boards-sidebar layer).
type CanvasActionsStore = {
  spawnText: (() => void) | null;
  setSpawnText: (fn: (() => void) | null) => void;
};

export const useCanvasActionsStore = create<CanvasActionsStore>((set) => ({
  spawnText: null,
  setSpawnText: (fn) => set({ spawnText: fn }),
}));
