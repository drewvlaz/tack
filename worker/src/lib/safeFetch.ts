// Defense against SSRF and runaway fetches for any URL that ultimately comes
// from a user-pasted product link. Validates scheme + hostname before issuing
// fetch and aborts on timeout. DNS rebinding is not addressed — that would
// require resolving the hostname ourselves before fetching, which the Workers
// runtime does not expose. Hostname-string checks cover the common attack
// surface (IP literals, known metadata endpoints, loopback).

export class UnsafeUrlError extends Error {
  readonly url: string;
  constructor(reason: string, url: string) {
    super(`Unsafe URL (${reason}): ${url}`);
    this.name = 'UnsafeUrlError';
    this.url = url;
  }
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  'metadata.google.internal',
  'metadata.azure.internal',
]);

const DEFAULT_TIMEOUT_MS = 10_000;

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) {
    return false;
  }

  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local + metadata)
    a === 127 || // 127.0.0.0/8 (loopback)
    a === 0 // 0.0.0.0/8
  );
}

// URL.hostname for an IPv6 literal returns the address lowercase, brackets stripped.
function isPrivateIPv6(host: string): boolean {
  return (
    host === '::1' ||
    host === '::' ||
    host.startsWith('fc') || // ULA fc00::/7
    host.startsWith('fd') || // ULA fc00::/7
    host.startsWith('fe80:') // link-local
  );
}

type SafeUrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkSafeUrl(raw: string): SafeUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'malformed url' };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: `scheme ${url.protocol} not allowed` };
  }

  // URL.hostname keeps IPv6 brackets ('[::1]'); strip them for matching.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    return { ok: false, reason: 'empty host' };
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `host ${host} blocked` };
  }
  if (isPrivateIPv4(host)) {
    return { ok: false, reason: `private ipv4 ${host}` };
  }
  if (isPrivateIPv6(host)) {
    return { ok: false, reason: `private ipv6 ${host}` };
  }

  return { ok: true, url };
}

export function isSafeUrl(raw: string): boolean {
  return checkSafeUrl(raw).ok;
}

export async function safeFetch(
  raw: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const check = checkSafeUrl(raw);
  if (!check.ok) {
    throw new UnsafeUrlError(check.reason, raw);
  }

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    ...rest
  } = init ?? {};
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;

  return fetch(check.url.toString(), { ...rest, signal });
}
