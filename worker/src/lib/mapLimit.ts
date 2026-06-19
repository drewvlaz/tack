// Concurrency-capped async map. Like Promise.all but never runs more than
// `limit` callbacks at once. Result array preserves input order regardless
// of completion order. Used by anything that fans out per-item I/O against
// a quota-limited resource (subrequest budget, upstream rate, wall-clock).

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) {
        return;
      }
      out[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return out;
}
