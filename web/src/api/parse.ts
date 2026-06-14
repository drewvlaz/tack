import { trpc, type ParseResult } from '../lib/trpc';

export type { ParseResult };

export function parseUrl(url: string): Promise<ParseResult> {
  return trpc.parseUrl.mutate({ url });
}

// Bookmarklet path: caller already has the rendered DOM (the live URL is
// bot-blocked). Same response shape as `parseUrl` — server-side it's the same
// pipeline minus the network fetch.
export function parseFromHtml(
  url: string,
  html: string,
): Promise<ParseResult> {
  return trpc.parseFromHtml.mutate({ url, html });
}
