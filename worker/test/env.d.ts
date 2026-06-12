import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    IMAGES: R2Bucket;
    TEST_MIGRATIONS: D1Migration[];
    EVAL_ANTHROPIC_API_KEY: string;
    PARSER_FIXTURES: Record<string, { html: string; expected: unknown }>;
  }
}
