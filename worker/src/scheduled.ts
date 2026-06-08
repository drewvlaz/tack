import { createDb } from './db/client';
import { configureLogger, log } from './lib/log';
import { sweepOrphanR2Blobs } from './services/gc';

type ScheduledBindings = {
  DB: D1Database;
  IMAGES: R2Bucket;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
};

// Entry point for cron triggers (configured in wrangler.toml). Middleware only
// runs on fetch, so the logger has to be configured here too. Each scheduled
// job goes through `ctx.waitUntil` with a catch so one job failing doesn't
// abort the others.
export function handleScheduled(
  _event: ScheduledEvent,
  env: ScheduledBindings,
  ctx: ExecutionContext,
): void {
  configureLogger(env);
  ctx.waitUntil(
    sweepOrphanR2Blobs(createDb(env.DB), env.IMAGES, new Date()).catch(
      (err) => {
        log.error('R2 GC sweep failed:', err);
      },
    ),
  );
}
