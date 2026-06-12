import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { mergeSelection } from '../../src/services/parser';
import { extractCandidates } from '../../src/services/parser/candidates';
import {
  buildEvidence,
  selectProductMeta,
} from '../../src/services/parser/claude';
import { fixtures } from './fixtures';
import { formatScorecard, scoreMeta, type Check } from './score';

// Live end-to-end eval: fixture HTML (local, no retailer traffic) through the
// full extract → evidence → Claude-selection → merge pipeline, hitting the
// real Anthropic API. Run with:
//
//   EVAL=1 pnpm test:eval        (from root or worker/)
//
// The key comes from ANTHROPIC_API_KEY or worker/.dev.vars and is only
// injected into the test env when EVAL is set (see vitest.config.ts), so a
// plain `pnpm test` skips this file and never spends tokens.
const apiKey = env.EVAL_ANTHROPIC_API_KEY;

describe.skipIf(!apiKey)('parser live eval', () => {
  it.skipIf(fixtures.length > 0)('has fixtures', () => {
    throw new Error('no fixtures found in test/parser/fixtures/');
  });

  for (const fixture of fixtures) {
    it(`parses ${fixture.name}`, { timeout: 120_000 }, async () => {
      const extract = await extractCandidates(
        fixture.html,
        fixture.expected.url,
      );

      const checks: Check[] = [];
      let selection = null;
      try {
        selection = await selectProductMeta(
          buildEvidence(fixture.expected.url, extract, fixture.html),
          extract.candidates.length,
          apiKey,
        );
      } catch (err) {
        checks.push({
          name: 'claude call',
          pass: false,
          detail: String(err),
        });
      }

      const meta = mergeSelection(extract, selection);
      checks.push(...scoreMeta(meta, fixture.expected));

      console.log(formatScorecard(fixture.name, checks));
      console.log(
        `  images: ${meta.imageUrls.length ? meta.imageUrls.join('\n          ') : '(none)'}`,
      );

      expect(checks.filter((c) => !c.pass)).toEqual([]);
    });
  }
});
