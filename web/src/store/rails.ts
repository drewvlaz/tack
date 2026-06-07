import { create } from 'zustand';

const KEY_LEFT = 'rail.leftWidth';
const KEY_RIGHT = 'rail.rightWidth';
const DEFAULT_LEFT = 260;
const DEFAULT_RIGHT = 380;

export const railLimits = { min: 200, max: 600 } as const;

function read(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(railLimits.min, Math.min(railLimits.max, n));
  } catch {
    return fallback;
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore storage failures
  }
}

type RailsStore = {
  leftWidth: number;
  rightWidth: number;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
};

export const useRailsStore = create<RailsStore>((set) => ({
  leftWidth: read(KEY_LEFT, DEFAULT_LEFT),
  rightWidth: read(KEY_RIGHT, DEFAULT_RIGHT),
  setLeftWidth(w) {
    write(KEY_LEFT, w);
    set({ leftWidth: w });
  },
  setRightWidth(w) {
    write(KEY_RIGHT, w);
    set({ rightWidth: w });
  },
}));
