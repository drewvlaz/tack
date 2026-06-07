type ClaudeResponse = { content: Array<{ text: string }> };

const DEFAULT_MAX_TOKENS = 1024;

export type ClaudeMessageOptions = {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
};

export async function callClaude(
  apiKey: string,
  { model, system, user, maxTokens = DEFAULT_MAX_TOKENS }: ClaudeMessageOptions,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API error: ${res.status}`);
  }

  const data = await res.json<ClaudeResponse>();
  return data.content[0]?.text ?? '';
}
