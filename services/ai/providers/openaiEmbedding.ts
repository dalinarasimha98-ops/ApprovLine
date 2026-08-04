import OpenAI from 'openai';
import { env } from '@/config/env';
import { AIEmbeddingError, type EmbeddingKind, type EmbeddingProvider, type EmbeddingVector } from '@/services/ai/embeddings';

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_EMBEDDING_DIMENSIONS = 96;

/**
 * Legacy provider. Every PlaybookChunk row embedded before the Voyage
 * migration used this model (or, on failure, a non-semantic local hash —
 * see the migration data backfill note in
 * prisma/migrations/20260804120000_playbook_chunk_embedding_metadata).
 * Retained only for attribution and as a concrete rollback target (see the
 * approved migration plan's rollback section) — the embedding gateway does
 * not select this provider automatically.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model = OPENAI_EMBEDDING_MODEL;
  readonly version = 'legacy';
  readonly dimensions = OPENAI_EMBEDDING_DIMENSIONS;

  async embed(text: string, _kind: EmbeddingKind): Promise<EmbeddingVector> {
    void _kind; // OpenAI's embeddings API has no query/document distinction, unlike Voyage's.
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIEmbeddingError('OPENAI_API_KEY is not configured', this.name);
    }

    const startedAt = Date.now();
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
      model: this.model,
      input: text.slice(0, 8000),
      dimensions: this.dimensions,
    });

    const vector = response.data[0]?.embedding;
    if (!vector) {
      throw new AIEmbeddingError('OpenAI returned no embedding vector', this.name);
    }

    return {
      vector,
      provider: this.name,
      model: this.model,
      version: this.version,
      dimensions: vector.length,
      latencyMs: Date.now() - startedAt,
      totalTokens: response.usage?.total_tokens,
    };
  }
}
