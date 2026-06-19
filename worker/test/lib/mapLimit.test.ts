import { describe, expect, it } from 'vitest';
import { mapLimit } from '../../src/lib/mapLimit';

describe('mapLimit', () => {
  it('preserves input order regardless of completion order', async () => {
    const out = await mapLimit(
      [100, 10, 50],
      3,
      (n) => new Promise<number>((r) => setTimeout(() => r(n * 2), n)),
    );
    expect(out).toEqual([200, 20, 100]);
  });

  it('caps in-flight callbacks at `limit`', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapLimit(items, 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    // And actually reached the cap (otherwise the test would pass with limit=1).
    expect(peak).toBeGreaterThan(1);
  });

  it('passes index to the callback', async () => {
    const out = await mapLimit(
      ['a', 'b', 'c'],
      2,
      async (item, i) => `${item}${i}`,
    );
    expect(out).toEqual(['a0', 'b1', 'c2']);
  });

  it('returns [] for an empty input', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });

  it('survives limit > items.length', async () => {
    expect(await mapLimit([1, 2], 100, async (n) => n + 1)).toEqual([2, 3]);
  });
});
