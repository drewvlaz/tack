import { describe, expect, it } from 'vitest';
import { b64uDecode, b64uEncode } from '../../src/lib/b64url';

describe('b64url', () => {
  it('round-trips random bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const out = b64uDecode(b64uEncode(bytes));
    expect(out).toEqual(bytes);
  });

  it('produces URL-safe output with no padding', () => {
    // 0xFB 0xEF produce '+' / '/' in stock base64; check they get rewritten
    // and the trailing '=' is stripped.
    const encoded = b64uEncode(new Uint8Array([0xfb, 0xef, 0xff]));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('round-trips all byte-length residues mod 4', () => {
    // base64 padding behavior changes by length % 3. Cover 0, 1, 2.
    for (const n of [0, 1, 2, 3, 4, 5, 16]) {
      const bytes = new Uint8Array(n).map((_, i) => i + 1);
      expect(b64uDecode(b64uEncode(bytes))).toEqual(bytes);
    }
  });

  it('decodes a known fixture', () => {
    // 'Hello' in base64url is 'SGVsbG8' (no padding).
    expect(b64uDecode('SGVsbG8')).toEqual(new TextEncoder().encode('Hello'));
  });
});
