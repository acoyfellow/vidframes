export interface AICredentials {
  accountId: string;
  apiToken: string;
}

export function getCredentials(opts?: {
  accountId?: string;
  apiToken?: string;
}): AICredentials {
  const accountId = opts?.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = opts?.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error(
      'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. Set as env vars or pass explicitly.',
    );
  }
  return { accountId, apiToken };
}

export async function runModel(
  model: string,
  input: unknown,
  creds: AICredentials,
): Promise<unknown> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/${model}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Workers AI ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { success: boolean; errors?: unknown; result?: unknown };
  if (!data.success) {
    throw new Error(`Workers AI error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

export const VISION_MODELS = {
  'llava-1.5-alpha': '@cf/llava-1.5-alpha-v1-hf',
  'llama-3.2-11b-vision': '@cf/meta/llama-3.2-11b-vision-instruct',
  'llama-3.2-90b-vision': '@cf/meta/llama-3.2-90b-vision-instruct',
} as const;

export const TRANSCRIPTION_MODELS = {
  whisper: '@cf/openai/whisper',
  'whisper-large': '@cf/openai/whisper-large-v3-turbo',
} as const;
