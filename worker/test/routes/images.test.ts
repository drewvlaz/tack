import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /api/images/*', () => {
  it('streams the blob with the stored content-type', async () => {
    await env.IMAGES.put('items/abc', new Uint8Array([0xff, 0xd8, 0xff]), {
      httpMetadata: { contentType: 'image/jpeg' },
    });

    const res = await SELF.fetch('https://x/api/images/items/abc');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff]),
    );
  });

  it('clamps a non-image stored content-type back to the default', async () => {
    // Defense in depth: even if a `text/html` blob somehow ends up in R2,
    // the route must not echo that content-type. Pair with the nosniff header
    // to fully neuter same-origin script execution.
    await env.IMAGES.put('items/poisoned', new TextEncoder().encode('<h1>x'), {
      httpMetadata: { contentType: 'text/html' },
    });

    const res = await SELF.fetch('https://x/api/images/items/poisoned');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    await res.arrayBuffer();
  });

  it('returns 404 for keys outside the items/ prefix', async () => {
    const res = await SELF.fetch('https://x/api/images/other/abc');
    expect(res.status).toBe(404);
    await res.arrayBuffer();
  });

  it('returns 404 when the R2 object is missing', async () => {
    const res = await SELF.fetch('https://x/api/images/items/missing');
    expect(res.status).toBe(404);
    await res.arrayBuffer();
  });

  it('sets long-lived immutable cache-control', async () => {
    await env.IMAGES.put('items/cacheable', new Uint8Array([1]));
    const res = await SELF.fetch('https://x/api/images/items/cacheable');
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    expect(res.headers.get('cache-control')).toMatch(/max-age=\d+/);
    await res.arrayBuffer();
  });
});
