import OpenAI from 'openai';
import { env } from '@/config/env';
import { AIGenerationError, type GenerationProvider, type GenerationRequest, type GenerationResult } from '@/services/ai/types';

export const OPENAI_MODEL = 'gpt-4.1-mini';

/**
 * Transitional fallback provider only. Retained until Anthropic-only
 * generation is fully validated in production (see the approved migration
 * plan in PROJECT_MEMORY.md, Phase 4) — do not build new features against
 * this provider, and do not add an OpenAI-specific embeddings equivalent
 * here; embeddings are a separate capability (see Phase 2/3).
 */
export class OpenAIGenerationProvider implements GenerationProvider {
  readonly name = 'openai';

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (!env.OPENAI_API_KEY) {
      throw new AIGenerationError('OPENAI_API_KEY is not configured', this.name, false);
    }

    const startedAt = Date.now();
    try {
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      });

      const text = completion.choices[0]?.message.content;
      if (!text) {
        throw new AIGenerationError('OpenAI returned an empty response', this.name, false);
      }

      return {
        text,
        provider: this.name,
        model: OPENAI_MODEL,
        latencyMs: Date.now() - startedAt,
        retries: 0,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      };
    } catch (error) {
      if (error instanceof AIGenerationError) throw error;
      throw new AIGenerationError('OpenAI request failed', this.name, true, error);
    }
  }
}
