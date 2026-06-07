import { createContext } from 'react';

export type HotkeyScope = 'modal' | 'panel' | 'canvas' | 'global';

export interface ParsedCombo {
  key: string;
  code?: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export interface HotkeyEntry {
  combos: ParsedCombo[];
  handler: (e: KeyboardEvent) => void;
  scope: HotkeyScope;
  enabled: boolean;
  allowInInputs: boolean;
  preventDefault: boolean;
}

export interface RegistryHandle {
  register: (id: string, entry: HotkeyEntry) => void;
  unregister: (id: string) => void;
}

export const SCOPE_ORDER: Record<HotkeyScope, number> = {
  modal: 0,
  panel: 1,
  canvas: 2,
  global: 3,
};

export const IS_MAC =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

export const HotkeyContext = createContext<RegistryHandle | null>(null);
