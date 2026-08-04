/**
 * In-memory, per-process telemetry for AI Gateway calls. This resets on
 * every cold start in a serverless deployment (Vercel functions are not
 * long-lived), so it is a point-in-time signal for the current instance —
 * useful for a single readiness snapshot, not a durable cross-instance
 * metrics store. If durable, aggregated observability is needed later,
 * this should be replaced with a persisted store (e.g. a dedicated Prisma
 * model, or forwarding to Sentry as custom measurements) rather than
 * extended in place.
 *
 * Generation and embedding telemetry are kept in separate maps: a provider
 * name like "openai" is used by both an OpenAIGenerationProvider and an
 * OpenAIEmbeddingProvider, and those are different capabilities that must
 * not share counters.
 */
export type ProviderTelemetrySnapshot = {
  provider: string;
  totalCalls: number;
  totalFailures: number;
  totalRetries: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export type EmbeddingTelemetrySnapshot = {
  provider: string;
  totalCalls: number;
  totalFailures: number;
  totalTokens: number;
  lastLatencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

const generationState = new Map<string, ProviderTelemetrySnapshot>();
const embeddingState = new Map<string, EmbeddingTelemetrySnapshot>();

function ensureGeneration(provider: string): ProviderTelemetrySnapshot {
  const existing = generationState.get(provider);
  if (existing) return existing;
  const created: ProviderTelemetrySnapshot = {
    provider,
    totalCalls: 0,
    totalFailures: 0,
    totalRetries: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastLatencyMs: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
  generationState.set(provider, created);
  return created;
}

function ensureEmbedding(provider: string): EmbeddingTelemetrySnapshot {
  const existing = embeddingState.get(provider);
  if (existing) return existing;
  const created: EmbeddingTelemetrySnapshot = {
    provider,
    totalCalls: 0,
    totalFailures: 0,
    totalTokens: 0,
    lastLatencyMs: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
  embeddingState.set(provider, created);
  return created;
}

export function recordGenerationSuccess(input: {
  provider: string;
  latencyMs: number;
  retries: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const entry = ensureGeneration(input.provider);
  entry.totalCalls += 1;
  entry.totalRetries += input.retries;
  entry.totalInputTokens += input.inputTokens ?? 0;
  entry.totalOutputTokens += input.outputTokens ?? 0;
  entry.lastLatencyMs = input.latencyMs;
  entry.lastSuccessAt = new Date().toISOString();
}

export function recordGenerationFailure(input: { provider: string; error: unknown }) {
  const entry = ensureGeneration(input.provider);
  entry.totalCalls += 1;
  entry.totalFailures += 1;
  entry.lastFailureAt = new Date().toISOString();
  entry.lastError = input.error instanceof Error ? input.error.message : 'Unknown AI provider error';
}

export function getProviderTelemetry(provider: string): ProviderTelemetrySnapshot | null {
  return generationState.get(provider) ?? null;
}

export function getAllProviderTelemetry(): ProviderTelemetrySnapshot[] {
  return Array.from(generationState.values());
}

export function recordEmbeddingSuccess(input: { provider: string; latencyMs: number; totalTokens?: number }) {
  const entry = ensureEmbedding(input.provider);
  entry.totalCalls += 1;
  entry.totalTokens += input.totalTokens ?? 0;
  entry.lastLatencyMs = input.latencyMs;
  entry.lastSuccessAt = new Date().toISOString();
}

export function recordEmbeddingFailure(input: { provider: string; error: unknown }) {
  const entry = ensureEmbedding(input.provider);
  entry.totalCalls += 1;
  entry.totalFailures += 1;
  entry.lastFailureAt = new Date().toISOString();
  entry.lastError = input.error instanceof Error ? input.error.message : 'Unknown embedding provider error';
}

export function getEmbeddingProviderTelemetry(provider: string): EmbeddingTelemetrySnapshot | null {
  return embeddingState.get(provider) ?? null;
}

export function getAllEmbeddingTelemetry(): EmbeddingTelemetrySnapshot[] {
  return Array.from(embeddingState.values());
}
