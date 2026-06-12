import { describe, expect, it } from 'vitest';
import { mergeSelection } from '../../src/services/parser';
import {
  extractCandidates,
  pickDefaultImages,
  type StaticExtract,
} from '../../src/services/parser/candidates';
import {
  buildEvidence,
  normalizeIndices,
  type ClaudeSelection,
} from '../../src/services/parser/claude';
import { fixtures } from './fixtures';
import { formatScorecard, scoreImages, scoreMeta } from './score';

const baseExtract = (over: Partial<StaticExtract> = {}): StaticExtract => ({
  title: null,
  docTitle: null,
  brand: null,
  description: null,
  price: null,
  currency: null,
  productNode: null,
  candidates: [],
  priceSignals: [],
  requestedVariant: null,
  ...over,
});

const baseSelection = (
  over: Partial<ClaudeSelection> = {},
): ClaudeSelection => ({
  title: null,
  brand: null,
  description: null,
  price: null,
  currency: null,
  imageIndices: [],
  details: [],
  ...over,
});

describe('extractCandidates', () => {
  const url = 'https://shop.example.com/products/bag';

  it('combines structured data and penalizes suspect-section images', async () => {
    const html = `
      <meta property="og:title" content="Canvas Tote">
      <meta property="og:site_name" content="Example Shop">
      <meta property="og:image" content="https://cdn.test/products/tote-hero.jpg">
      <script type="application/ld+json">
        {"@type":"Product","image":["https://cdn.test/products/tote-hero.jpg","https://cdn.test/products/tote-side.jpg"],"offers":{"@type":"Offer","price":"120.00","priceCurrency":"USD"}}
      </script>
      <img src="https://cdn.test/products/tote-detail.jpg">
      <div class="related-products">
        <img src="https://cdn.test/products/other-bag.jpg">
      </div>
    `;
    const out = await extractCandidates(html, url);
    expect(out.title).toBe('Canvas Tote');
    expect(out.brand).toBe('Example Shop');
    expect(out.price).toBe(120);
    expect(out.currency).toBe('USD');
    expect(out.productNode).not.toBeNull();

    const byUrl = new Map(out.candidates.map((c) => [c.url, c]));
    expect(byUrl.get('https://cdn.test/products/tote-hero.jpg')!.score).toBe(
      // jsonld 4 + og 2 + script-samedir 2 (the raw scan also sees the URL
      // inside the JSON-LD script body)
      8,
    );
    expect(
      byUrl.get('https://cdn.test/products/other-bag.jpg')!.score,
    ).toBeLessThan(0);

    const picked = pickDefaultImages(out.candidates, 12);
    expect(picked).not.toContain('https://cdn.test/products/other-bag.jpg');
    expect(picked).toContain('https://cdn.test/products/tote-hero.jpg');
  });

  it('keeps off-host img candidates at zero score instead of dropping them', async () => {
    const html = `
      <meta property="og:image" content="https://cdn-a.test/products/hero.jpg">
      <img src="https://cdn-b.test/products/gallery-2.jpg">
    `;
    const out = await extractCandidates(html, url);
    const offHost = out.candidates.find((c) =>
      c.url.includes('cdn-b.test/products/gallery-2.jpg'),
    );
    expect(offHost).toBeDefined();
    expect(offHost!.score).toBe(0);
    expect(offHost!.tags).toContain('img-offhost');
  });

  it('drops placeholder-template URLs from candidates', async () => {
    const html = `
      <script type="application/ld+json">
        {"@type":"Product","image":"https://cdn.test/upload/__IMAGE_PARAMS__/SKU_1.jpg"}
      </script>
    `;
    const out = await extractCandidates(html, url);
    expect(out.candidates).toEqual([]);
  });

  it('penalizes default-variant images when URL requests a specific variant', async () => {
    // Page exposes per-color galleries. URL asks for ?color=cream, but
    // og:image AND JSON-LD both point at the default (navy) variant — they
    // also appear in the navy data-color container, so the variant-mismatch
    // signal correctly demotes them below the cream candidates.
    const html = `
      <meta property="og:image" content="https://cdn.test/products/navy-hero.jpg">
      <script type="application/ld+json">
        {"@type":"Product","image":"https://cdn.test/products/navy-hero.jpg"}
      </script>
      <div data-color="navy">
        <img src="https://cdn.test/products/navy-hero.jpg">
        <img src="https://cdn.test/products/navy-back.jpg">
      </div>
      <div data-color="cream">
        <img src="https://cdn.test/products/cream-hero.jpg">
        <img src="https://cdn.test/products/cream-back.jpg">
        <img src="https://cdn.test/products/cream-detail.jpg">
      </div>
    `;
    const out = await extractCandidates(
      html,
      'https://shop.example.com/products/shirt?color=cream',
    );
    expect(out.requestedVariant).toEqual({
      attr: 'data-color',
      value: 'cream',
    });
    const picked = pickDefaultImages(out.candidates, 12);
    expect(picked).toEqual([
      'https://cdn.test/products/cream-hero.jpg',
      'https://cdn.test/products/cream-back.jpg',
      'https://cdn.test/products/cream-detail.jpg',
    ]);
  });

  it('falls through cleanly when URL has no variant query', async () => {
    const html = `<img src="https://cdn.test/p/x.jpg">`;
    const out = await extractCandidates(
      html,
      'https://shop.example.com/products/shirt',
    );
    expect(out.requestedVariant).toBeNull();
  });
});

describe('pickDefaultImages', () => {
  it('drops non-positive candidates when 3+ positive ones exist', () => {
    const candidates = [
      { url: 'https://cdn.test/a.jpg', score: 6, tags: ['jsonld', 'og'] },
      { url: 'https://cdn.test/b.jpg', score: 4, tags: ['jsonld'] },
      { url: 'https://cdn.test/c.jpg', score: 1, tags: ['img'] },
      { url: 'https://cdn.test/off.jpg', score: 0, tags: ['img-offhost'] },
      { url: 'https://cdn.test/sus.jpg', score: -3, tags: ['img-suspect'] },
    ];
    expect(pickDefaultImages(candidates, 12)).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
      'https://cdn.test/c.jpg',
    ]);
  });

  it('widens to zero-score candidates when too few are positive', () => {
    const candidates = [
      { url: 'https://cdn.test/a.jpg', score: 2, tags: ['og'] },
      { url: 'https://cdn.test/off.jpg', score: 0, tags: ['img-offhost'] },
      { url: 'https://cdn.test/sus.jpg', score: -3, tags: ['img-suspect'] },
    ];
    expect(pickDefaultImages(candidates, 12)).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/off.jpg',
    ]);
  });

  it('falls back to penalized candidates when nothing else exists', () => {
    const candidates = [
      { url: 'https://cdn.test/sus.jpg', score: -3, tags: ['img-suspect'] },
    ];
    expect(pickDefaultImages(candidates, 12)).toEqual([
      'https://cdn.test/sus.jpg',
    ]);
  });
});

describe('buildEvidence', () => {
  it('includes all evidence sections with numbered candidates', () => {
    const evidence = buildEvidence(
      'https://shop.example.com/p/tote',
      baseExtract({
        title: 'Canvas Tote',
        brand: 'Example Shop',
        price: 120,
        currency: 'USD',
        productNode: { '@type': 'Product', name: 'Canvas Tote' },
        candidates: [
          {
            url: 'https://cdn.test/hero.jpg',
            score: 6,
            tags: ['jsonld', 'og'],
          },
          {
            url: 'https://cdn.test/other.jpg',
            score: -3,
            tags: ['img-suspect'],
          },
        ],
      }),
      '<html><body>Canvas Tote — our heavyweight cotton tote. $120</body></html>',
    );
    expect(evidence).toContain('PAGE_URL: https://shop.example.com/p/tote');
    expect(evidence).toContain('OG_TITLE: Canvas Tote');
    expect(evidence).toContain('STRUCTURED_PRICE: 120 USD');
    expect(evidence).toContain('JSON_LD_PRODUCT:');
    expect(evidence).toContain(
      '[0] https://cdn.test/hero.jpg (sources: jsonld+og)',
    );
    expect(evidence).toContain(
      '[1] https://cdn.test/other.jpg (sources: img-suspect; suspect: related-products section)',
    );
    expect(evidence).toContain('PAGE_TEXT:');
    expect(evidence).toContain('our heavyweight cotton tote');
  });

  it('keeps total size bounded on huge pages', () => {
    const evidence = buildEvidence(
      'https://shop.example.com/p/x',
      baseExtract(),
      `<p>${'word '.repeat(100_000)}</p>`,
    );
    expect(evidence.length).toBeLessThan(50_000);
  });
});

describe('normalizeIndices', () => {
  it('drops out-of-range, duplicate, and non-integer entries', () => {
    expect(normalizeIndices([2, 0, 2, -1, 9, 1.5, '3', null], 5)).toEqual([
      2, 0,
    ]);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeIndices(undefined, 5)).toEqual([]);
    expect(normalizeIndices({}, 5)).toEqual([]);
  });
});

describe('mergeSelection', () => {
  const candidates = [
    { url: 'https://cdn.test/a.jpg', score: 6, tags: ['jsonld', 'og'] },
    { url: 'https://cdn.test/b.jpg', score: 4, tags: ['jsonld'] },
    { url: 'https://cdn.test/c.jpg', score: -3, tags: ['img-suspect'] },
  ];

  it('uses Claude-selected indices in Claude order', () => {
    const meta = mergeSelection(
      baseExtract({ candidates }),
      baseSelection({ imageIndices: [1, 0] }),
    );
    expect(meta.imageUrls).toEqual([
      'https://cdn.test/b.jpg',
      'https://cdn.test/a.jpg',
    ]);
  });

  it('falls back to deterministic pick when Claude selected nothing', () => {
    const meta = mergeSelection(baseExtract({ candidates }), baseSelection());
    expect(meta.imageUrls).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ]);
  });

  it('falls back to deterministic pick when Claude failed entirely', () => {
    const meta = mergeSelection(baseExtract({ candidates }), null);
    expect(meta.imageUrls).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/b.jpg',
    ]);
  });

  it('fills metadata gaps from Claude without overriding og values', () => {
    const meta = mergeSelection(
      baseExtract({ title: 'OG Title', candidates }),
      baseSelection({
        title: 'Claude Title',
        brand: 'Claude Brand',
        description: 'A bag.',
      }),
    );
    expect(meta.title).toBe('OG Title');
    expect(meta.brand).toBe('Claude Brand');
    expect(meta.description).toBe('A bag.');
  });

  it('keeps structured price on small disagreements, prefers Claude on large same-currency ones', () => {
    const small = mergeSelection(
      baseExtract({ price: 100, currency: 'USD', candidates }),
      baseSelection({ price: 102, currency: 'USD' }),
    );
    expect(small.price).toBe(100);

    const large = mergeSelection(
      baseExtract({ price: 100, currency: 'USD', candidates }),
      baseSelection({ price: 70, currency: 'USD' }),
    );
    expect(large.price).toBe(70);

    const crossCurrency = mergeSelection(
      baseExtract({ price: 100, currency: 'USD', candidates }),
      baseSelection({ price: 70, currency: 'GBP' }),
    );
    expect(crossCurrency.price).toBe(100);
  });
});

describe.skipIf(fixtures.length === 0)('fixtures (static extraction)', () => {
  for (const fixture of fixtures) {
    it(`extracts sound candidates from ${fixture.name}`, async () => {
      const extract = await extractCandidates(
        fixture.html,
        fixture.expected.url,
      );
      const meta = mergeSelection(extract, null);

      // Static-stage scorecard: structured price/currency must already be
      // right when the page ships them (Claude only arbitrates), the
      // deterministic image pick must contain the product's shots and
      // exclude related-product SKUs. SPA-only prices are live-eval-only.
      const staticExpected = {
        ...fixture.expected,
        ...(fixture.expected.structuredPrice
          ? {}
          : { price: undefined, currency: undefined }),
        ...(fixture.expected.skipStatic?.includes('title')
          ? { title: undefined }
          : {}),
        ...(fixture.expected.skipStatic?.includes('brand')
          ? { brand: undefined }
          : {}),
      };
      const checks = [
        ...scoreMeta(meta, staticExpected),
        // The full candidate pool must contain every must-match fragment —
        // if discovery misses it, Claude can't select it later.
        ...scoreImages(
          extract.candidates.map((c) => c.url),
          { ...fixture.expected, imageMustNotMatch: [] },
        ).map((c) => ({ ...c, name: `pool: ${c.name}` })),
      ];
      const failed = checks.filter((c) => !c.pass);
      if (failed.length > 0) {
        console.log(formatScorecard(fixture.name, checks));
      }
      expect(failed).toEqual([]);
    });
  }
});
