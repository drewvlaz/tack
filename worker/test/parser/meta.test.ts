import { describe, expect, it } from 'vitest';
import {
  extractPrice,
  extractTemplateImageUrls,
  normalizeImageUrl,
  parseHtml,
  rebuildFromReference,
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
      imgTagImages: [],
    });
  });

  it('collects <img> src when no srcset is present', async () => {
    const result = await parseHtml(`
      <img src="https://cdn.test/hero.jpg" alt="x">
    `);
    expect(result.imgTagImages).toEqual(['https://cdn.test/hero.jpg']);
  });

  it('treats <img srcSet> (camelCase, as Next.js renders) the same as srcset', async () => {
    const result = await parseHtml(`
      <img srcSet="https://cdn.test/a-256.jpg 256w, https://cdn.test/a-1920.jpg 1920w">
    `);
    expect(result.imgTagImages).toEqual(['https://cdn.test/a-1920.jpg']);
  });

  it('handles srcset URLs that contain commas (e.g. Cloudinary transforms)', async () => {
    const result = await parseHtml(`
      <img srcset="https://cdn.test/images/f_auto,c_limit,w_256/SKU/p.jpg 256w, https://cdn.test/images/f_auto,c_limit,w_1920/SKU/p.jpg 1920w">
    `);
    expect(result.imgTagImages).toEqual([
      'https://cdn.test/images/f_auto,c_limit,w_1920/SKU/p.jpg',
    ]);
  });

  it('picks the largest URL from each <img srcset>', async () => {
    const result = await parseHtml(`
      <img srcset="https://cdn.test/a-256.jpg 256w, https://cdn.test/a-1920.jpg 1920w" src="https://cdn.test/a-fallback.jpg">
      <img srcset="https://cdn.test/b-256.jpg 256w, https://cdn.test/b-1080.jpg 1080w">
    `);
    expect(result.imgTagImages).toEqual([
      'https://cdn.test/a-1920.jpg',
      'https://cdn.test/b-1080.jpg',
    ]);
  });

  // SSENSE-style page: og:image and JSON-LD each have only 1 URL (the _1
  // shot); the rest of the gallery lives in <img srcset>. Verify all 4
  // distinct shots survive merge+dedupe.
  it('SSENSE-shaped page yields all distinct product shots', async () => {
    const html = `
      <meta property="og:image" content="https://img.ssensemedia.com/images/w_640/SKU_1/p.jpg">
      <script type="application/ld+json">{"@type":"Product","image":"https://img.ssensemedia.com/images/__IMAGE_PARAMS__/SKU_1/p.jpg"}</script>
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_1/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_1/p.jpg 1920w">
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_2/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_2/p.jpg 1920w">
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_3/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_3/p.jpg 1920w">
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_4/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_4/p.jpg 1920w">
      <img src="https://other-cdn.test/widget.svg">
    `;
    const parsed = await parseHtml(html);
    expect(parsed.imgTagImages).toHaveLength(5); // 4 product + 1 widget
    const sameHost = parsed.imgTagImages.filter((u) =>
      u.includes('ssensemedia.com'),
    );
    const merged = resolveAndDedupeUrls('https://www.ssense.com/x', [
      ...parsed.jsonLdImages,
      ...parsed.ogImages,
      ...sameHost,
    ]).filter((u) => !/__[A-Z][A-Z0-9_]*__/.test(u));
    const skuCount = merged.filter((u) => /\/SKU_\d\//.test(u)).length;
    expect(skuCount).toBe(4);
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

  it('collapses Cloudinary-style size-transform variants of the same image', () => {
    const out = resolveAndDedupeUrls(base, [
      'https://cdn.test/images/w_640/SKU_1/shot.jpg',
      'https://cdn.test/images/f_auto,c_limit,w_1920/SKU_1/shot.jpg',
      'https://cdn.test/images/w_256/SKU_1/shot.jpg',
    ]);
    expect(out).toHaveLength(1);
  });

  it('collapses Shopify size-suffix variants of the same image', () => {
    const out = resolveAndDedupeUrls(base, [
      'https://cdn.shopify.com/files/PRODUCT_01_300x300.jpg?v=1',
      'https://cdn.shopify.com/files/PRODUCT_01_1024x.jpg?v=1',
      'https://cdn.shopify.com/files/PRODUCT_01_{width}x.jpg?v=1',
    ]);
    expect(out).toEqual([
      'https://cdn.shopify.com/files/PRODUCT_01_2048x.jpg?v=1',
    ]);
  });

  it('normalizes protocol-relative URLs (resolves against base, then dedupes)', () => {
    const out = resolveAndDedupeUrls(base, [
      '//cdn.shopify.com/files/X_300x300.jpg',
      '//cdn.shopify.com/files/X_{width}x.jpg',
    ]);
    expect(out).toEqual(['https://cdn.shopify.com/files/X_2048x.jpg']);
  });

  it('upgrades http origins to https for cross-scheme dedupe', () => {
    const out = resolveAndDedupeUrls(base, [
      'http://cdn.shopify.com/files/X_1024x.jpg',
      'https://cdn.shopify.com/files/X_300x300.jpg',
    ]);
    expect(out).toEqual(['https://cdn.shopify.com/files/X_2048x.jpg']);
  });

  it('keeps distinct shots of the same product (different SKU suffix)', () => {
    const out = resolveAndDedupeUrls(base, [
      'https://cdn.test/images/w_1920/SKU_1/shot.jpg',
      'https://cdn.test/images/w_1920/SKU_2/shot.jpg',
      'https://cdn.test/images/w_1920/SKU_3/shot.jpg',
    ]);
    expect(out).toHaveLength(3);
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

describe('normalizeImageUrl', () => {
  it('swaps Shopify-style _NNNxNNN filename suffix for _2048x', () => {
    expect(
      normalizeImageUrl(
        'https://cdn.shopify.com/files/PRODUCT_01_300x300.jpg?v=1',
      ),
    ).toBe('https://cdn.shopify.com/files/PRODUCT_01_2048x.jpg?v=1');
  });

  it('swaps Shopify-style _NNNx filename suffix for _2048x', () => {
    expect(
      normalizeImageUrl('https://cdn.shopify.com/files/PRODUCT_01_1024x.jpg'),
    ).toBe('https://cdn.shopify.com/files/PRODUCT_01_2048x.jpg');
  });

  it('swaps Shopify-style _NNNx@2x suffix for _2048x', () => {
    expect(
      normalizeImageUrl('https://cdn.shopify.com/files/LOGO_220x@2x.png?v=2'),
    ).toBe('https://cdn.shopify.com/files/LOGO_2048x.png?v=2');
  });

  it('substitutes {width} placeholder with 2048', () => {
    expect(
      normalizeImageUrl(
        'https://cdn.shopify.com/files/PRODUCT_01_{width}x.jpg?v=3',
      ),
    ).toBe('https://cdn.shopify.com/files/PRODUCT_01_2048x.jpg?v=3');
  });

  it('substitutes {height} and {size} placeholders too', () => {
    expect(
      normalizeImageUrl('https://cdn.example.com/img/x_{height}_{size}.jpg'),
    ).toBe('https://cdn.example.com/img/x_2048_2048.jpg');
  });

  it('is a no-op for URLs without size hints or placeholders', () => {
    const url =
      'https://res.cloudinary.com/x/image/upload/c_scale,h_480/v550/SKU_1.jpg';
    expect(normalizeImageUrl(url)).toBe(url);
  });
});

describe('extractTemplateImageUrls', () => {
  it('finds placeholder URLs in raw HTML', () => {
    const out = extractTemplateImageUrls(
      `<script>{"img":"https://cdn.test/upload/__IMAGE_PARAMS__/SKU_2.jpg"}</script>`,
    );
    expect(out).toEqual(['https://cdn.test/upload/__IMAGE_PARAMS__/SKU_2.jpg']);
  });

  it('finds placeholder URLs embedded with JSON-escaped slashes', () => {
    const out = extractTemplateImageUrls(
      `<script>"https:\\u002F\\u002Fcdn.test\\u002Fupload\\u002F__IMAGE_PARAMS__\\u002FSKU_3.jpg"</script>`,
    );
    expect(out).toContain('https://cdn.test/upload/__IMAGE_PARAMS__/SKU_3.jpg');
  });

  it('ignores URLs without a placeholder', () => {
    const out = extractTemplateImageUrls(
      `<script>{"img":"https://cdn.test/upload/c_scale,h_480/SKU_1.jpg"}</script>`,
    );
    expect(out).toEqual([]);
  });
});

describe('rebuildFromReference', () => {
  const og = 'https://cdn.test/upload/c_scale,h_480/v550/SKU_1.jpg';

  it('swaps the reference filename for the template filename', () => {
    expect(
      rebuildFromReference(
        'https://cdn.test/upload/__IMAGE_PARAMS__/SKU_2.jpg',
        og,
      ),
    ).toBe('https://cdn.test/upload/c_scale,h_480/v550/SKU_2.jpg');
  });

  it('returns null when hosts differ', () => {
    expect(
      rebuildFromReference(
        'https://other-cdn.test/upload/__IMAGE_PARAMS__/SKU_2.jpg',
        og,
      ),
    ).toBeNull();
  });

  it('returns null when the template filename equals the reference filename', () => {
    expect(
      rebuildFromReference(
        'https://cdn.test/upload/__IMAGE_PARAMS__/SKU_1.jpg',
        og,
      ),
    ).toBeNull();
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
