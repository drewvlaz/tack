import { describe, expect, it } from 'vitest';
import { ParseResultSchema, ParseWarningSchema } from '../../src/schemas/parse';

const baseResult = {
  title: 'Linen Overshirt',
  brand: 'LEMAIRE',
  description: null,
  price: 850,
  details: [],
  images: [],
};

describe('ParseResultSchema warnings', () => {
  it('accepts an empty warnings array', () => {
    expect(() =>
      ParseResultSchema.parse({ ...baseResult, warnings: [] }),
    ).not.toThrow();
  });

  it('accepts each known warning code', () => {
    for (const w of [
      'claude_failed',
      'image_fetch_failed',
      'no_images',
    ] as const) {
      expect(() =>
        ParseResultSchema.parse({ ...baseResult, warnings: [w] }),
      ).not.toThrow();
    }
  });

  it('rejects unknown warning codes', () => {
    expect(() =>
      ParseResultSchema.parse({
        ...baseResult,
        warnings: ['something_else'],
      }),
    ).toThrow();
  });

  it('requires warnings to be present', () => {
    expect(() => ParseResultSchema.parse(baseResult)).toThrow();
  });
});

describe('ParseWarningSchema', () => {
  it('enumerates exactly the expected codes', () => {
    // Sentinel: if a future PR adds a code, this should fail and force the
    // frontend to handle it too.
    expect(ParseWarningSchema.options).toEqual([
      'claude_failed',
      'image_fetch_failed',
      'no_images',
    ]);
  });
});
