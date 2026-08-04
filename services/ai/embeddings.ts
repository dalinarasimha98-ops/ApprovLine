export type EmbeddingKind = 'query' | 'document';

export interface EmbeddingVector {
  vector: number[];
  provider: string;
  model: string;
  version: string;
  dimensions: number;
  latencyMs: number;
  totalTokens?: number;
}

export class AIEmbeddingError extends Error {
  constructor(message: string, public readonly provider: string, public cause?: unknown) {
    super(message);
    this.name = 'AIEmbeddingError';
  }
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly version: string;
  readonly dimensions: number;
  embed(text: string, kind: EmbeddingKind): Promise<EmbeddingVector>;
}
