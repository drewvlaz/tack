import {
  createConsola,
  LogLevels,
  type ConsolaInstance,
  type LogLevel,
} from 'consola';

export type LoggerEnv = {
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
};

const DEFAULT_LEVEL: LogLevel = LogLevels.info as LogLevel;
const DEV_LEVEL: LogLevel = LogLevels.debug as LogLevel;

function resolveLevel(env: LoggerEnv): LogLevel {
  const explicit = env.LOG_LEVEL ? Number(env.LOG_LEVEL) : NaN;
  if (Number.isFinite(explicit)) {
    return explicit as LogLevel;
  }
  return env.ENVIRONMENT === 'development' ? DEV_LEVEL : DEFAULT_LEVEL;
}

export const log: ConsolaInstance = createConsola({ level: DEFAULT_LEVEL });

// Workers expose bindings only inside the request, so callers re-apply on each
// request. Setting a numeric level is idempotent and cheap.
export function configureLogger(env: LoggerEnv): void {
  log.level = resolveLevel(env);
}
