import { createConsola, type ConsolaInstance, type LogLevel } from 'consola';

export type LoggerEnv = {
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
};

function resolveLevel(env: LoggerEnv): LogLevel {
  const explicit = env.LOG_LEVEL ? Number(env.LOG_LEVEL) : NaN;
  if (Number.isFinite(explicit)) return explicit as LogLevel;
  return (env.ENVIRONMENT === 'development' ? 4 : 3) as LogLevel;
}

export const log: ConsolaInstance = createConsola({ level: 3 });

// Workers expose bindings only inside the request, so callers re-apply on each
// request. Setting a numeric level is idempotent and cheap.
export function configureLogger(env: LoggerEnv): void {
  log.level = resolveLevel(env);
}
