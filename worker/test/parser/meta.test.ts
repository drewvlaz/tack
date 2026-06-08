import { describe, expect, it } from 'vitest';
import {
  extractFromJsonLd,
  extractFromMicrodata,
  extractTemplateImageUrls,
  intersectWithClaude,
  normalizeImageUrl,
  parseHtml,
  rebuildFromReference,
  resolveAndDedupeUrls,
  scoreAndRankImages,
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
      jsonLdScripts: [],
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

  it('drops <img srcset> candidates whose largest descriptor is sub-thumbnail (< 400w)', async () => {
    const result = await parseHtml(`
      <img srcset="https://cdn.test/icon-1x.png 32w, https://cdn.test/icon-2x.png 64w">
      <img srcset="https://cdn.test/hero-1024.jpg 1024w">
    `);
    expect(result.imgTagImages).toEqual(['https://cdn.test/hero-1024.jpg']);
  });

  it('exposes raw JSON-LD script bodies', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">
        {"@type":"Product","name":"X"}
      </script>
      <script type="application/ld+json">
        {"@type":"Organization","name":"Brand"}
      </script>
    `);
    expect(result.jsonLdScripts).toHaveLength(2);
    expect(result.jsonLdScripts[0]).toContain('"Product"');
    expect(result.jsonLdScripts[1]).toContain('"Organization"');
  });

  it('ignores malformed JSON-LD without crashing parseHtml', async () => {
    const result = await parseHtml(`
      <script type="application/ld+json">{ not valid json }</script>
      <meta property="og:title" content="Still Works">
    `);
    expect(result.title).toBe('Still Works');
  });
});

describe('extractFromJsonLd', () => {
  const base = 'https://shop.example.com/products/bag';

  it('reads images from a Product node (string)', () => {
    const out = extractFromJsonLd(
      [`{"@type":"Product","image":"https://cdn.test/x.jpg"}`],
      base,
    );
    expect(out.productImages).toEqual(['https://cdn.test/x.jpg']);
  });

  it('reads images from a Product node (string array)', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","image":["https://cdn.test/a.jpg","https://cdn.test/b.jpg"]}`,
      ],
      base,
    );
    expect(out.productImages).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ]);
  });

  it('reads images from a Product node (ImageObject array)', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","image":[{"url":"https://cdn.test/a.jpg"},{"url":"https://cdn.test/b.jpg"}]}`,
      ],
      base,
    );
    expect(out.productImages).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ]);
  });

  it('extracts price and currency from a single Offer paired together', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","offers":{"@type":"Offer","price":"199.00","priceCurrency":"GBP","availability":"https://schema.org/InStock"}}`,
      ],
      base,
    );
    expect(out.price).toBe(199);
    expect(out.currency).toBe('GBP');
    expect(out.inStock).toBe(true);
  });

  it('handles AggregateOffer with lowPrice preferred over highPrice (sale)', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","offers":{"@type":"AggregateOffer","lowPrice":"89.00","highPrice":"129.00","priceCurrency":"EUR"}}`,
      ],
      base,
    );
    expect(out.price).toBe(89);
    expect(out.currency).toBe('EUR');
  });

  it('skips Offer nodes marked OutOfStock', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","offers":[
          {"@type":"Offer","price":"99.00","priceCurrency":"USD","availability":"https://schema.org/OutOfStock"},
          {"@type":"Offer","price":"149.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}
        ]}`,
      ],
      base,
    );
    expect(out.price).toBe(149);
    expect(out.currency).toBe('USD');
  });

  it('picks the URL-matching Product when @graph holds multiple', () => {
    const scripts = [
      `{"@graph":[
        {"@type":"Product","url":"https://shop.example.com/products/other","image":"https://cdn.test/wrong.jpg","offers":{"@type":"Offer","price":"50","priceCurrency":"USD"}},
        {"@type":"Product","url":"https://shop.example.com/products/bag","image":"https://cdn.test/right.jpg","offers":{"@type":"Offer","price":"200","priceCurrency":"USD"}}
      ]}`,
    ];
    const out = extractFromJsonLd(scripts, base);
    expect(out.productImages).toEqual(['https://cdn.test/right.jpg']);
    expect(out.price).toBe(200);
  });

  it('rejects implausible prices (0 and negative)', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","offers":{"@type":"Offer","price":"0.00","priceCurrency":"USD"}}`,
      ],
      base,
    );
    expect(out.price).toBeNull();
  });

  it('walks one level into mainEntity to find a Product', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"WebPage","mainEntity":{"@type":"Product","image":"https://cdn.test/x.jpg","offers":{"@type":"Offer","price":"42","priceCurrency":"USD"}}}`,
      ],
      base,
    );
    expect(out.productImages).toEqual(['https://cdn.test/x.jpg']);
    expect(out.price).toBe(42);
  });

  it('puts non-Product images into ambientImages, not productImages', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Organization","image":"https://cdn.test/logo.png"}`,
        `{"@type":"Product","image":"https://cdn.test/hero.jpg"}`,
      ],
      base,
    );
    expect(out.productImages).toEqual(['https://cdn.test/hero.jpg']);
    expect(out.ambientImages).toContain('https://cdn.test/logo.png');
  });

  it('tolerates malformed JSON-LD scripts', () => {
    const out = extractFromJsonLd(
      [
        `{ not valid json }`,
        `{"@type":"Product","image":"https://cdn.test/x.jpg"}`,
      ],
      base,
    );
    expect(out.productImages).toEqual(['https://cdn.test/x.jpg']);
  });

  it('accepts numeric price values (not just strings)', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","offers":{"@type":"Offer","price":42.5,"priceCurrency":"USD"}}`,
      ],
      base,
    );
    expect(out.price).toBe(42.5);
  });

  it('strips thousands separators in string prices', () => {
    const out = extractFromJsonLd(
      [
        `{"@type":"Product","offers":{"@type":"Offer","price":"1,299.00","priceCurrency":"USD"}}`,
      ],
      base,
    );
    expect(out.price).toBe(1299);
  });

  it('returns null when no Product node is present', () => {
    const out = extractFromJsonLd(
      [`{"@type":"BreadcrumbList","itemListElement":[]}`],
      base,
    );
    expect(out.price).toBeNull();
    expect(out.currency).toBeNull();
    expect(out.productImages).toEqual([]);
  });
});

describe('extractFromMicrodata', () => {
  it('extracts price + currency from adjacent meta itemprops', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Product">
        <meta itemprop="price" content="128.50" />
        <meta itemprop="priceCurrency" content="GBP" />
      </div>
    `;
    expect(extractFromMicrodata(html)).toEqual({
      price: 128.5,
      currency: 'GBP',
    });
  });

  it('returns null when no price is found', () => {
    expect(extractFromMicrodata('no prices here')).toEqual({
      price: null,
      currency: null,
    });
  });

  it('returns null currency when only price is present', () => {
    expect(
      extractFromMicrodata(`<meta itemprop="price" content="99.00" />`),
    ).toEqual({ price: 99, currency: null });
  });

  it('rejects 0.00 placeholder prices', () => {
    expect(
      extractFromMicrodata(
        `<meta itemprop="price" content="0.00" /><meta itemprop="priceCurrency" content="USD" />`,
      ),
    ).toEqual({ price: null, currency: null });
  });

  it('ignores stray "$N" body copy (not a meta itemprop)', () => {
    expect(
      extractFromMicrodata('Now on sale, price $128.50 with free shipping'),
    ).toEqual({ price: null, currency: null });
  });
});

describe('scoreAndRankImages', () => {
  const base = 'https://shop.example.com/p/bag';

  it('drops logos, payment-method icons, swatches, and SVGs', () => {
    const out = scoreAndRankImages(
      base,
      [
        {
          tag: 'img',
          score: 1,
          urls: [
            'https://cdn.test/static/logo.png',
            'https://cdn.test/static/visa.png',
            'https://cdn.test/static/klarna-badge.png',
            'https://cdn.test/static/color-swatch-blue.jpg',
            'https://cdn.test/static/icon-cart.png',
            'https://cdn.test/static/loading-spinner.gif',
            'https://cdn.test/icons/share.svg',
            'https://cdn.test/products/bag-hero.jpg',
          ],
        },
      ],
      [],
      12,
    );
    expect(out).toEqual(['https://cdn.test/products/bag-hero.jpg']);
  });

  it('ranks JSON-LD ∩ og:image highest, then og, then img', () => {
    const out = scoreAndRankImages(
      base,
      [
        {
          tag: 'jsonld',
          score: 4,
          urls: [
            'https://cdn.test/products/canonical.jpg',
            'https://cdn.test/products/jsonld-only.jpg',
          ],
        },
        {
          tag: 'og',
          score: 2,
          urls: [
            'https://cdn.test/products/canonical.jpg',
            'https://cdn.test/products/og-only.jpg',
          ],
        },
        {
          tag: 'img',
          score: 1,
          urls: [
            'https://cdn.test/products/img-only.jpg',
            'https://cdn.test/products/canonical.jpg',
          ],
        },
      ],
      [],
      12,
    );
    // canonical (jsonld + og + img) → 7, jsonld-only → 4, og-only → 2,
    // img-only → 1.
    expect(out).toEqual([
      'https://cdn.test/products/canonical.jpg',
      'https://cdn.test/products/jsonld-only.jpg',
      'https://cdn.test/products/og-only.jpg',
      'https://cdn.test/products/img-only.jpg',
    ]);
  });

  it('caps output at the requested limit', () => {
    const urls = Array.from(
      { length: 20 },
      (_, i) => `https://cdn.test/products/p${i}.jpg`,
    );
    const out = scoreAndRankImages(
      base,
      [{ tag: 'jsonld', score: 4, urls }],
      [],
      5,
    );
    expect(out).toHaveLength(5);
  });

  it('falls back to ambientImages when no real candidates survive', () => {
    const out = scoreAndRankImages(
      base,
      [
        {
          tag: 'jsonld',
          score: 4,
          urls: ['https://cdn.test/icons/share.svg'],
        },
      ],
      ['https://cdn.test/fallback/photo.jpg'],
      12,
    );
    expect(out).toEqual(['https://cdn.test/fallback/photo.jpg']);
  });

  it('upgrades http origins to https and dedupes against https-on-same-path', () => {
    const out = scoreAndRankImages(
      base,
      [
        {
          tag: 'jsonld',
          score: 4,
          urls: [
            'http://cdn.test/products/bag.jpg',
            'https://cdn.test/products/bag.jpg',
          ],
        },
      ],
      [],
      12,
    );
    expect(out).toEqual(['https://cdn.test/products/bag.jpg']);
  });

  it('rewards high-res hints in the URL path', () => {
    const out = scoreAndRankImages(
      base,
      [
        {
          tag: 'og',
          score: 2,
          urls: [
            'https://cdn.test/products/w_400/bag.jpg',
            'https://cdn.test/products/w_2048/other.jpg',
          ],
        },
      ],
      [],
      12,
    );
    // w_2048 → +1 bonus, w_400 → none. Other wins.
    expect(out[0]).toBe('https://cdn.test/products/w_2048/other.jpg');
  });
});

describe('intersectWithClaude', () => {
  const base = 'https://shop.example.com/p/x';

  it('keeps only pool URLs Claude also surfaced (when ≥ 2 overlap)', () => {
    const pool = [
      'https://cdn.test/p/a.jpg',
      'https://cdn.test/p/b.jpg',
      'https://cdn.test/p/c.jpg',
    ];
    const claude = [
      'https://cdn.test/p/a.jpg',
      'https://cdn.test/p/c.jpg',
      'https://cdn.test/p/d.jpg', // not in pool
    ];
    expect(intersectWithClaude(base, pool, claude)).toEqual([
      'https://cdn.test/p/a.jpg',
      'https://cdn.test/p/c.jpg',
    ]);
  });

  it('returns the original pool when fewer than 2 URLs overlap (Claude likely confused)', () => {
    const pool = [
      'https://cdn.test/p/a.jpg',
      'https://cdn.test/p/b.jpg',
      'https://cdn.test/p/c.jpg',
    ];
    const claude = ['https://cdn.test/p/d.jpg'];
    expect(intersectWithClaude(base, pool, claude)).toEqual(pool);
  });

  it('intersects across normalized variants (Shopify size suffix)', () => {
    const pool = ['https://cdn.shopify.com/files/X_2048x.jpg'];
    const claude = [
      'https://cdn.shopify.com/files/X_300x300.jpg',
      'https://cdn.shopify.com/files/Y_2048x.jpg',
    ];
    // pool[0] normalizes to X_2048x; claude's X_300x300 also normalizes to
    // X_2048x → overlap = 1 → returns original pool (below threshold).
    expect(intersectWithClaude(base, pool, claude)).toEqual(pool);
  });

  it('returns pool unchanged when Claude returned no URLs', () => {
    const pool = ['https://cdn.test/p/a.jpg'];
    expect(intersectWithClaude(base, pool, [])).toEqual(pool);
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

// SSENSE-style page: og:image and JSON-LD each have only 1 URL (the _1
// shot); the rest of the gallery lives in <img srcset>. Verify that scoring
// + template-rebuild merges in all 4 distinct shots.
describe('SSENSE-shaped page', () => {
  it('yields all distinct product shots after scoring + rebuild', async () => {
    const html = `
      <meta property="og:image" content="https://img.ssensemedia.com/images/w_640/SKU_1/p.jpg">
      <script type="application/ld+json">{"@type":"Product","image":"https://img.ssensemedia.com/images/__IMAGE_PARAMS__/SKU_1/p.jpg"}</script>
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_1/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_1/p.jpg 1920w">
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_2/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_2/p.jpg 1920w">
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_3/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_3/p.jpg 1920w">
      <img srcset="https://img.ssensemedia.com/images/w_256/SKU_4/p.jpg 256w, https://img.ssensemedia.com/images/w_1920/SKU_4/p.jpg 1920w">
    `;
    const parsed = await parseHtml(html);
    const jsonLd = extractFromJsonLd(
      parsed.jsonLdScripts,
      'https://www.ssense.com/x',
    );
    const og = parsed.ogImages[0];
    const rebuilt = extractTemplateImageUrls(html)
      .map((t) => rebuildFromReference(t, og))
      .filter((u): u is string => u !== null);
    const ranked = scoreAndRankImages(
      'https://www.ssense.com/x',
      [
        { tag: 'jsonld', score: 4, urls: jsonLd.productImages },
        { tag: 'og', score: 2, urls: parsed.ogImages },
        { tag: 'rebuilt', score: 3, urls: rebuilt },
        { tag: 'img', score: 1, urls: parsed.imgTagImages },
      ],
      jsonLd.ambientImages,
      12,
    ).filter((u) => !/__[A-Z][A-Z0-9_]*__/.test(u));
    const skuCount = ranked.filter((u) => /\/SKU_\d\//.test(u)).length;
    expect(skuCount).toBe(4);
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
