type ClaudeResponse = { content: Array<{ text: string }> };

const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_VERSION = '2023-06-01';

// Retry on transient upstream failures only — 5xx and 429. 4xx (bad key,
// invalid model) won't get better with retries.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 400;

export type ClaudeCacheControl = { type: 'ephemeral' };

export type ClaudeMessageOptions = {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  // Enables prompt caching on the system block. The system prompt is identical
  // across calls, so caching it shaves both latency and token cost. Default on.
  cacheSystem?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callClaude(
  apiKey: string,
  {
    model,
    system,
    user,
    maxTokens = DEFAULT_MAX_TOKENS,
    cacheSystem = true,
  }: ClaudeMessageOptions,
): Promise<string> {
  const systemBlocks = cacheSystem
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages: [{ role: 'user', content: user }],
  });

  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body,
    });

    if (res.ok) {
      const data = await res.json<ClaudeResponse>();
      const text = data.content[0]?.text;
      if (!text) {
        throw new Error('Claude returned empty content');
      }
      return text;
    }

    lastStatus = res.status;
    if (!RETRYABLE_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Claude API error: ${res.status}`);
    }
    await sleep(BACKOFF_MS * 2 ** (attempt - 1));
  }

  throw new Error(`Claude API error: ${lastStatus}`);
}
