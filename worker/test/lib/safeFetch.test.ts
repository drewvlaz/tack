import { describe, expect, it } from 'vitest';
import {
  checkSafeUrl,
  isSafeUrl,
  safeFetch,
  UnsafeUrlError,
} from '../../src/lib/safeFetch';

describe('checkSafeUrl', () => {
  it('rejects malformed URLs', () => {
    const r = checkSafeUrl('not a url');
    expect(r.ok).toBe(false);
  });

  it('rejects non-http(s) schemes', () => {
    expect(checkSafeUrl('file:///etc/passwd').ok).toBe(false);
    expect(checkSafeUrl('data:text/html,<script>').ok).toBe(false);
    expect(checkSafeUrl('ftp://example.com').ok).toBe(false);
    expect(checkSafeUrl('javascript:alert(1)').ok).toBe(false);
  });

  it('rejects loopback and metadata hostnames', () => {
    expect(isSafeUrl('http://localhost/x')).toBe(false);
    expect(isSafeUrl('http://0.0.0.0/x')).toBe(false);
    expect(isSafeUrl('http://metadata.google.internal/x')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1/x')).toBe(false);
    expect(isSafeUrl('http://127.1.2.3/x')).toBe(false);
  });

  it('rejects RFC1918 private ranges', () => {
    expect(isSafeUrl('http://10.0.0.1/x')).toBe(false);
    expect(isSafeUrl('http://172.16.0.1/x')).toBe(false);
    expect(isSafeUrl('http://172.31.255.255/x')).toBe(false);
    expect(isSafeUrl('http://192.168.1.1/x')).toBe(false);
  });

  it('rejects link-local and metadata IPv4 (169.254/16)', () => {
    expect(isSafeUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSafeUrl('http://169.254.1.1/x')).toBe(false);
  });

  it('rejects IPv6 loopback and ULA', () => {
    expect(isSafeUrl('http://[::1]/x')).toBe(false);
    expect(isSafeUrl('http://[fc00::1]/x')).toBe(false);
    expect(isSafeUrl('http://[fd00::1]/x')).toBe(false);
    expect(isSafeUrl('http://[fe80::1]/x')).toBe(false);
  });

  it('does not reject 172.x outside 172.16/12', () => {
    expect(isSafeUrl('https://172.15.0.1/x')).toBe(true);
    expect(isSafeUrl('https://172.32.0.1/x')).toBe(true);
  });

  it('allows public hosts and product-page-shaped URLs', () => {
    expect(isSafeUrl('https://lemaire.fr/products/blouson')).toBe(true);
    expect(isSafeUrl('https://www.ssense.com/en-us/men/product/123')).toBe(
      true,
    );
    expect(isSafeUrl('http://example.com/path?q=1#anchor')).toBe(true);
  });
});

describe('safeFetch', () => {
  it('throws UnsafeUrlError synchronously-by-rejection for blocked URLs', async () => {
    await expect(safeFetch('http://127.0.0.1/x')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(safeFetch('file:///etc/hosts')).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
  });

  it('aborts on timeout', async () => {
    // A request that the test runner cannot actually complete; we just need
    // to confirm the abort fires. Use a very short timeout against a host
    // that won't answer immediately. A network-failure-shaped rejection is
    // also acceptable — what we care about is that we don't hang.
    await expect(
      safeFetch('https://example.com/', { timeoutMs: 1 }),
    ).rejects.toBeDefined();
  }, 5_000);
});
