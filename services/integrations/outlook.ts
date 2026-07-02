import crypto from 'crypto';
import type { Integration, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import { decryptJson, encryptJson } from '@/utils/encryption';

export const OUTLOOK_READ_ONLY_SCOPES = ['offline_access', 'User.Read', 'Mail.Read'].join(' ');

type OutlookStatePayload = {
  organizationId: string;
  userId: string;
  createdAt: number;
};

type OutlookTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type StoredOutlookTokens = {
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

type OutlookRecipient = {
  emailAddress?: {
    name?: string;
    address?: string;
  };
};

export type OutlookProfile = {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

export type OutlookMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  conversationId?: string;
  webLink?: string;
  internetMessageId?: string;
  from?: OutlookRecipient;
  sender?: OutlookRecipient;
  toRecipients?: OutlookRecipient[];
  ccRecipients?: OutlookRecipient[];
  body?: {
    contentType?: string;
    content?: string;
  };
};

export interface OutlookSyncResult {
  queued: number;
  processedImmediately: number;
  emailsProcessed: number;
}

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-outlook-state-secret';
}

function microsoftTenantSegment() {
  return env.MICROSOFT_TENANT_ID ?? 'organizations';
}

function microsoftOAuthUrl(path: 'authorize' | 'token') {
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantSegment())}/oauth2/v2.0/${path}`;
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

function metadataObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function emailName(recipient?: OutlookRecipient) {
  return recipient?.emailAddress?.name ?? recipient?.emailAddress?.address ?? '';
}

function emailAddress(recipient?: OutlookRecipient) {
  return recipient?.emailAddress?.address?.toLowerCase() ?? '';
}

function recipientsList(recipients?: OutlookRecipient[]) {
  return (recipients ?? [])
    .map((recipient) => {
      const name = emailName(recipient);
      const email = emailAddress(recipient);
      return name && email && name !== email ? `${name} <${email}>` : email || name;
    })
    .filter(Boolean)
    .join(', ');
}

export function signOutlookState(payload: { organizationId: string; userId: string; createdAt?: number }) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyOutlookState(state: string): OutlookStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OutlookStatePayload;
  if (Date.now() - payload.createdAt > 10 * 60_000) return null;
  return payload;
}

export function outlookRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/outlook/callback', base).toString();
}

export function buildOutlookInstallUrl(input: { requestUrl: string; state: string }) {
  if (!env.MICROSOFT_CLIENT_ID) {
    throw new Error('MICROSOFT_CLIENT_ID is not configured');
  }

  const url = new URL(microsoftOAuthUrl('authorize'));
  url.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID);
  url.searchParams.set('redirect_uri', outlookRedirectUri(input.requestUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', OUTLOOK_READ_ONLY_SCOPES);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', input.state);
  return url;
}

export async function exchangeOutlookOAuthCode(input: { code: string; requestUrl: string }) {
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
      redirect_uri: outlookRedirectUri(input.requestUrl),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Microsoft Outlook OAuth exchange failed');
  }
  return payload as OutlookTokenPayload;
}

export function outlookTenantIdFromToken(tokens: Pick<OutlookTokenPayload, 'id_token'>) {
  const payload = decodeJwtPayload(tokens.id_token);
  return typeof payload.tid === 'string' ? payload.tid : undefined;
}

export function storedOutlookTokens(tokens: OutlookTokenPayload): StoredOutlookTokens {
  if (!tokens.access_token) throw new Error('Microsoft did not return an access token');
  if (!tokens.refresh_token) throw new Error('Microsoft did not return a refresh token. Reconnect and approve offline access.');
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type,
    tenant_id: outlookTenantIdFromToken(tokens),
  };
}

function readEncryptedTokens(integration: Pick<Integration, 'encryptedTokens'>): StoredOutlookTokens {
  const encrypted = integration.encryptedTokens as EncryptedPayload | null;
  if (!encrypted?.iv || !encrypted.tag || !encrypted.data) {
    throw new Error('Outlook tokens are missing');
  }
  return decryptJson<StoredOutlookTokens>(encrypted);
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

export async function refreshOutlookAccessToken(integration: Pick<Integration, 'id' | 'encryptedTokens' | 'metadata'>) {
  const tokens = readEncryptedTokens(integration);
  if (!tokens.refresh_token) {
    throw new Error('Outlook refresh token is missing; reconnect Outlook');
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
      scope: OUTLOOK_READ_ONLY_SCOPES,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to refresh Outlook token');
  }

  const updatedTokens: StoredOutlookTokens = {
    ...tokens,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? tokens.refresh_token,
    expires_at: payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : tokens.expires_at,
    scope: payload.scope ?? tokens.scope,
    token_type: payload.token_type ?? tokens.token_type,
    tenant_id: outlookTenantIdFromToken(payload) ?? tokens.tenant_id,
  };
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      encryptedTokens: encryptJson(updatedTokens),
      metadata: {
        ...metadataObject(integration.metadata),
        tenantId: updatedTokens.tenant_id,
        lastTokenRefreshAt: new Date().toISOString(),
      },
    },
  });
  return updatedTokens.access_token;
}

export async function fetchOutlookProfile(accessToken: string): Promise<OutlookProfile> {
  return graphFetch<OutlookProfile>(accessToken, '/me');
}

export function outlookMessageToJob(input: {
  organizationId: string;
  integrationId: string;
  tenantId?: string;
  accountEmail?: string;
  message: OutlookMessage;
}): IncomingMessageJob {
  const sender = input.message.from ?? input.message.sender;
  const senderName = emailName(sender) || 'Unknown Outlook sender';
  const senderEmail = emailAddress(sender);
  const to = recipientsList(input.message.toRecipients);
  const cc = recipientsList(input.message.ccRecipients);
  const timestamp = input.message.receivedDateTime ?? input.message.sentDateTime;
  const body = stripHtml(input.message.body?.content) || input.message.bodyPreview || '';
  const subject = input.message.subject ?? '(no subject)';
  const sourceLink = input.message.webLink ?? `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(input.message.id)}`;

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'OUTLOOK',
    externalId: input.message.id,
    channel: subject,
    sender: senderName,
    senderEmail,
    timestamp,
    sourceLink,
    message: [
      `Subject: ${subject}`,
      `From: ${senderName}${senderEmail ? ` <${senderEmail}>` : ''}`,
      to ? `To: ${to}` : '',
      cc ? `Cc: ${cc}` : '',
      timestamp ? `Timestamp: ${timestamp}` : '',
      body,
    ].filter(Boolean).join('\n'),
    rawPayload: {
      sourcePlatform: 'outlook',
      microsoftTenantId: input.tenantId,
      accountEmail: input.accountEmail,
      outlookMessageId: input.message.id,
      outlookInternetMessageId: input.message.internetMessageId,
      outlookConversationId: input.message.conversationId,
      subject,
      senderName,
      senderEmail,
      recipients: { to, cc },
      timestamp,
      sourceLink,
      bodyPreview: input.message.bodyPreview,
    },
  };
}

export async function syncOutlookIntegration(integration: Integration, input?: { maxMessages?: number; query?: string }) {
  const accessToken = await refreshOutlookAccessToken(integration);
  const metadata = metadataObject(integration.metadata);
  const tenantId = typeof metadata.tenantId === 'string' ? metadata.tenantId : undefined;
  const accountEmail = typeof metadata.accountEmail === 'string' ? metadata.accountEmail : integration.externalAccount ?? undefined;
  const maxMessages = input?.maxMessages ?? 25;
  const filter = input?.query ?? "receivedDateTime ge 2026-01-01T00:00:00Z";

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'outlook.sync.started',
      payload: { maxMessages, filter } as Prisma.InputJsonValue,
    },
  });

  const params = new URLSearchParams({
    '$top': String(maxMessages),
    '$orderby': 'receivedDateTime desc',
    '$select': 'id,subject,bodyPreview,receivedDateTime,sentDateTime,conversationId,webLink,internetMessageId,from,sender,toRecipients,ccRecipients,body',
  });
  if (filter) params.set('$filter', filter);
  const list = await graphFetch<{ value?: OutlookMessage[] }>(accessToken, `/me/messages?${params.toString()}`);

  let queued = 0;
  let processedImmediately = 0;
  let emailsProcessed = 0;
  for (const message of list.value ?? []) {
    emailsProcessed += 1;
    const job = outlookMessageToJob({
      organizationId: integration.organizationId,
      integrationId: integration.id,
      tenantId,
      accountEmail,
      message,
    });
    const queuedMessage = await enqueueIncomingMessage(job);
    if (queuedMessage.queued) {
      queued += 1;
    } else {
      await processIncomingMessage(job, { auditAction: 'integration.outlook.email_processed_without_queue' });
      processedImmediately += 1;
    }
  }

  const previousProcessed = typeof metadata.totalEmailsProcessed === 'number' ? metadata.totalEmailsProcessed : 0;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: 'CONNECTED',
      metadata: {
        ...metadata,
        tenantId,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        totalEmailsProcessed: previousProcessed + emailsProcessed,
        lastOutlookEmailsProcessed: emailsProcessed,
      },
    },
  });

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'outlook.sync.completed',
      payload: { queued, processedImmediately, emailsProcessed, filter } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return { queued, processedImmediately, emailsProcessed } satisfies OutlookSyncResult;
}

export async function syncAllOutlookIntegrations(input?: { maxMessages?: number; query?: string }) {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'OUTLOOK', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncOutlookIntegration(integration, input) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Outlook sync failed';
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: reason.toLowerCase().includes('invalid_grant') ? 'NEEDS_REAUTH' : 'ERROR',
          metadata: {
            ...metadataObject(integration.metadata),
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
          type: 'outlook.sync.error',
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
