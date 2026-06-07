import { createConsola, type ConsolaInstance, type LogLevel } from 'consola';

// Vite replaces import.meta.env.DEV at build time, so the level is a constant
// and debug calls behind explicit `if (import.meta.env.DEV)` guards are DCE'd
// in the production bundle.
function resolveLevel(): LogLevel {
  const explicit = import.meta.env.VITE_LOG_LEVEL;
  const parsed = explicit ? Number(explicit) : NaN;
  if (Number.isFinite(parsed)) {
    return parsed as LogLevel;
  }
  return (import.meta.env.DEV ? 4 : 3) as LogLevel;
}

export const log: ConsolaInstance = createConsola({ level: resolveLevel() });
