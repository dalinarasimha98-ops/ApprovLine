import crypto from 'crypto';
import type { Integration, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import { decryptJson, encryptJson } from '@/utils/encryption';

export const TEAMS_READ_ONLY_SCOPES = [
  'offline_access',
  'User.Read',
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Read.All',
].join(' ');

type TeamsStatePayload = {
  organizationId: string;
  userId: string;
  createdAt: number;
};

type TeamsTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type StoredTeamsTokens = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
  tenant_id?: string;
};

type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
};

export type TeamsProfile = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

export type TeamsTeam = {
  id: string;
  displayName?: string;
};

export type TeamsChannel = {
  id: string;
  displayName?: string;
  webUrl?: string;
};

export type TeamsMessage = {
  id: string;
  createdDateTime?: string;
  webUrl?: string;
  subject?: string | null;
  body?: {
    content?: string;
    contentType?: string;
  };
  from?: {
    user?: {
      id?: string;
      displayName?: string;
      userIdentityType?: string;
    };
  };
};

export interface TeamsSyncResult {
  queued: number;
  processedImmediately: number;
  teamsProcessed: number;
  channelsProcessed: number;
  messagesProcessed: number;
}

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-teams-state-secret';
}

export function signTeamsState(payload: { organizationId: string; userId: string; createdAt?: number }) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyTeamsState(state: string): TeamsStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TeamsStatePayload;
  if (Date.now() - payload.createdAt > 10 * 60_000) return null;
  return payload;
}

export function teamsRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/teams/callback', base).toString();
}

function microsoftTenantSegment() {
  return env.MICROSOFT_TENANT_ID ?? 'organizations';
}

function microsoftOAuthUrl(path: 'authorize' | 'token') {
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantSegment())}/oauth2/v2.0/${path}`;
}

export function buildTeamsInstallUrl(input: { requestUrl: string; state: string }) {
  if (!env.MICROSOFT_CLIENT_ID) {
    throw new Error('MICROSOFT_CLIENT_ID is not configured');
  }

  const url = new URL(microsoftOAuthUrl('authorize'));
  url.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID);
  url.searchParams.set('redirect_uri', teamsRedirectUri(input.requestUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', TEAMS_READ_ONLY_SCOPES);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', input.state);
  return url;
}

export async function exchangeTeamsOAuthCode(input: { code: string; requestUrl: string }) {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft OAuth client credentials are not configured');
  }

  const response = await fetch(microsoftOAuthUrl('token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: teamsRedirectUri(input.requestUrl),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Microsoft OAuth exchange failed');
  }
  return payload as TeamsTokenPayload;
}

function decodeJwtPayload(token?: string) {
  if (!token) return {};
  const [, payload] = token.split('.');
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function teamsTenantIdFromToken(tokens: Pick<TeamsTokenPayload, 'id_token'>) {
  const payload = decodeJwtPayload(tokens.id_token);
  return typeof payload.tid === 'string' ? payload.tid : undefined;
}

export function storedTeamsTokens(tokens: TeamsTokenPayload): StoredTeamsTokens {
  if (!tokens.access_token) throw new Error('Microsoft did not return an access token');
  if (!tokens.refresh_token) throw new Error('Microsoft did not return a refresh token. Reconnect and approve offline access.');
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type,
    tenant_id: teamsTenantIdFromToken(tokens),
  };
}

function readEncryptedTokens(integration: Pick<Integration, 'encryptedTokens'>): StoredTeamsTokens {
  const encrypted = integration.encryptedTokens as EncryptedPayload | null;
  if (!encrypted?.iv || !encrypted.tag || !encrypted.data) {
    throw new Error('Microsoft Teams tokens are missing');
  }
  return decryptJson<StoredTeamsTokens>(encrypted);
}

export async function refreshTeamsAccessToken(integration: Pick<Integration, 'id' | 'encryptedTokens' | 'metadata'>) {
  const tokens = readEncryptedTokens(integration);
  if (!tokens.refresh_token) {
    throw new Error('Microsoft Teams refresh token is missing; reconnect Teams');
  }

  if (tokens.expires_at && tokens.expires_at - 60_000 > Date.now()) {
    return tokens.access_token;
  }

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error('Microsoft OAuth client credentials are not configured');
  }

  const response = await fetch(microsoftOAuthUrl('token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
      scope: TEAMS_READ_ONLY_SCOPES,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to refresh Microsoft Teams token');
  }

  const updatedTokens: StoredTeamsTokens = {
    ...tokens,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? tokens.refresh_token,
    expires_at: payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : tokens.expires_at,
    scope: payload.scope ?? tokens.scope,
    token_type: payload.token_type ?? tokens.token_type,
    tenant_id: teamsTenantIdFromToken(payload) ?? tokens.tenant_id,
  };
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      encryptedTokens: encryptJson(updatedTokens),
      metadata: {
        ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
        tenantId: updatedTokens.tenant_id,
        lastTokenRefreshAt: new Date().toISOString(),
      },
    },
  });
  return updatedTokens.access_token;
}

export async function fetchTeamsProfile(accessToken: string): Promise<TeamsProfile> {
  return graphFetch<TeamsProfile>(accessToken, '/me');
}

async function graphFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message ?? payload.error_description ?? payload.error ?? 'Microsoft Graph request failed');
  }
  return payload as T;
}

function stripHtml(value?: string) {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamsMessageLink(teamId: string, channelId: string, message: TeamsMessage) {
  if (message.webUrl) return message.webUrl;
  return `https://teams.microsoft.com/l/message/${encodeURIComponent(channelId)}/${encodeURIComponent(message.id)}?groupId=${encodeURIComponent(teamId)}`;
}

export function teamsMessageToJob(input: {
  organizationId: string;
  integrationId: string;
  tenantId?: string;
  team: TeamsTeam;
  channel: TeamsChannel;
  message: TeamsMessage;
}): IncomingMessageJob {
  const body = stripHtml(input.message.body?.content);
  const sender = input.message.from?.user?.displayName ?? 'Unknown Teams user';
  const timestamp = input.message.createdDateTime;
  const sourceLink = teamsMessageLink(input.team.id, input.channel.id, input.message);
  const teamName = input.team.displayName ?? input.team.id;
  const channelName = input.channel.displayName ?? input.channel.id;

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'MICROSOFT_TEAMS',
    externalId: input.message.id,
    channel: `${teamName} / ${channelName}`,
    sender,
    timestamp,
    sourceLink,
    message: [
      `Microsoft Teams team: ${teamName}`,
      `Channel: ${channelName}`,
      `Sender: ${sender}`,
      timestamp ? `Timestamp: ${timestamp}` : '',
      input.message.subject ? `Subject: ${input.message.subject}` : '',
      body,
    ].filter(Boolean).join('\n'),
    rawPayload: {
      sourcePlatform: 'teams',
      microsoftTenantId: input.tenantId,
      microsoftTeamId: input.team.id,
      microsoftTeamName: teamName,
      microsoftChannelId: input.channel.id,
      microsoftChannelName: channelName,
      microsoftMessageId: input.message.id,
      senderName: sender,
      senderUserId: input.message.from?.user?.id,
      timestamp,
      sourceLink,
      body,
    },
  };
}

export async function syncTeamsIntegration(integration: Integration, input?: { maxTeams?: number; maxChannels?: number; maxMessages?: number }) {
  const accessToken = await refreshTeamsAccessToken(integration);
  const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
  const tenantId = typeof metadata.tenantId === 'string' ? metadata.tenantId : undefined;
  const maxTeams = input?.maxTeams ?? 8;
  const maxChannels = input?.maxChannels ?? 8;
  const maxMessages = input?.maxMessages ?? 12;

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'teams.sync.started',
      payload: { maxTeams, maxChannels, maxMessages } as Prisma.InputJsonValue,
    },
  });

  const teamList = await graphFetch<{ value?: TeamsTeam[] }>(accessToken, `/me/joinedTeams?$top=${maxTeams}`);
  let queued = 0;
  let processedImmediately = 0;
  let teamsProcessed = 0;
  let channelsProcessed = 0;
  let messagesProcessed = 0;

  for (const team of (teamList.value ?? []).slice(0, maxTeams)) {
    teamsProcessed += 1;
    const channelList = await graphFetch<{ value?: TeamsChannel[] }>(
      accessToken,
      `/teams/${encodeURIComponent(team.id)}/channels?$top=${maxChannels}`,
    );
    for (const channel of (channelList.value ?? []).slice(0, maxChannels)) {
      channelsProcessed += 1;
      const messageList = await graphFetch<{ value?: TeamsMessage[] }>(
        accessToken,
        `/teams/${encodeURIComponent(team.id)}/channels/${encodeURIComponent(channel.id)}/messages?$top=${maxMessages}`,
      );
      for (const message of messageList.value ?? []) {
        messagesProcessed += 1;
        const job = teamsMessageToJob({
          organizationId: integration.organizationId,
          integrationId: integration.id,
          tenantId,
          team,
          channel,
          message,
        });
        const queuedMessage = await enqueueIncomingMessage(job);
        if (queuedMessage.queued) {
          queued += 1;
        } else {
          await processIncomingMessage(job, { auditAction: 'integration.teams.message_processed_without_queue' });
          processedImmediately += 1;
        }
      }
    }
  }

  const previousProcessed = typeof metadata.totalTeamsMessagesProcessed === 'number' ? metadata.totalTeamsMessagesProcessed : 0;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: 'CONNECTED',
      metadata: {
        ...metadata,
        tenantId,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        totalTeamsMessagesProcessed: previousProcessed + messagesProcessed,
        lastTeamsProcessed: teamsProcessed,
        lastChannelsProcessed: channelsProcessed,
      },
    },
  });

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'teams.sync.completed',
      payload: { queued, processedImmediately, teamsProcessed, channelsProcessed, messagesProcessed } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return { queued, processedImmediately, teamsProcessed, channelsProcessed, messagesProcessed } satisfies TeamsSyncResult;
}

export async function syncAllTeamsIntegrations(input?: { maxTeams?: number; maxChannels?: number; maxMessages?: number }) {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'MICROSOFT_TEAMS', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncTeamsIntegration(integration, input) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Microsoft Teams sync failed';
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: reason.toLowerCase().includes('invalid_grant') ? 'NEEDS_REAUTH' : 'ERROR',
          metadata: {
            ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
            lastSyncStatus: 'error',
            lastError: reason,
            lastErrorAt: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      await prisma.event.create({
        data: {
          organizationId: integration.organizationId,
          integrationId: integration.id,
          type: 'teams.sync.error',
          payload: { reason } as Prisma.InputJsonValue,
          failedAt: new Date(),
          failureReason: reason,
        },
      }).catch(() => null);
      results.push({ integrationId: integration.id, error: reason });
    }
  }
  return results;
}
