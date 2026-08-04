import { env } from '@/config/env';
import { AnthropicGenerationProvider } from '@/services/ai/providers/anthropicGeneration';
import { OpenAIGenerationProvider } from '@/services/ai/providers/openaiGeneration';
import { getProviderTelemetry, recordGenerationFailure, recordGenerationSuccess } from '@/services/ai/telemetry';
import { AIGenerationError, type GenerationProvider, type GenerationRequest, type GenerationResult } from '@/services/ai/types';

const anthropicProvider = new AnthropicGenerationProvider();
const openaiProvider = new OpenAIGenerationProvider();

function generationProviderChain(): GenerationProvider[] {
  const chain: GenerationProvider[] = [];
  if (env.ANTHROPIC_API_KEY) chain.push(anthropicProvider);
  if (env.OPENAI_API_KEY) chain.push(openaiProvider);
  return chain;
}

/**
 * Single entry point for every text-generation call in the application.
 * Application services must not instantiate a vendor SDK directly — call
 * this instead. Anthropic is always tried first; OpenAI is a transitional
 * fallback only (see openaiGeneration.ts) and every fallback use is logged
 * and recorded in telemetry, never silent.
 */
export async function generateText(request: GenerationRequest): Promise<GenerationResult> {
  const chain = generationProviderChain();
  if (chain.length === 0) {
    throw new AIGenerationError(
      'No generation provider is configured (set ANTHROPIC_API_KEY).',
      'gateway',
      false,
    );
  }

  let lastError: unknown;
  for (const provider of chain) {
    try {
      const result = await provider.generate(request);
      recordGenerationSuccess({
        provider: result.provider,
        latencyMs: result.latencyMs,
        retries: result.retries,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      if (provider !== anthropicProvider) {
        console.warn(`[ai-gateway] generation served by fallback provider "${provider.name}" instead of Anthropic`);
      }
      return result;
    } catch (error) {
      recordGenerationFailure({ provider: provider.name, error });
      console.warn(`[ai-gateway] provider "${provider.name}" failed`, error);
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AIGenerationError('All generation providers failed', 'gateway', false, lastError);
}

export function generationGatewayStatus() {
  const chain = generationProviderChain();
  return {
    primaryProvider: anthropicProvider.name,
    configured: chain.map((provider) => provider.name),
    telemetry: chain.map((provider) => getProviderTelemetry(provider.name)).filter(Boolean),
  };
}
