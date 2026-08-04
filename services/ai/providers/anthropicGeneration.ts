import { env } from '@/config/env';
import { AIGenerationError, type GenerationProvider, type GenerationRequest, type GenerationResult } from '@/services/ai/types';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';

const ANTHROPIC_MODEL_FALLBACKS = [
  DEFAULT_ANTHROPIC_MODEL,
  'claude-sonnet-4-5-20250929',
  'claude-3-7-sonnet-latest',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-latest',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-latest',
  'claude-3-5-haiku-20241022',
];

const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;
const DEFAULT_MAX_TOKENS = 1024;

function candidateModels() {
  return Array.from(
    new Set([env.ANTHROPIC_MODEL, ...ANTHROPIC_MODEL_FALLBACKS].filter((model): model is string => Boolean(model))),
  );
}

function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(request: GenerationRequest, model: string, apiKey: string) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: 0,
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
    }),
  });
}

/**
 * Primary generation provider. Tries each candidate model in order (falling
 * through on model-rejection errors only) and retries transient failures
 * (429/5xx/network) with backoff before moving to the next candidate.
 */
export class AnthropicGenerationProvider implements GenerationProvider {
  readonly name = 'anthropic';

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AIGenerationError('ANTHROPIC_API_KEY is not configured', this.name, false);
    }

    const startedAt = Date.now();
    const rejectedModels: string[] = [];
    let retries = 0;

    for (const model of candidateModels()) {
      let attempt = 0;
      let movedToNextModel = false;

      while (!movedToNextModel) {
        let response: Response;
        try {
          response = await requestOnce(request, model, apiKey);
        } catch (error) {
          if (attempt < MAX_TRANSIENT_RETRIES) {
            attempt += 1;
            retries += 1;
            await sleep(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          throw new AIGenerationError('Anthropic request failed (network error)', this.name, true, error);
        }

        if (isTransientStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
          attempt += 1;
          retries += 1;
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message = payload?.error?.message ?? `Anthropic request failed with status ${response.status}`;
          if (/model/i.test(message)) {
            rejectedModels.push(model);
            movedToNextModel = true;
            continue;
          }
          throw new AIGenerationError(message, this.name, isTransientStatus(response.status));
        }

        const text = payload?.content?.find((part: { type?: string }) => part.type === 'text')?.text;
        if (!text) {
          throw new AIGenerationError('Anthropic returned an empty response', this.name, false);
        }

        return {
          text,
          provider: this.name,
          model,
          latencyMs: Date.now() - startedAt,
          retries,
          inputTokens: payload?.usage?.input_tokens,
          outputTokens: payload?.usage?.output_tokens,
        };
      }
    }

    throw new AIGenerationError(
      `Anthropic rejected all configured model IDs: ${rejectedModels.join(', ')}`,
      this.name,
      false,
    );
  }
}
