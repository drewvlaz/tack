import { create } from 'zustand';

const DEFAULT_DURATION_MS = 4000;

export type ToastKind = 'info' | 'success' | 'error';

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  // ms before auto-dismiss. 0 = persistent (must be dismissed explicitly).
  duration: number;
};

export type ToastInput = {
  kind?: ToastKind;
  message: string;
  duration?: number;
};

type ToastsStore = {
  toasts: Toast[];
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

let counter = 0;

export const useToastsStore = create<ToastsStore>((set) => ({
  toasts: [],
  show: ({ kind = 'info', message, duration = DEFAULT_DURATION_MS }) => {
    const id = `toast-${++counter}`;
    set((s) => ({
      toasts: [...s.toasts, { id, kind, message, duration }],
    }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
