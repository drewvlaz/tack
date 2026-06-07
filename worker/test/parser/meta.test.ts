import { describe, expect, it } from 'vitest';
import {
  extractPrice,
  parseHtml,
  resolveAndDedupeUrls,
  stripHtml,
} from '../../src/services/parser/meta';

describe('parseHtml', () => {
  it('extracts og:title from property attribute', async () => {
    const result = await parseHtml(
      `<html><head><meta property="og:title" content="Linen Overshirt"></head></html>`,
    );
    expect(result.title).toBe('Linen Overshirt');
  });

  it('extracts og:title from name= variant', async () => {
    const result = await parseHtml(
      `<html><head><meta name="og:title" content="Linen Overshirt"></head></html>`,
    );
    expect(result.title).toBe('Linen Overshirt');
  });

  it('first og:title wins when there are duplicates', async () => {
    const result = await parseHtml(`
      <meta property="og:title" content="First">
      <meta property="og:title" content="Second">
    `);
    expect(result.title).toBe('First');
  });

  it('handles multiline meta attributes', async () => {
    const result = await parseHtml(`
      <meta
        property="og:title"
        content="Wrapped Title"
      >
    `);
    expect(result.title).toBe('Wrapped Title');
  });

  it('reads og:site_name as brand and og:description', async () => {
    const result = await parseHtml(`
      <meta property="og:site_name" content="LEMAIRE">
      <meta property="og:description" content="A soft leather blouson.">
    `);
    expect(result.brand).toBe('LEMAIRE');
    expect(result.description).toBe('A soft leather blouson.');
  });

  it('collects og:image, og:image:secure_url, and og:image:url', async () => {
    const result = await parseHtml(`
      <meta property="og:image" content="https://cdn.test/a.jpg">
      <meta property="og:image:secure_url" content="https://cdn.test/b.jpg">
      <meta property="og:image:url" content="https://cdn.test/c.jpg">
    `);
    expect(result.ogImages).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
      'https://cdn.test/c.jpg',
    ]);
  });

  it('returns nulls and empty arrays when nothing matches', async () => {
    const result = await parseHtml(`<html><body><h1>hi</h1></body></html>`);
    expect(result).toEqual({
      title: null,
      brand: null,
      description: null,
      ogImages: [],
      jsonLdImages: [],
    });
  });

  it('extracts images from JSON-LD with image as a string', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">
        {"@type":"Product","image":"https://cdn.test/x.jpg"}
      </script>
    `);
    expect(result.jsonLdImages).toEqual(['https://cdn.test/x.jpg']);
  });

  it('extracts images from JSON-LD with image as a string array', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">
        {"@type":"Product","image":["https://cdn.test/a.jpg","https://cdn.test/b.jpg"]}
      </script>
    `);
    expect(result.jsonLdImages).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ]);
  });

  it('extracts images from JSON-LD with image as an object array', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">
        {"@type":"Product","image":[{"url":"https://cdn.test/a.jpg"},{"url":"https://cdn.test/b.jpg"}]}
      </script>
    `);
    expect(result.jsonLdImages).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ]);
  });

  it('ignores malformed JSON-LD without crashing', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">{ not valid json }</script>
      <meta property="og:title" content="Still Works">
    `);
    expect(result.title).toBe('Still Works');
    expect(result.jsonLdImages).toEqual([]);
  });

  it('walks nested objects to find image fields', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">
        {"@type":"WebPage","mainEntity":{"@type":"Product","image":"https://cdn.test/deep.jpg"}}
      </script>
    `);
    expect(result.jsonLdImages).toContain('https://cdn.test/deep.jpg');
  });
});

describe('resolveAndDedupeUrls', () => {
  const base = 'https://shop.example.com/products/bag';

  it('resolves relative URLs against the base', () => {
    expect(resolveAndDedupeUrls(base, ['/cdn/a.jpg'])).toEqual([
      'https://shop.example.com/cdn/a.jpg',
    ]);
  });

  it('resolves protocol-relative URLs', () => {
    expect(resolveAndDedupeUrls(base, ['//cdn.test/a.jpg'])).toEqual([
      'https://cdn.test/a.jpg',
    ]);
  });

  it('collapses duplicates that share origin+pathname (width variants)', () => {
    expect(
      resolveAndDedupeUrls(base, [
        'https://cdn.test/img.webp?v=1',
        'https://cdn.test/img.webp?v=1&width=1200',
      ]),
    ).toHaveLength(1);
  });

  it('skips empty strings', () => {
    expect(resolveAndDedupeUrls(base, ['', '/ok.jpg', ''])).toEqual([
      'https://shop.example.com/ok.jpg',
    ]);
  });

  it('returns empty array when all inputs are empty', () => {
    expect(resolveAndDedupeUrls(base, ['', '', ''])).toEqual([]);
  });
});

describe('extractPrice', () => {
  it('pulls a structured-data style price', () => {
    expect(extractPrice('foo "price": "199.00" bar')).toBe(199);
    expect(extractPrice('foo "price": 99.99 bar')).toBe(99.99);
  });

  it('falls back to "$N" near the word price', () => {
    expect(extractPrice('Now on sale, price $128.50 with free shipping')).toBe(
      128.5,
    );
  });

  it('returns null when nothing matches', () => {
    expect(extractPrice('no prices here')).toBeNull();
  });
});

describe('stripHtml', () => {
  it('removes script, style, nav, footer, and header content', () => {
    const out = stripHtml(`
      <header>nav stuff</header>
      <nav>links</nav>
      <script>alert(1)</script>
      <style>body{}</style>
      <main>Hello <b>world</b></main>
      <footer>tos</footer>
    `);
    expect(out).not.toContain('alert');
    expect(out).not.toContain('nav stuff');
    expect(out).not.toContain('tos');
    expect(out).toContain('Hello world');
  });

  it('caps output at 40k chars', () => {
    const long = '<p>' + 'a'.repeat(100000) + '</p>';
    expect(stripHtml(long).length).toBeLessThanOrEqual(40000);
  });
});
