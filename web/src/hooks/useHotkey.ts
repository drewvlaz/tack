import { useContext, useEffect, useId, useMemo, useRef } from 'react';
import {
  HotkeyContext,
  type HotkeyScope,
  type ParsedCombo,
} from './hotkeyContext';

type Combo = string;

interface HotkeyOpts {
  scope?: HotkeyScope;
  enabled?: boolean;
  allowInInputs?: boolean;
  preventDefault?: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  del: 'delete',
  return: 'enter',
  space: ' ',
  spacebar: ' ',
  plus: '+',
};

// Layout-sensitive keys: match by KeyboardEvent.code as a fallback so layouts
// where '=' / '-' live behind Shift still resolve.
const CODE_FALLBACKS: Record<string, string> = {
  '=': 'Equal',
  '-': 'Minus',
  '+': 'Equal',
};

export function useHotkey(
  combo: Combo | Combo[],
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOpts = {},
): void {
  const ctx = useContext(HotkeyContext);
  if (!ctx) {
    throw new Error('useHotkey must be used inside <HotkeyProvider>');
  }

  const id = useId();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const combosKey = Array.isArray(combo) ? combo.join('|') : combo;
  const combos = useMemo(
    () => combosKey.split('|').map(parseCombo),
    [combosKey],
  );

  const {
    scope = 'global',
    enabled = true,
    allowInInputs = false,
    preventDefault = true,
  } = opts;

  useEffect(() => {
    ctx.register(id, {
      combos,
      handler: (e) => handlerRef.current(e),
      scope,
      enabled,
      allowInInputs,
      preventDefault,
    });
    return () => ctx.unregister(id);
  }, [ctx, id, combos, scope, enabled, allowInInputs, preventDefault]);
}

function parseCombo(combo: Combo): ParsedCombo {
  const parts = combo.split('+').map((p) => p.trim());
  let mod = false;
  let shift = false;
  let alt = false;
  let key = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (
      lower === 'mod' ||
      lower === 'cmd' ||
      lower === 'meta' ||
      lower === 'ctrl' ||
      lower === 'control'
    ) {
      mod = true;
    } else if (lower === 'shift') {
      shift = true;
    } else if (lower === 'alt' || lower === 'option') {
      alt = true;
    } else {
      key = lower;
    }
  }

  const resolved = KEY_ALIASES[key] ?? key;
  return {
    key: resolved,
    code: CODE_FALLBACKS[resolved],
    mod,
    shift,
    alt,
  };
}
