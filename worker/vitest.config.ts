import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';

// The pool spins up its own Miniflare instance — separate from `wrangler dev`.
// Storage is in-memory and reset per test file (isolatedStorage). The explicit
// *Persist: false flags below make that guarantee load-bearing so a future
// config tweak can't silently start writing to `.wrangler/state/...`.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations('./migrations');

  return {
    test: {
      setupFiles: ['./test/setup.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: true,
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
            // Force ephemeral storage — never touch the local dev DB.
            cachePersist: false,
            d1Persist: false,
            kvPersist: false,
            r2Persist: false,
            durableObjectsPersist: false,
          },
        },
      },
    },
  };
});
