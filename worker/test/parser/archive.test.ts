import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHtmlWithArchiveFallback } from '../../src/services/parser';

// `safeFetch` ultimately calls the global `fetch`. Stubbing it here gives us
// a deterministic story over the live → availability → snapshot sequence
// without any real network traffic. Each test installs a route table the
// stub consults in order; the first matching predicate wins.
type Route = {
  match: (req: Request) => boolean;
  respond: () => Response | Promise<Response>;
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

function stubFetch(routes: Route[]): void {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const req =
      input instanceof Request ? input : new Request(input.toString(), init);
    for (const r of routes) {
      if (r.match(req)) {
        return Promise.resolve(r.respond());
      }
    }
    throw new Error(`unexpected fetch: ${req.url}`);
  }) as typeof fetch;
}

const PRODUCT_URL =
  'https://www.cartier.com/en-us/watches/collections/tank/x.html';

describe('fetchHtmlWithArchiveFallback', () => {
  it('returns live HTML and no warning when the site allows the fetch', async () => {
    stubFetch([
      {
        match: (r) => r.url === PRODUCT_URL,
        respond: () =>
          new Response('<html><head><title>Live</title></head></html>', {
            status: 200,
          }),
      },
    ]);

    const { html, warnings } = await fetchHtmlWithArchiveFallback(PRODUCT_URL);
    expect(html).toContain('<title>Live</title>');
    expect(warnings).toEqual([]);
  });

  it('falls back to Wayback on a 403 and tags the result with parsed_from_archive', async () => {
    stubFetch([
      // Live site bot-blocks us.
      {
        match: (r) => r.url === PRODUCT_URL && !r.url.includes('archive.org'),
        respond: () => new Response('Forbidden', { status: 403 }),
      },
      // Availability API: a usable snapshot exists.
      {
        match: (r) => r.url.startsWith('https://archive.org/wayback/available'),
        respond: () =>
          new Response(
            JSON.stringify({
              archived_snapshots: {
                closest: {
                  status: '200',
                  available: true,
                  timestamp: '20260604090010',
                  url:
                    'http://web.archive.org/web/20260604090010/' + PRODUCT_URL,
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      },
      // Snapshot itself: serves the archived page bytes.
      {
        match: (r) =>
          r.url.startsWith('https://web.archive.org/web/20260604090010id_/'),
        respond: () =>
          new Response('<html><head><title>Archived</title></head></html>', {
            status: 200,
          }),
      },
    ]);

    const { html, warnings } = await fetchHtmlWithArchiveFallback(PRODUCT_URL);
    expect(html).toContain('<title>Archived</title>');
    expect(warnings).toEqual(['parsed_from_archive']);
  });

  it('rethrows the original ParseFetchError when no archive snapshot is available', async () => {
    stubFetch([
      {
        match: (r) => r.url === PRODUCT_URL,
        respond: () => new Response('Forbidden', { status: 403 }),
      },
      {
        match: (r) => r.url.startsWith('https://archive.org/wayback/available'),
        respond: () =>
          new Response(JSON.stringify({ archived_snapshots: {} }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      },
    ]);

    await expect(fetchHtmlWithArchiveFallback(PRODUCT_URL)).rejects.toThrow(
      /HTTP 403/,
    );
  });

  it('does not consult the archive on 404 (the snapshot would be just as wrong)', async () => {
    stubFetch([
      {
        match: (r) => r.url === PRODUCT_URL,
        respond: () => new Response('Not found', { status: 404 }),
      },
    ]);

    await expect(fetchHtmlWithArchiveFallback(PRODUCT_URL)).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it('uses the archive on a network-level failure too (TLS/DNS rejection mimics bot block)', async () => {
    stubFetch([
      {
        match: (r) => r.url === PRODUCT_URL && !r.url.includes('archive.org'),
        respond: () => {
          throw new TypeError('fetch failed');
        },
      },
      {
        match: (r) => r.url.startsWith('https://archive.org/wayback/available'),
        respond: () =>
          new Response(
            JSON.stringify({
              archived_snapshots: {
                closest: {
                  status: '200',
                  available: true,
                  timestamp: '20260604090010',
                  url:
                    'http://web.archive.org/web/20260604090010/' + PRODUCT_URL,
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      },
      {
        match: (r) =>
          r.url.startsWith('https://web.archive.org/web/20260604090010id_/'),
        respond: () =>
          new Response('<html><body>archived</body></html>', { status: 200 }),
      },
    ]);

    const { warnings } = await fetchHtmlWithArchiveFallback(PRODUCT_URL);
    expect(warnings).toEqual(['parsed_from_archive']);
  });

  it('ignores an archive response that looks malformed (no timestamp / non-200 archived status)', async () => {
    stubFetch([
      {
        match: (r) => r.url === PRODUCT_URL,
        respond: () => new Response('Forbidden', { status: 403 }),
      },
      {
        match: (r) => r.url.startsWith('https://archive.org/wayback/available'),
        respond: () =>
          new Response(
            JSON.stringify({
              archived_snapshots: {
                closest: {
                  // Archive captured a 5xx — useless for us.
                  status: '503',
                  available: true,
                  timestamp: '20260604090010',
                  url:
                    'http://web.archive.org/web/20260604090010/' + PRODUCT_URL,
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      },
    ]);

    await expect(fetchHtmlWithArchiveFallback(PRODUCT_URL)).rejects.toThrow(
      /HTTP 403/,
    );
  });
});
