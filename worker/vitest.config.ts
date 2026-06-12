import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';
import { readdirSync, readFileSync } from 'node:fs';

// This config runs under Node, but the worker tsconfig deliberately ships no
// node types (src/ targets the workers runtime) — node:fs is declared in
// test/nodefs.d.ts and process is reached through a typed globalThis lookup.
const nodeEnv =
  (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env ?? {};

// Real Anthropic key for the live parser eval (test/parser/eval.live.test.ts).
// Only injected when EVAL is set so a normal `pnpm test` can never spend
// tokens. The `test:eval` script sources worker/.dev.vars (gitignored) into
// the environment before invoking vitest.
function evalAnthropicKey(): string {
  return nodeEnv.EVAL ? (nodeEnv.ANTHROPIC_API_KEY ?? '') : '';
}

// Mirrors miniflare's Json binding constraint (its type isn't directly
// importable here — miniflare is a transitive dep under pnpm).
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

// The workers pool has no filesystem and doesn't support import.meta.glob,
// so the parser fixture suite (test/parser/fixtures/*.html + .expected.json)
// is read here under Node and injected as a binding. Fixtures without an
// expectations file are skipped.
function loadParserFixtures(): Record<
  string,
  { html: string; expected: Json }
> {
  const dir = './test/parser/fixtures';
  const out: Record<string, { html: string; expected: Json }> = {};
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const file of entries.filter((f) => f.endsWith('.html'))) {
    const name = file.replace(/\.html$/, '');
    try {
      out[name] = {
        html: readFileSync(`${dir}/${name}.html`, 'utf8'),
        expected: JSON.parse(
          readFileSync(`${dir}/${name}.expected.json`, 'utf8'),
        ) as Json,
      };
    } catch {
      // missing/invalid .expected.json — not part of the suite
    }
  }
  return out;
}

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
            bindings: {
              TEST_MIGRATIONS: migrations,
              EVAL_ANTHROPIC_API_KEY: evalAnthropicKey(),
              PARSER_FIXTURES: loadParserFixtures(),
            },
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
