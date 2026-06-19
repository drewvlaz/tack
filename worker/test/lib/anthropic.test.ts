import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callClaude } from '../../src/lib/anthropic';

const originalFetch = globalThis.fetch;

const OK_BODY = JSON.stringify({ content: [{ text: 'pong' }] });
const okResponse = () => new Response(OK_BODY, { status: 200 });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

function stubFetch(responses: Array<() => Response>): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = vi.fn(() => {
    const next = responses[state.calls++];
    if (!next) {
      throw new Error('fetch called more times than stubbed');
    }
    return Promise.resolve(next());
  }) as typeof fetch;
  return state;
}

const args = { model: 'haiku', system: 'sys', user: 'usr' };

describe('callClaude', () => {
  it('returns content text on a 200', async () => {
    stubFetch([okResponse]);
    expect(await callClaude('key', args)).toBe('pong');
  });

  it('retries on 429 and succeeds', async () => {
    const state = stubFetch([
      () => new Response('busy', { status: 429 }),
      okResponse,
    ]);
    expect(await callClaude('key', args)).toBe('pong');
    expect(state.calls).toBe(2);
  });

  it('retries on 5xx and succeeds', async () => {
    const state = stubFetch([
      () => new Response('boom', { status: 503 }),
      () => new Response('boom', { status: 502 }),
      okResponse,
    ]);
    expect(await callClaude('key', args)).toBe('pong');
    expect(state.calls).toBe(3);
  });

  it('does not retry on 4xx', async () => {
    const state = stubFetch([() => new Response('bad key', { status: 401 })]);
    await expect(callClaude('key', args)).rejects.toThrow(/401/);
    expect(state.calls).toBe(1);
  });

  it('gives up after MAX_ATTEMPTS retryable failures', async () => {
    const state = stubFetch([
      () => new Response('busy', { status: 429 }),
      () => new Response('busy', { status: 429 }),
      () => new Response('busy', { status: 429 }),
    ]);
    await expect(callClaude('key', args)).rejects.toThrow(/429/);
    expect(state.calls).toBe(3);
  });

  it('throws when content is empty', async () => {
    stubFetch([
      () =>
        new Response(JSON.stringify({ content: [{ text: '' }] }), {
          status: 200,
        }),
    ]);
    await expect(callClaude('key', args)).rejects.toThrow(/empty/);
  });
});
