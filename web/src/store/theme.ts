import { create } from 'zustand';

function resolveInitialTheme(): boolean {
  const stored = localStorage.getItem('theme');
  if (stored) return stored === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const initialDark = resolveInitialTheme();
document.documentElement.classList.toggle('dark', initialDark);

type ThemeStore = { isDark: boolean; toggle: () => void };

export const useThemeStore = create<ThemeStore>((set, get) => ({
  isDark: initialDark,
  toggle() {
    const isDark = !get().isDark;
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    set({ isDark });
  },
}));
