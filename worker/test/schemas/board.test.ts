import { describe, expect, it } from 'vitest';
import { AddItemBody, PatchBoardItemBody } from '../../src/schemas/board';

describe('PatchBoardItemBody', () => {
  it('accepts ordinary numeric coordinates', () => {
    expect(() =>
      PatchBoardItemBody.parse({
        x: 12,
        y: -3.5,
        width: 200,
        height: 280,
        zIndex: 4,
      }),
    ).not.toThrow();
  });

  it('rejects NaN and Infinity for x/y', () => {
    expect(() => PatchBoardItemBody.parse({ x: NaN })).toThrow();
    expect(() => PatchBoardItemBody.parse({ y: Infinity })).toThrow();
    expect(() => PatchBoardItemBody.parse({ x: -Infinity })).toThrow();
  });

  it('rejects non-positive width and height', () => {
    expect(() => PatchBoardItemBody.parse({ width: 0 })).toThrow();
    expect(() => PatchBoardItemBody.parse({ height: -1 })).toThrow();
  });

  it('rejects non-integer zIndex', () => {
    expect(() => PatchBoardItemBody.parse({ zIndex: 1.5 })).toThrow();
  });
});

describe('AddItemBody.sourceUrl', () => {
  const base = {
    title: null,
    brand: null,
    description: null,
    price: null,
    details: [],
    images: [],
    x: 0,
    y: 0,
  };

  it('rejects file: and data: schemes', () => {
    expect(() =>
      AddItemBody.parse({ ...base, sourceUrl: 'file:///etc/passwd' }),
    ).toThrow();
    expect(() =>
      AddItemBody.parse({ ...base, sourceUrl: 'data:text/html,<script>' }),
    ).toThrow();
  });

  it('rejects private IP literals', () => {
    expect(() =>
      AddItemBody.parse({ ...base, sourceUrl: 'http://169.254.169.254/' }),
    ).toThrow();
    expect(() =>
      AddItemBody.parse({ ...base, sourceUrl: 'http://10.0.0.1/' }),
    ).toThrow();
  });

  it('accepts a normal https product URL', () => {
    expect(() =>
      AddItemBody.parse({
        ...base,
        sourceUrl: 'https://lemaire.fr/products/x',
      }),
    ).not.toThrow();
  });
});
