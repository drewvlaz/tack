import type { ImageCandidate } from '../../src/services/parser/candidates';
import { probability } from '../../src/services/parser/candidates';
import type { ParsedMeta } from '../../src/services/parser/meta';
import type { FixtureExpectation } from './fixtures';

export type Check = { name: string; pass: boolean; detail?: string };

// ---------- Probabilistic metrics over the ranked candidate pool ----------
//
// The scoring model is a log-linear classifier:
//
//     score(x) = Σ_i w_i · f_i(x)
//     p(x is product image) ≈ σ(score(x) - bias)         [see candidates.ts]
//
// Given per-fixture labels (positives / negatives), we compute the standard
// information-retrieval metrics over the candidate pool:
//
//   - precision@K  : of the top-K *labeled* candidates, what fraction are
//                    positive? (unlabeled candidates are excluded from both
//                    numerator and denominator — we don't have an opinion
//                    on them)
//   - recall@K     : of the labeled positives in the pool, what fraction
//                    are in the top-K?
//   - AP           : average precision over the pool. For each positive
//                    candidate at rank i (counted among labeled candidates
//                    only), precision@i is computed; AP is the mean.
//                    Range [0,1]; 1.0 = every positive precedes every
//                    negative in the ranking.
//
// AP is the continuous analogue of "ranking quality" — a better signal than
// precision@K alone because it credits ordering even when both classes are
// represented. We assert per-fixture floors on each metric so the suite
// catches ranking regressions, not just substring-mismatch failures.

export type LabeledCandidate = ImageCandidate & {
  label: 'positive' | 'negative' | 'unlabeled';
};

export function labelCandidates(
  candidates: ImageCandidate[],
  labels: FixtureExpectation['imageLabels'],
): LabeledCandidate[] {
  const positives = labels?.positives ?? [];
  const negatives = labels?.negatives ?? [];
  return candidates.map((c) => {
    const lc = c.url.toLowerCase();
    const isPos = positives.some((p) => lc.includes(p.toLowerCase()));
    const isNeg = negatives.some((n) => lc.includes(n.toLowerCase()));
    const label: 'positive' | 'negative' | 'unlabeled' =
      isPos && !isNeg ? 'positive' : isNeg && !isPos ? 'negative' : 'unlabeled';
    return { ...c, label };
  });
}

export type RankingMetrics = {
  // Number of labeled candidates of each class in the pool.
  positives: number;
  negatives: number;
  unlabeled: number;
  // precision@K over labeled candidates only. Defined only when at least
  // one labeled candidate appears in the top-K; null otherwise.
  precisionAt: Record<number, number | null>;
  recallAt: Record<number, number | null>;
  // Average precision over the labeled-candidate sequence. Defined only
  // when at least one labeled positive exists in the pool.
  ap: number | null;
};

export function rankingMetrics(
  labeled: LabeledCandidate[],
  ks: number[] = [3, 6, 12],
): RankingMetrics {
  const positives = labeled.filter((c) => c.label === 'positive').length;
  const negatives = labeled.filter((c) => c.label === 'negative').length;
  const unlabeled = labeled.filter((c) => c.label === 'unlabeled').length;

  const perK = ks.map((k) => {
    const head = labeled.slice(0, k).filter((c) => c.label !== 'unlabeled');
    const tp = head.filter((c) => c.label === 'positive').length;
    return {
      k,
      precision: head.length === 0 ? null : tp / head.length,
      recall: positives === 0 ? null : tp / positives,
    };
  });
  const precisionAt: Record<number, number | null> = Object.fromEntries(
    perK.map(({ k, precision }) => [k, precision]),
  );
  const recallAt: Record<number, number | null> = Object.fromEntries(
    perK.map(({ k, recall }) => [k, recall]),
  );

  // AP = mean over labeled positives of precision-at-that-rank, where rank
  // is counted within the labeled-only subsequence. Computed via reduce so we
  // never reassign — every intermediate state is a fresh object.
  const ap: number | null =
    positives === 0
      ? null
      : labeled
          .filter((c) => c.label !== 'unlabeled')
          .reduce(
            (acc, c) => {
              const seenLabeled = acc.seenLabeled + 1;
              if (c.label !== 'positive') {
                return { ...acc, seenLabeled };
              }
              const seenPositive = acc.seenPositive + 1;
              return {
                seenLabeled,
                seenPositive,
                sum: acc.sum + seenPositive / seenLabeled,
              };
            },
            { seenLabeled: 0, seenPositive: 0, sum: 0 },
          ).sum / positives;

  return { positives, negatives, unlabeled, precisionAt, recallAt, ap };
}

export type MetricCheck = {
  name: string;
  value: number | null;
  threshold: number;
  pass: boolean;
};

// Per-fixture thresholds. These are tuned to be tight enough to catch a real
// regression but loose enough that one off-rank doesn't trip the suite when
// the pool has only 1-2 labeled candidates of either class.
export const METRIC_FLOORS = {
  precisionAt3: 0.7,
  precisionAt6: 0.7,
  recallAt6: 0.5,
  ap: 0.7,
};

export function metricChecks(m: RankingMetrics): MetricCheck[] {
  const out: MetricCheck[] = [];
  // precision@K is meaningful only when ≥ K positives exist in the pool —
  // otherwise the score is structurally capped at positives/K (we can't pick
  // K positives from a pool that has fewer). Apply each K only when its
  // denominator can be saturated, otherwise the metric is "everything that
  // exists" and gives no signal.
  if (m.positives >= 3) {
    out.push({
      name: 'precision@3',
      value: m.precisionAt[3],
      threshold: METRIC_FLOORS.precisionAt3,
      pass: (m.precisionAt[3] ?? 0) >= METRIC_FLOORS.precisionAt3,
    });
  }
  if (m.positives >= 6) {
    out.push({
      name: 'precision@6',
      value: m.precisionAt[6],
      threshold: METRIC_FLOORS.precisionAt6,
      pass: (m.precisionAt[6] ?? 0) >= METRIC_FLOORS.precisionAt6,
    });
  }
  if (m.positives >= 2) {
    out.push({
      name: 'recall@6',
      value: m.recallAt[6],
      threshold: METRIC_FLOORS.recallAt6,
      pass: (m.recallAt[6] ?? 0) >= METRIC_FLOORS.recallAt6,
    });
  }
  // Average Precision is the primary ranking-quality metric. Defined whenever
  // any positive exists, and the most expressive of the four (rewards good
  // ordering even at low positive counts) — assert broadly.
  if (m.ap !== null && m.positives + m.negatives >= 2) {
    out.push({
      name: 'AP',
      value: m.ap,
      threshold: METRIC_FLOORS.ap,
      pass: m.ap >= METRIC_FLOORS.ap,
    });
  }
  return out;
}

export function formatMetrics(name: string, m: RankingMetrics): string {
  const fmt = (v: number | null) => (v === null ? ' n/a ' : v.toFixed(3));
  return [
    `[${name}] labels: +${m.positives}/-${m.negatives}/~${m.unlabeled}  ` +
      `P@3=${fmt(m.precisionAt[3])}  P@6=${fmt(m.precisionAt[6])}  ` +
      `R@6=${fmt(m.recallAt[6])}  AP=${fmt(m.ap)}`,
  ].join('\n');
}

// Helper kept exported for unit tests on the model surface.
export { probability };

const containsCi = (haystack: string | null, needle: string): boolean =>
  haystack !== null && haystack.toLowerCase().includes(needle.toLowerCase());

export function scoreImages(
  urls: string[],
  expected: FixtureExpectation,
): Check[] {
  const checks: Check[] = [];
  const minImages = expected.minImages ?? 1;
  checks.push({
    name: 'image count',
    pass: urls.length >= minImages,
    detail: `${urls.length} selected (need >= ${minImages})`,
  });
  for (const frag of expected.imageMustMatch ?? []) {
    checks.push({
      name: `image has "${frag}"`,
      pass: urls.some((u) => u.toLowerCase().includes(frag.toLowerCase())),
    });
  }
  for (const frag of expected.imageMustNotMatch ?? []) {
    const offender = urls.find((u) =>
      u.toLowerCase().includes(frag.toLowerCase()),
    );
    checks.push({
      name: `no image has "${frag}"`,
      pass: offender === undefined,
      detail: offender,
    });
  }
  return checks;
}

export function scoreMeta(
  meta: ParsedMeta,
  expected: FixtureExpectation,
): Check[] {
  const checks: Check[] = [];
  if (expected.title !== undefined) {
    checks.push({
      name: 'title',
      pass: containsCi(meta.title, expected.title),
      detail: `got "${meta.title}"`,
    });
  }
  if (expected.brand !== undefined) {
    checks.push({
      name: 'brand',
      pass: containsCi(meta.brand, expected.brand),
      detail: `got "${meta.brand}"`,
    });
  }
  if (expected.price !== undefined) {
    checks.push({
      name: 'price',
      pass: meta.price === expected.price,
      detail: `expected ${expected.price}, got ${meta.price}`,
    });
  }
  if (expected.currency !== undefined) {
    checks.push({
      name: 'currency',
      pass: meta.currency === expected.currency,
      detail: `expected ${expected.currency}, got ${meta.currency}`,
    });
  }
  return [...checks, ...scoreImages(meta.imageUrls, expected)];
}

export function formatScorecard(name: string, checks: Check[]): string {
  const lines = checks.map(
    (c) =>
      `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${!c.pass && c.detail ? ` — ${c.detail}` : ''}`,
  );
  const failed = checks.filter((c) => !c.pass).length;
  return [
    `[${name}] ${failed === 0 ? 'ALL PASS' : `${failed}/${checks.length} FAILED`}`,
    ...lines,
  ].join('\n');
}
