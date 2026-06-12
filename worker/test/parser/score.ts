import type { ParsedMeta } from '../../src/services/parser/meta';
import type { FixtureExpectation } from './fixtures';

export type Check = { name: string; pass: boolean; detail?: string };

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
