import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../../src/lib/origins';

describe('isAllowedOrigin', () => {
  it('accepts hardcoded dev origins', () => {
    expect(isAllowedOrigin('http://localhost:5173', {})).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5174', {})).toBe(true);
  });

  it('accepts the per-env FRONTEND_ORIGIN', () => {
    const env = { FRONTEND_ORIGIN: 'https://tack-cxk.pages.dev' };
    expect(isAllowedOrigin('https://tack-cxk.pages.dev', env)).toBe(true);
  });

  it('rejects unknown origins', () => {
    expect(isAllowedOrigin('https://evil.example', {})).toBe(false);
    expect(
      isAllowedOrigin('https://evil.pages.dev', {
        FRONTEND_ORIGIN: 'https://tack-cxk.pages.dev',
      }),
    ).toBe(false);
  });

  it('rejects null/undefined/empty origin', () => {
    expect(isAllowedOrigin(null, {})).toBe(false);
    expect(isAllowedOrigin(undefined, {})).toBe(false);
    expect(isAllowedOrigin('', {})).toBe(false);
  });

  it('does not partial-match', () => {
    const env = { FRONTEND_ORIGIN: 'https://tack-cxk.pages.dev' };
    expect(isAllowedOrigin('https://tack-cxk.pages.dev.evil', env)).toBe(false);
    expect(isAllowedOrigin('https://evil.tack-cxk.pages.dev', env)).toBe(false);
  });
});
