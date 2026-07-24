import { z } from 'zod';

const evidenceActorSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  role: z.string().trim().min(1).optional(),
});

const evidenceReferenceSchema = z.object({
  id: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const canonicalEvidenceInputSchema = z.object({
  providerKey: z.string().trim().min(1).max(80),
  providerEventType: z.string().trim().min(1).max(120),
  eventTimestamp: z.string().datetime({ offset: true }).or(z.date()),
  externalEventId: z.string().trim().min(1).max(500).optional(),
  tenantExternalId: z.string().trim().min(1).max(500).optional(),
  actor: evidenceActorSchema.optional(),
  organization: z.object({
    externalId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
  }).optional(),
  object: evidenceReferenceSchema.extend({
    type: z.string().trim().min(1).max(120),
  }),
  threadId: z.string().trim().min(1).max(500).optional(),
  parentId: z.string().trim().min(1).max(500).optional(),
  relatedIds: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  participants: z.array(evidenceActorSchema).max(500).default([]),
  attachments: z.array(evidenceReferenceSchema).max(100).default([]),
  links: z.array(evidenceReferenceSchema).max(100).default([]),
  content: z.string().max(250_000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  rawPayload: z.unknown().optional(),
  confidence: z.number().int().min(0).max(100).default(100),
  correlationId: z.string().trim().min(1).max(200).optional(),
});

export type CanonicalEvidenceInput = z.infer<typeof canonicalEvidenceInputSchema>;

export interface NormalizedEvidenceEvent extends CanonicalEvidenceInput {
  providerKey: string;
  eventTimestamp: Date;
  evidenceHash: string;
  correlationId: string;
  correlationKeys: string[];
  encryptedRawPayload?: string;
}

export type EvidenceProviderCapability =
  | 'AUTHENTICATE'
  | 'SUBSCRIBE'
  | 'FETCH'
  | 'NORMALIZE'
  | 'HEALTH_CHECK'
  | 'DISCONNECT';

export interface EvidenceProviderManifest {
  key: string;
  displayName: string;
  category: 'COMMUNICATION' | 'BUSINESS_SYSTEM' | 'IMPORT' | 'CUSTOM';
  authenticationType: 'OAUTH2' | 'API_KEY' | 'WEBHOOK_SECRET' | 'NONE' | 'CUSTOM';
  capabilities: EvidenceProviderCapability[];
  readOnly: boolean;
  version: string;
}

export interface EvidenceProviderContext {
  organizationId: string;
  connectionId?: string;
  correlationId?: string;
}

export interface EvidenceProviderHealthResult {
  status: 'CONNECTED' | 'SYNCING' | 'DEGRADED' | 'ERROR' | 'REAUTH_REQUIRED' | 'DISCONNECTED';
  authenticationStatus?: string;
  credentialExpiresAt?: Date;
  rateLimitRemaining?: number;
  latencyMs?: number;
  webhookStatus?: string;
  syncStatus?: string;
  lastEventAt?: Date;
  lastSuccessfulSyncAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface EvidenceProviderPlugin<TAuthentication = unknown, TProviderEvent = unknown> {
  manifest: EvidenceProviderManifest;
  Authenticate(context: EvidenceProviderContext, input: TAuthentication): Promise<Record<string, unknown>>;
  Subscribe(context: EvidenceProviderContext): Promise<Record<string, unknown>>;
  Fetch(context: EvidenceProviderContext, cursor?: string): Promise<{ events: TProviderEvent[]; cursor?: string }>;
  Normalize(event: TProviderEvent, context: EvidenceProviderContext): Promise<CanonicalEvidenceInput>;
  HealthCheck(context: EvidenceProviderContext): Promise<EvidenceProviderHealthResult>;
  Disconnect(context: EvidenceProviderContext): Promise<void>;
}
