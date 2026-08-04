import { env } from '@/config/env';
import { AIEmbeddingError, type EmbeddingKind, type EmbeddingProvider, type EmbeddingVector } from '@/services/ai/embeddings';

const DEFAULT_VOYAGE_MODEL = 'voyage-4';
// Bumped whenever the request shape or model default changes, so stored
// PlaybookChunk.embeddingVersion values can be compared without guessing.
const VOYAGE_EMBEDDING_VERSION = '2026-08-voyage-4';
const VOYAGE_DIMENSIONS = 1024; // voyage-4's documented default; no truncation requested.
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number) {
  return status === 429 || status >= 500;
}

/**
 * Anthropic does not offer its own embeddings endpoint and documents Voyage
 * AI as its recommended provider (see the approved migration plan). This is
 * the sole embedding provider selected by services/ai/embeddingGateway.ts;
 * there is intentionally no automatic fallback to another provider or to a
 * heuristic vector — see that file's docstring.
 */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'voyage';
  readonly model = env.VOYAGE_EMBEDDING_MODEL ?? DEFAULT_VOYAGE_MODEL;
  readonly version = VOYAGE_EMBEDDING_VERSION;
  readonly dimensions = VOYAGE_DIMENSIONS;

  async embed(text: string, kind: EmbeddingKind): Promise<EmbeddingVector> {
    const apiKey = env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new AIEmbeddingError('VOYAGE_API_KEY is not configured', this.name);
    }

    const startedAt = Date.now();
    let attempt = 0;

    while (true) {
      let response: Response;
      try {
        response = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            input: [text.slice(0, 32000)],
            model: this.model,
            input_type: kind,
          }),
        });
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          attempt += 1;
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new AIEmbeddingError('Voyage embeddings request failed (network error)', this.name, error);
      }

      if (isTransientStatus(response.status) && attempt < MAX_RETRIES) {
        attempt += 1;
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.detail ?? payload?.error?.message ?? `Voyage request failed with status ${response.status}`;
        throw new AIEmbeddingError(message, this.name);
      }

      const vector = payload?.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new AIEmbeddingError('Voyage returned no embedding vector', this.name);
      }

      return {
        vector,
        provider: this.name,
        model: this.model,
        version: this.version,
        dimensions: vector.length,
        latencyMs: Date.now() - startedAt,
        totalTokens: payload?.usage?.total_tokens,
      };
    }
  }
}
