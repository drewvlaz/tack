// Translates worker / tRPC error messages into user-readable strings for the
// add-item flow. Pattern-matches on known shapes; falls back to the raw message
// so we don't silently swallow unknown failures.

export function describeAddItemError(err: unknown): string {
  if (!err || typeof err !== 'object' || !('message' in err)) {
    return 'Something went wrong.';
  }
  const msg = String((err as { message: unknown }).message);

  if (/^Fetch failed: 4\d{2}/.test(msg)) {
    return 'The site blocked us. Try a different product page.';
  }
  if (/^Fetch failed: 5\d{2}/.test(msg)) {
    return "The site couldn't return a response. Try again later.";
  }
  if (/unsafe url/i.test(msg)) {
    return "That URL isn't supported.";
  }
  if (/abort|timed? ?out/i.test(msg)) {
    return 'The site took too long to respond.';
  }
  return msg;
}
