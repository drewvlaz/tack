import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  HotkeyContext,
  IS_MAC,
  SCOPE_ORDER,
  type HotkeyEntry,
  type ParsedCombo,
  type RegistryHandle,
} from './hotkeyContext';

export function HotkeyProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<Map<string, HotkeyEntry>>(new Map());

  const handle = useMemo<RegistryHandle>(
    () => ({
      register: (id, entry) => {
        registryRef.current.set(id, entry);
      },
      unregister: (id) => {
        registryRef.current.delete(id);
      },
    }),
    [],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      const hasMod = e.metaKey || e.ctrlKey;

      let best: HotkeyEntry | null = null;
      let bestPriority = Number.POSITIVE_INFINITY;

      for (const entry of registryRef.current.values()) {
        if (!entry.enabled) continue;
        if (inInput && !hasMod && !entry.allowInInputs) continue;
        if (!entry.combos.some((c) => comboMatches(c, e))) continue;

        const priority = SCOPE_ORDER[entry.scope];
        if (priority < bestPriority) {
          best = entry;
          bestPriority = priority;
        }
      }

      if (!best) return;
      if (best.preventDefault) e.preventDefault();
      best.handler(e);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <HotkeyContext.Provider value={handle}>{children}</HotkeyContext.Provider>
  );
}

function comboMatches(combo: ParsedCombo, e: KeyboardEvent): boolean {
  const eventMod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (combo.mod !== eventMod) return false;
  if (combo.shift !== e.shiftKey) return false;
  if (combo.alt !== e.altKey) return false;

  const eventKey = e.key.toLowerCase();
  if (eventKey === combo.key) return true;
  if (combo.code && e.code === combo.code) return true;
  return false;
}
