import { env } from '@/config/env';
import { VoyageEmbeddingProvider } from '@/services/ai/providers/voyageEmbedding';
import { getEmbeddingProviderTelemetry, recordEmbeddingFailure, recordEmbeddingSuccess } from '@/services/ai/telemetry';
import { AIEmbeddingError, type EmbeddingKind, type EmbeddingProvider, type EmbeddingVector } from '@/services/ai/embeddings';

const voyageProvider = new VoyageEmbeddingProvider();

function activeEmbeddingProvider(): EmbeddingProvider | null {
  if (env.VOYAGE_API_KEY) return voyageProvider;
  return null;
}

/**
 * Single entry point for every embedding call. Unlike generateText() (which
 * has an intentional, logged fallback tier during the generation
 * migration), embeddings have exactly one deterministic active provider and
 * no fallback chain: if none is configured, or the configured provider
 * fails, this throws rather than substituting a degraded vector. Callers
 * (indexing, search) must let the failure surface — a failed indexing job
 * or a failed search request is the correct, visible outcome; silently
 * returning low-quality results is not. See the approved migration plan,
 * Phase 5 (Enterprise Reliability).
 */
export async function generateEmbedding(text: string, kind: EmbeddingKind): Promise<EmbeddingVector> {
  const provider = activeEmbeddingProvider();
  if (!provider) {
    throw new AIEmbeddingError(
      'No embedding provider is configured (set VOYAGE_API_KEY). Refusing to silently degrade to a non-semantic fallback.',
      'gateway',
    );
  }

  try {
    const result = await provider.embed(text, kind);
    recordEmbeddingSuccess({ provider: result.provider, latencyMs: result.latencyMs, totalTokens: result.totalTokens });
    return result;
  } catch (error) {
    recordEmbeddingFailure({ provider: provider.name, error });
    throw error instanceof AIEmbeddingError ? error : new AIEmbeddingError('Embedding request failed', provider.name, error);
  }
}

export function embeddingGatewayStatus() {
  const provider = activeEmbeddingProvider();
  return {
    activeProvider: provider?.name ?? null,
    activeModel: provider?.model ?? null,
    activeDimensions: provider?.dimensions ?? null,
    telemetry: provider ? getEmbeddingProviderTelemetry(provider.name) : null,
  };
}
