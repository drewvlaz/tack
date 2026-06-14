import { env } from 'cloudflare:test';

// The real-page HTML fixture suite. Each fixture is a saved retailer product
// page (`fixtures/<name>.html`) plus hand-written expectations
// (`fixtures/<name>.expected.json`). The workers pool has no filesystem and
// doesn't support import.meta.glob, so vitest.config.ts reads the files under
// Node at config time and injects them as the PARSER_FIXTURES binding.

export type FixtureExpectation = {
  // The page URL the fixture was captured from (used as the base for
  // relative-URL resolution and JSON-LD product matching).
  url: string;
  // Case-insensitive substring expected in the parsed title.
  title?: string;
  // Case-insensitive substring expected in the parsed brand.
  brand?: string;
  // Exact expected price / ISO currency at capture time.
  price?: number;
  currency?: string;
  // True when the page carries the price in JSON-LD/microdata — the static
  // (no-Claude) test then asserts price/currency too. SPA pages whose price
  // lives only in embedded JSON leave this false; only the live eval can
  // check their price (via Claude's PRICE_SIGNALS arbitration).
  structuredPrice?: boolean;
  // Minimum number of selected images (default 1).
  minImages?: number;
  // Substrings (e.g. the product's SKU/image-id fragments) of which each must
  // appear in at least one selected image URL.
  imageMustMatch?: string[];
  // Substrings (e.g. SKUs of products in the page's related carousel) that
  // must NOT appear in any selected image URL.
  imageMustNotMatch?: string[];
  // Fields the static no-Claude test can't reasonably resolve and are deferred
  // to the live Claude eval:
  //   - 'title' / 'brand': field is missing from og tags / JSON-LD on the page.
  //   - 'imageMustNotMatch': the unwanted images are indistinguishable from
  //     the wanted ones by structural signal alone (e.g. an unrequested
  //     colorway's photos sit in plain <img> tags alongside the requested
  //     ones). Claude reads the page text/URL slug and can disambiguate.
  skipStatic?: ('title' | 'brand' | 'imageMustNotMatch')[];
  // Labels over the extractCandidates pool, used to compute
  // precision/recall/average-precision as continuous quality metrics
  // (complement to the binary imageMustMatch/imageMustNotMatch gates above).
  // Each entry is a URL substring; a candidate URL matching a `positives`
  // entry is labeled positive, one matching a `negatives` entry is labeled
  // negative, and candidates matched by both — or neither — are unlabeled
  // and excluded from metrics.
  imageLabels?: {
    positives?: string[];
    negatives?: string[];
  };
  notes?: string;
};

export type Fixture = {
  name: string;
  html: string;
  expected: FixtureExpectation;
};

export const fixtures: Fixture[] = Object.entries(env.PARSER_FIXTURES ?? {})
  .map(([name, f]) => ({
    name,
    html: f.html,
    expected: f.expected as FixtureExpectation,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
