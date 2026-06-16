import { create } from 'zustand';
import { getItem, setItem } from '../lib/storage';

const KEY_LEFT = 'rail.leftWidth';
const KEY_RIGHT = 'rail.rightWidth';
const KEY_LEFT_COLLAPSED = 'rail.leftCollapsed';
const DEFAULT_LEFT = 260;
const DEFAULT_RIGHT = 380;

export const railLimits = { min: 200, max: 600 } as const;

function read(key: string, fallback: number): number {
  const raw = getItem(key);
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(railLimits.min, Math.min(railLimits.max, n));
}

type RailsStore = {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
  toggleLeftCollapsed: () => void;
};

export const useRailsStore = create<RailsStore>((set) => ({
  leftWidth: read(KEY_LEFT, DEFAULT_LEFT),
  rightWidth: read(KEY_RIGHT, DEFAULT_RIGHT),
  leftCollapsed: getItem(KEY_LEFT_COLLAPSED) === '1',
  setLeftWidth(w) {
    setItem(KEY_LEFT, String(w));
    set({ leftWidth: w });
  },
  setRightWidth(w) {
    setItem(KEY_RIGHT, String(w));
    set({ rightWidth: w });
  },
  toggleLeftCollapsed() {
    set((s) => {
      const next = !s.leftCollapsed;
      setItem(KEY_LEFT_COLLAPSED, next ? '1' : null);
      return { leftCollapsed: next };
    });
  },
}));
