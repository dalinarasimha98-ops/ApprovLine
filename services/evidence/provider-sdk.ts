import type {
  EvidenceProviderContext,
  EvidenceProviderHealthResult,
  EvidenceProviderManifest,
  EvidenceProviderPlugin,
} from '@/types/evidence';

const providerRegistry = new Map<string, EvidenceProviderPlugin>();

export function normalizeProviderKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_').slice(0, 80);
}

export function registerEvidenceProvider(provider: EvidenceProviderPlugin) {
  const key = normalizeProviderKey(provider.manifest.key);
  if (!key) throw new Error('Evidence provider key is required.');
  providerRegistry.set(key, provider);
  return provider;
}

export function getEvidenceProvider(providerKey: string) {
  return providerRegistry.get(normalizeProviderKey(providerKey));
}

export function listRegisteredEvidenceProviders() {
  return [...providerRegistry.values()].map((provider) => provider.manifest);
}

export abstract class BaseEvidenceProvider<TAuthentication = unknown, TProviderEvent = unknown>
implements EvidenceProviderPlugin<TAuthentication, TProviderEvent> {
  abstract manifest: EvidenceProviderManifest;
  abstract Authenticate(context: EvidenceProviderContext, input: TAuthentication): Promise<Record<string, unknown>>;
  abstract Subscribe(context: EvidenceProviderContext): Promise<Record<string, unknown>>;
  abstract Fetch(
    context: EvidenceProviderContext,
    cursor?: string,
  ): Promise<{ events: TProviderEvent[]; cursor?: string }>;
  abstract Normalize(event: TProviderEvent, context: EvidenceProviderContext): Promise<import('@/types/evidence').CanonicalEvidenceInput>;
  abstract HealthCheck(context: EvidenceProviderContext): Promise<EvidenceProviderHealthResult>;
  abstract Disconnect(context: EvidenceProviderContext): Promise<void>;
}
