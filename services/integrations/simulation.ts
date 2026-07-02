import type { IncomingMessageJob } from '@/services/queue/approvalQueue';

export type SimulatedSourcePlatform = 'slack' | 'gmail' | 'outlook' | 'teams' | 'jira' | 'zoom';

export interface SimulatedIncomingMessage {
  source_platform: SimulatedSourcePlatform;
  message: string;
  sender_name?: string;
  sender_email?: string;
  timestamp?: string;
  channel?: string;
  external_id?: string;
}

const providerMap: Record<SimulatedSourcePlatform, IncomingMessageJob['provider']> = {
  slack: 'SLACK',
  gmail: 'GMAIL',
  outlook: 'OUTLOOK',
  teams: 'MICROSOFT_TEAMS',
  jira: 'JIRA',
  zoom: 'ZOOM',
};

export function buildSimulationJob(organizationId: string, input: SimulatedIncomingMessage): IncomingMessageJob {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    organizationId,
    provider: providerMap[input.source_platform],
    externalId: input.external_id ?? `sim-${input.source_platform}-${Date.parse(timestamp)}-${input.message.length}`,
    channel: input.channel ?? `${input.source_platform}-simulation`,
    sender: input.sender_name,
    senderEmail: input.sender_email,
    timestamp,
    message: input.message,
    rawPayload: {
      simulation: true,
      source_platform: input.source_platform,
      sender_name: input.sender_name,
      sender_email: input.sender_email,
      timestamp,
    },
  };
}

export function sourcePlatformFromProvider(provider: IncomingMessageJob['provider']) {
  const map: Record<IncomingMessageJob['provider'], SimulatedSourcePlatform> = {
    SLACK: 'slack',
    GMAIL: 'gmail',
    OUTLOOK: 'outlook',
    MICROSOFT_TEAMS: 'teams',
    JIRA: 'jira',
    ZOOM: 'zoom',
  };
  return map[provider];
}
